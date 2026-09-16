import { notFound } from "next/navigation";
import { NAV_BY_ROLE, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBands, getCohort } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { getAuditLogForCohort } from "@/lib/data/audit";
import { computePace, lessonStats } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { ReportsView } from "@/components/reports/reports-view";
import type { ReportLesson } from "@/components/reports/report-utils";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("reports")) notFound();

  const supabase = await createClient();
  // getBands doesn't depend on the cohort at all, so it runs alongside
  // resolving it rather than waiting behind it.
  const [cohort, bands] = await Promise.all([getCohort(supabase, routeParam), getBands(supabase)]);
  if (!cohort) notFound();
  const cohortId = cohort.id;

  // audit_log is admin-read-only by RLS (nothing pastoral in it, but no
  // broader read policy exists either) — read it through the admin client,
  // same as the couple of other cross-cutting reads elsewhere in the app
  // that need to see past what RLS alone would allow this viewer's role.
  const [allStudents, majorChanges] = await Promise.all([
    getStudents(supabase, cohortId),
    getAuditLogForCohort(createAdminClient(), cohortId),
  ]);

  // Left students stop counting toward the cohort's own numbers, same as
  // Dashboard/Attention — otherwise this report (and its CSV export)
  // disagrees with those pages for a cohort with any departures.
  const students = allStudents.filter((s) => !s.leftAt);
  const activeIds = new Set(students.map((s) => s.id));
  const enrolled = students.length;
  let lessons: ReportLesson[];

  if (user.role === "teacher") {
    const pub = await getLessonEventsPublic(supabase, cohortId);
    lessons = pub.map((p) => ({
      eventId: p.eventId,
      date: p.date,
      globalIndex: p.globalIndex,
      classIndex: p.classIndex,
      classNumber: p.classNumber,
      lessonRef: p.lessonRef,
      lessonTitle: p.lessonTitle,
      recorded: p.recorded,
      present: p.present,
      absent: p.absent,
      rate: p.rate,
    }));
  } else {
    const full = await getLessonEvents(supabase, cohortId);
    lessons = full.map((e) => {
      const stats = lessonStats(e, activeIds);
      return {
        eventId: e.eventId,
        date: e.date,
        globalIndex: e.globalIndex,
        classIndex: e.classIndex,
        classNumber: e.classNumber,
        lessonRef: e.lessonRef,
        lessonTitle: e.lessonTitle,
        recorded: stats !== null,
        present: stats?.present ?? null,
        absent: stats?.absent ?? null,
        rate: stats?.rate ?? null,
      };
    });
  }

  const today = todayISO();
  const recordedCount = lessons.filter((l) => l.recorded).length;
  const pace = computePace(cohort, recordedCount, today);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Reports" subtitle={cohort.name} />
      <ReportsView
        cohortName={cohort.name}
        lessons={lessons}
        majorChanges={majorChanges}
        enrolled={enrolled}
        bands={bands}
        today={today}
        paceGap={pace.gap}
      />
    </div>
  );
}
