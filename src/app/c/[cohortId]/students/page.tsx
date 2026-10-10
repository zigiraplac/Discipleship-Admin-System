import { cohortCapabilities } from "@/lib/authz";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { aggregateCohort, isRecorded } from "@/lib/domain/metrics";
import { recordedMissStreak } from "@/lib/domain/rollup";
import { getCohortWithBands, getGraduation, getPolicy } from "@/lib/data/org";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { Card } from "@/components/ui/card";
import { StudentsTable, type Filter } from "@/components/students/students-table";
import { AddStudentDialog } from "@/components/students/add-student-dialog";
import type { OutcomeKind } from "@/lib/domain/types";

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ cohortId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  if (!caps.has("view_student")) notFound();

  const [students, lessonEvents, outcomes] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
  ]);

  const agg = aggregateCohort(students, lessonEvents, bands, todayISO());
  const { inactiveStreak } = await getPolicy();
  // "Inactive" = still enrolled, but marked absent at their last N recorded
  // lessons in a row (Settings › Status bands). Recorded absences only —
  // the same definition the organization levels count.
  const recordedNewestFirst = lessonEvents.filter(isRecorded).sort((a, b) => (a.date < b.date ? 1 : -1));
  const inactiveIds = students
    .filter((s) => !s.leftAt && recordedMissStreak(s, recordedNewestFirst) >= inactiveStreak)
    .map((s) => s.id);
  const latest = latestByStudent(outcomes);
  const outcomesByStudent: Record<string, OutcomeKind> = {};
  for (const [studentId, outcome] of latest) outcomesByStudent[studentId] = outcome.kind;
  const activeCount = students.filter((s) => !s.leftAt).length;
  const graduation = await getGraduation(cohort, agg.roster, lessonEvents);
  const f = (await searchParams).filter;
  const filterParam = Array.isArray(f) ? f[0] : f;
  const initialFilter: Filter = filterParam === "On track" || filterParam === "Needs help" || filterParam === "At risk" ? filterParam : "all";

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
          inactiveIds={inactiveIds}
          bands={bands}
          cohortFinished={graduation !== null}
          graduatedIds={[...(graduation ?? new Map())].filter(([, g]) => g.graduated).map(([id]) => id)}
          showIntervention={caps.has("view_followups")}
          initialFilter={initialFilter}
          today={todayISO()}
          headerAction={
            caps.has("edit_student") ? (
              <AddStudentDialog cohortId={cohortId} recordedLessons={recordedLessons} />
            ) : null
          }
        />
      </Card>
    </div>
  );
}
