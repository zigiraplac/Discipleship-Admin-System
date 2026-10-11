import { createClient } from "@/lib/supabase/server";
import { getOutcomesForStudent } from "@/lib/data/outcomes";
import { attendanceSince } from "@/lib/domain/metrics";
import { cn } from "@/lib/utils";
import { AttendanceByClassCard } from "@/components/students/attendance-by-class-card";
import { CatchupChecklist } from "@/components/students/catchup-checklist";
import { HistoryCard } from "@/components/students/history-card";
import { NextStepCard } from "@/components/students/next-step-card";
import { DetailsCard } from "@/components/students/details-card";
import type { Capability } from "@/lib/authz/policy";
import type { Bands, Cohort, LessonEventView, Student, StudentAggregate } from "@/lib/domain/types";

/**
 * One student: a card with their name and details (including when they
 * joined), their attendance by class, then follow-up for those who may
 * see it. The caller has already checked `view_student`.
 */
export async function StudentDetail({
  cohort,
  bands,
  caps,
  student,
  studentAgg,
  lessonEvents,
  today,
  compact = false,
}: {
  cohort: Cohort;
  bands: Bands;
  caps: Set<Capability>;
  student: Student;
  studentAgg: StudentAggregate;
  lessonEvents: LessonEventView[];
  today: string;
  /** Narrow container (the Students side panel): stack two-column layouts. */
  compact?: boolean;
}) {
  const cohortId = cohort.id;
  const studentId = student.id;
  const supabase = await createClient();
  const outcomes = await getOutcomesForStudent(supabase, studentId);

  const latestOutcome = outcomes[0] ?? null;
  const canRecord = caps.has("manage_followups");
  const sinceProgress =
    latestOutcome?.kind === "catchup" ? attendanceSince(student, lessonEvents, latestOutcome.recordedAt, today) : null;

  const showPastoral = caps.has("view_followups");
  // Shown in brackets in the attendance title — nothing to show before a lesson is owed.
  const owed = studentAgg.expected > 0;

  const mainAndSide = compact
    ? "grid grid-cols-1 items-start gap-4"
    : "grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]";

  return (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-[18px]")}>
      <DetailsCard
        cohortId={cohortId}
        student={student}
        cohortName={cohort.name}
        facilitatorName={cohort.facilitatorName}
        canEdit={caps.has("edit_student")}
      />

      <AttendanceByClassCard
        cohortId={cohortId}
        student={student}
        lessonEvents={lessonEvents}
        canRecord={canRecord}
        today={today}
        rate={owed ? studentAgg.rate : null}
      />

      {showPastoral && (
        <div className={mainAndSide}>
          {canRecord && latestOutcome?.kind === "catchup" ? (
            <CatchupChecklist cohortId={cohortId} studentId={studentId} lessonEvents={lessonEvents} />
          ) : (
            <HistoryCard student={studentAgg} latestOutcome={latestOutcome} bands={bands} cohortName={cohort.name} city={cohort.city} />
          )}
          <NextStepCard
            cohortId={cohortId}
            student={studentAgg}
            latestOutcome={latestOutcome}
            canRecord={canRecord}
            sinceProgress={sinceProgress}
            bands={bands}
          />
        </div>
      )}
    </div>
  );
}
