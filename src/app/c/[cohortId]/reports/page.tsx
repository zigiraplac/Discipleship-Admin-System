import { cohortCapabilities } from "@/lib/authz";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getScheduleSegments } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { getAuditLogForCohort } from "@/lib/data/audit";
import { aggregateCohort, computePace, lessonSeats, lessonStats } from "@/lib/domain/metrics";
import { cohortHealth } from "@/lib/domain/bands";
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
  await requireUser();

  const supabase = await createClient();
  // Bands come from the cohort's own branch (a level can set stricter ones).
  const [cohort, bands] = await getCohortWithBands(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_cohort")) notFound();

  // audit_log is admin-read-only by RLS (nothing pastoral in it, but no
  // broader read policy exists either) — read it through the admin client,
  // same as the couple of other cross-cutting reads elsewhere in the app
  // that need to see past what RLS alone would allow this viewer's role.
  const [allStudents, majorChanges, scheduleSegments] = await Promise.all([
    getStudents(supabase, cohortId),
    getAuditLogForCohort(createAdminClient(), cohortId),
    getScheduleSegments(supabase, cohortId),
  ]);

  // Attendance counts everyone enrolled on each lesson's date (leaving
  // later doesn't erase it); `enrolled` is who's in the cohort now.
  const students = allStudents.filter((s) => !s.leftAt);
  const enrolled = students.length;
  const leftCount = allStudents.length - enrolled;
  const today = todayISO();
  let lessons: ReportLesson[];
  // Per-student status (health/needs-follow-up) needs the full register,
  // which RLS blocks for teacher (same reason Dashboard's own "Needs
  // follow up" KPI and table are hidden for that role) — null here means
  // ReportsView leaves those cards out rather than showing a wrong number.
  let insights: { health: ReturnType<typeof cohortHealth>; atRisk: number } | null = null;

  if (!caps.has("view_attendance")) {
    const pub = await getLessonEventsPublic(supabase, cohortId);
    lessons = pub.map((p) => ({
      eventId: p.eventId,
      date: p.date,
      globalIndex: p.globalIndex,
      classIndex: p.classIndex,
      classNumber: p.classNumber,
      lessonRef: p.lessonRef,
      lessonTitle: p.lessonTitle,
      due: p.date <= today,
      recorded: p.recorded,
      expected: p.enrolled,
      present: p.present,
      absent: p.absent,
      rate: p.rate,
    }));
  } else {
    const full = await getLessonEvents(supabase, cohortId);
    lessons = full.map((e) => {
      const stats = lessonStats(e, allStudents);
      const seats = lessonSeats(e, allStudents, today);
      return {
        eventId: e.eventId,
        date: e.date,
        globalIndex: e.globalIndex,
        classIndex: e.classIndex,
        classNumber: e.classNumber,
        lessonRef: e.lessonRef,
        lessonTitle: e.lessonTitle,
        due: seats.due,
        expected: seats.expected,
        recorded: stats !== null,
        present: stats?.present ?? null,
        absent: stats?.absent ?? null,
        rate: stats?.rate ?? null,
      };
    });
    const agg = aggregateCohort(allStudents, full, bands, today);
    insights = { health: cohortHealth(agg.rate, agg.atRisk, agg.enrolled), atRisk: agg.atRisk };
  }

  const recordedCount = lessons.filter((l) => l.recorded).length;
  const pace = computePace(cohort, scheduleSegments, recordedCount, today);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Reports" subtitle={cohort.name} />
      <ReportsView
        cohortName={cohort.name}
        lessons={lessons}
        majorChanges={majorChanges}
        enrolled={enrolled}
        leftCount={leftCount}
        insights={insights}
        bands={bands}
        today={today}
        paceGap={pace.gap}
      />
    </div>
  );
}
