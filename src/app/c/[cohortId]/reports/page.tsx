import { notFound } from "next/navigation";
import { NAV_BY_ROLE, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBands, getCohort } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getCrusadeEvents, getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { getCrusadeCompletions } from "@/lib/data/crusades";
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
  const { cohortId } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("reports")) notFound();

  const supabase = await createClient();
  const [cohort, bands, allStudents, crusadeEvents, completedAfterClasses] = await Promise.all([
    getCohort(supabase, cohortId),
    getBands(supabase),
    getStudents(supabase, cohortId),
    getCrusadeEvents(supabase, cohortId),
    getCrusadeCompletions(supabase, cohortId),
  ]);
  if (!cohort) notFound();

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
        cohortId={cohortId}
        cohortName={cohort.name}
        lessons={lessons}
        crusadeEvents={crusadeEvents}
        completedAfterClasses={completedAfterClasses}
        canRecordCrusades={user.role === "facilitator" || user.role === "admin"}
        enrolled={enrolled}
        bands={bands}
        today={today}
        paceGap={pace.gap}
      />
    </div>
  );
}
