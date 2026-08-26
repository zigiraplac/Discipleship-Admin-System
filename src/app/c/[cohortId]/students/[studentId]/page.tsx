import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudent, getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForStudent } from "@/lib/data/outcomes";
import { getCatchupEventIds } from "@/lib/data/catchup";
import { aggregateCohort, attendanceSince } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { ProfileCard } from "@/components/students/profile-card";
import { AttendanceByClassCard } from "@/components/students/attendance-by-class-card";
import { AttendanceTrendCard } from "@/components/students/attendance-trend-card";
import { CatchupChecklist } from "@/components/students/catchup-checklist";
import { HistoryCard } from "@/components/students/history-card";
import { NextStepCard } from "@/components/students/next-step-card";
import { DetailsCard } from "@/components/students/details-card";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ cohortId: string; studentId: string }>;
}) {
  const { cohortId, studentId } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("students")) notFound();

  const supabase = await createClient();
  const [cohort, bands, student, students, lessonEvents, outcomes, caughtUpEventIds] = await Promise.all([
    getCohort(supabase, cohortId),
    getBands(supabase),
    getStudent(supabase, studentId),
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForStudent(supabase, studentId),
    getCatchupEventIds(supabase, studentId),
  ]);

  if (!cohort || !student || student.cohortId !== cohortId) notFound();

  const agg = aggregateCohort(students, lessonEvents, bands, todayISO());
  const studentAgg = agg.roster.find((s) => s.id === studentId);
  if (!studentAgg) notFound();

  const latestOutcome = outcomes[0] ?? null;
  const canRecord = user.role === "facilitator" || user.role === "admin";
  const sinceProgress =
    latestOutcome?.kind === "catchup" ? attendanceSince(studentId, lessonEvents, latestOutcome.recordedAt) : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title={student.fullName} subtitle={cohort.name} />
      <Link href={`/c/${cohortId}/students`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-700 hover:underline">
        <ArrowLeft size={14} /> All students
      </Link>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <ProfileCard student={studentAgg} />
          <AttendanceByClassCard
            cohortId={cohortId}
            studentId={studentId}
            lessonEvents={lessonEvents}
            caughtUpEventIds={[...caughtUpEventIds]}
            canRecord={canRecord}
          />
          {canRecord && latestOutcome?.kind === "catchup" && (
            <CatchupChecklist cohortId={cohortId} studentId={studentId} lessonEvents={lessonEvents} />
          )}
          <AttendanceTrendCard studentId={studentId} lessonEvents={lessonEvents} bands={bands} />
          <HistoryCard
            student={studentAgg}
            latestOutcome={latestOutcome}
            bands={bands}
            cohortName={cohort.name}
            city={cohort.city}
          />
        </div>
        <div className="flex flex-col gap-4">
          <NextStepCard
            cohortId={cohortId}
            student={studentAgg}
            latestOutcome={latestOutcome}
            canRecord={canRecord}
            sinceProgress={sinceProgress}
            bands={bands}
          />
          <DetailsCard
            cohortId={cohortId}
            student={student}
            cohortName={cohort.name}
            facilitatorName={cohort.facilitatorName}
            canEdit={user.role === "admin"}
          />
        </div>
      </div>
    </div>
  );
}
