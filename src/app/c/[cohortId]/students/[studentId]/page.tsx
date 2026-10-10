import { cohortCapabilities } from "@/lib/authz";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands, getGraduation } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { getStudent, getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForStudent } from "@/lib/data/outcomes";
import { aggregateCohort, attendanceSince } from "@/lib/domain/metrics";
import { studentIntervention, studentLifecycle } from "@/lib/domain/student-state";
import { SectionTabs } from "@/components/ui/section-tabs";
import { AttendanceLog, EnrolmentHistory } from "@/components/students/attendance-log";
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
  const { cohortId: routeParam, studentId } = await params;
  await requireUser();

  const supabase = await createClient();
  // Only getStudents/getLessonEvents below actually need the resolved
  // cohort id — everything else here depends on studentId (already known
  // from params) or nothing at all, so it all runs alongside resolving
  // the cohort instead of waiting behind it.
  const [[cohort, bands], student, outcomes] = await Promise.all([
    getCohortWithBands(supabase, routeParam),
    getStudent(supabase, studentId),
    getOutcomesForStudent(supabase, studentId),
  ]);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_student")) notFound();

  const [students, lessonEvents] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
  ]);

  if (!student || student.cohortId !== cohortId) notFound();

  const today = todayISO();
  const agg = aggregateCohort(students, lessonEvents, bands, today);
  const studentAgg = agg.roster.find((s) => s.id === studentId);
  if (!studentAgg) notFound();

  const latestOutcome = outcomes[0] ?? null;
  const canRecord = caps.has("manage_followups");
  const sinceProgress =
    latestOutcome?.kind === "catchup" ? attendanceSince(student, lessonEvents, latestOutcome.recordedAt, today) : null;

  const showPastoral = caps.has("view_followups");
  const graduation = (await getGraduation(cohort, agg.roster, lessonEvents))?.get(studentId) ?? null;
  const cohortFinished = graduation !== null || (studentAgg.leftAt == null && cohort.status === "complete");
  const lifecycle = studentLifecycle(studentAgg, cohortFinished, graduation?.graduated ?? false);
  const intervention = showPastoral ? studentIntervention(studentAgg, latestOutcome?.kind ?? null, today) : undefined;

  const details = (
    <DetailsCard
      cohortId={cohortId}
      student={student}
      cohortName={cohort.name}
      facilitatorName={cohort.facilitatorName}
      canEdit={caps.has("edit_student")}
    />
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title={student.fullName} subtitle={cohort.name} />
      <Link href={`/c/${cohort.slug}/students`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-700 hover:underline">
        <ArrowLeft size={14} /> All students
      </Link>

      <ProfileCard student={studentAgg} lifecycle={lifecycle} intervention={intervention} graduation={graduation} />

      <SectionTabs
        tabs={[
          {
            id: "attendance",
            label: "Attendance",
            content: (
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <AttendanceLog student={student} lessonEvents={lessonEvents} today={today} />
                <div className="flex flex-col gap-4">
                  <AttendanceTrendCard student={student} lessonEvents={lessonEvents} bands={bands} today={today} />
                </div>
              </div>
            ),
          },
          {
            id: "progress",
            label: "Progress",
            content: (
              <AttendanceByClassCard cohortId={cohortId} studentId={studentId} lessonEvents={lessonEvents} canRecord={canRecord} />
            ),
          },
          ...(showPastoral
            ? [
                {
                  id: "followup",
                  label: "Follow-up & catch-up",
                  content: (
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                  ),
                },
              ]
            : []),
          {
            id: "history",
            label: "History",
            content: (
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                {showPastoral ? (
                  <HistoryCard student={studentAgg} latestOutcome={latestOutcome} bands={bands} cohortName={cohort.name} city={cohort.city} />
                ) : (
                  details
                )}
                <EnrolmentHistory student={student} />
              </div>
            ),
          },
          ...(showPastoral ? [{ id: "details", label: "Details", content: details }] : []),
        ]}
      />
    </div>
  );
}
