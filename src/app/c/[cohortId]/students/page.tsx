import { notFound } from "next/navigation";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { aggregateCohort, isRecorded } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { Card } from "@/components/ui/card";
import { StudentsTable } from "@/components/students/students-table";
import { AddStudentDialog } from "@/components/students/add-student-dialog";
import type { OutcomeKind } from "@/lib/domain/types";

export default async function StudentsPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("students")) notFound();

  const supabase = await createClient();
  // getBands doesn't depend on the cohort at all, so it runs alongside
  // resolving it rather than waiting behind it.
  const [cohort, bands] = await Promise.all([getCohort(supabase, routeParam), getBands(supabase)]);
  if (!cohort) notFound();
  const cohortId = cohort.id;

  const [students, lessonEvents, outcomes] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
  ]);

  const agg = aggregateCohort(students, lessonEvents, bands, todayISO());
  const latest = latestByStudent(outcomes);
  const outcomesByStudent: Record<string, OutcomeKind> = {};
  for (const [studentId, outcome] of latest) outcomesByStudent[studentId] = outcome.kind;
  const activeCount = students.filter((s) => !s.leftAt).length;

  // For "Add student"'s attendance-backfill checklist — every already-taken
  // lesson a facilitator might need to tick for someone entered late.
  const recordedLessons = lessonEvents
    .filter(isRecorded)
    .sort((a, b) => a.globalIndex - b.globalIndex)
    .map((e) => ({ eventId: e.eventId, lessonRef: e.lessonRef, lessonTitle: e.lessonTitle, date: e.date }));

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Students" subtitle={`${cohort.name} · ${activeCount} enrolled`} />
      <Card className="overflow-hidden">
        <StudentsTable
          cohortId={cohortId}
          cohortSlug={cohort.slug}
          roster={agg.roster}
          outcomesByStudent={outcomesByStudent}
          bands={bands}
          headerAction={
            user.role === "admin" || user.role === "facilitator" ? (
              <AddStudentDialog cohortId={cohortId} recordedLessons={recordedLessons} />
            ) : null
          }
        />
      </Card>
    </div>
  );
}
