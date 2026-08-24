import { notFound } from "next/navigation";
import { CheckCircle, WarningCircle, BookOpen, Star } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { aggregateCohort, isRecorded, lessonStats } from "@/lib/domain/metrics";
import { CURRICULUM, classSpans } from "@/lib/domain/curriculum";
import { upcomingBirthdays } from "@/lib/domain/birthdays";
import { todayISO } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/lib/roles";
import { PageHead } from "@/components/shell/page-head";
import { KpiRow, KpiCard, type DeltaTone } from "@/components/dashboard/kpi-card";
import { AttendanceChart, type ChartBar } from "@/components/dashboard/attendance-chart";
import { UpNext, type UpNextRow } from "@/components/dashboard/up-next";
import { NeedsAttentionTable } from "@/components/dashboard/needs-attention-table";
import { UpcomingBirthdaysCard } from "@/components/dashboard/upcoming-birthdays";
import type { Student } from "@/lib/domain/types";

function buildChartBars(lessons: { globalIndex: number; lessonRef: string; rate: number }[]): ChartBar[] {
  return lessons.slice(-16).map((l) => ({
    label: `L${l.globalIndex + 1}`,
    title: `${l.lessonRef} · ${l.rate}%`,
    rate: l.rate,
  }));
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [cohort, bands] = await Promise.all([getCohort(supabase, cohortId), getBands(supabase)]);
  if (!cohort) notFound();
  const today = todayISO();
  const spans = classSpans();

  let recordedCount = 0;
  let rate = 0;
  let quizAvg = 0;
  let chartBars: ChartBar[] = [];
  let upNext: UpNextRow[] = [];
  let attentionRows: Awaited<ReturnType<typeof aggregateCohort>>["roster"] | null = null;
  let atRiskCount = 0;
  let enrolled = 0;
  let studentsForBirthdays: Student[] = [];

  if (user.role === "teacher") {
    const [pub, students] = await Promise.all([
      getLessonEventsPublic(supabase, cohortId),
      getStudents(supabase, cohortId),
    ]);
    studentsForBirthdays = students;
    const recorded = pub.filter((p) => p.recorded);
    recordedCount = recorded.length;
    enrolled = pub[0]?.enrolled ?? 0;
    const totalPresent = recorded.reduce((a, p) => a + (p.present ?? 0), 0);
    rate = enrolled && recordedCount ? Math.round((totalPresent / (enrolled * recordedCount)) * 100) : 0;
    const quizLessons = recorded.filter((p) => p.hasQuiz && p.quizAvg !== null);
    quizAvg = quizLessons.length
      ? Math.round(quizLessons.reduce((a, p) => a + (p.quizAvg ?? 0), 0) / quizLessons.length)
      : 0;
    chartBars = buildChartBars(recorded.map((p) => ({ globalIndex: p.globalIndex, lessonRef: p.lessonRef, rate: p.rate ?? 0 })));

    const outstanding = pub.filter((p) => !p.recorded && p.date <= today).sort((a, b) => a.globalIndex - b.globalIndex);
    const upcoming = pub.filter((p) => !p.recorded && p.date > today).slice(0, outstanding.length ? 3 : 4);
    upNext = [...outstanding.slice(0, 1), ...upcoming].map((p) => {
      const [, m, d] = p.date.split("-");
      const outstandingFlag = !p.recorded && p.date <= today;
      return {
        href: `/c/${cohortId}/lessons`,
        day: String(Number(d)),
        month: new Date(2000, Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short" }),
        title: p.lessonTitle,
        meta: outstandingFlag ? `${p.lessonRef} · taught` : `${p.lessonRef} · ${p.hasQuiz ? "quiz lesson" : "scheduled"}`,
        outstanding: outstandingFlag,
      };
    });
  } else {
    const [students, lessonEvents] = await Promise.all([
      getStudents(supabase, cohortId),
      getLessonEvents(supabase, cohortId),
    ]);
    studentsForBirthdays = students;
    const agg = aggregateCohort(students, lessonEvents, bands, today);
    recordedCount = agg.recordedCount;
    rate = agg.rate;
    quizAvg = agg.quizAvg;
    enrolled = agg.enrolled;
    atRiskCount = agg.atRisk;

    const recorded = lessonEvents.filter(isRecorded);
    chartBars = buildChartBars(
      recorded.map((e) => ({ globalIndex: e.globalIndex, lessonRef: e.lessonRef, rate: lessonStats(e, agg.enrolled)!.rate }))
    );

    const upcoming = lessonEvents.filter((e) => !isRecorded(e) && e.date > today).slice(0, agg.outstanding.length ? 3 : 4);
    upNext = [...agg.outstanding.slice(0, 1), ...upcoming].map((e) => {
      const [, m, d] = e.date.split("-");
      const outstandingFlag = !isRecorded(e) && e.date <= today;
      return {
        href: `/c/${cohortId}/lessons/${e.eventId}`,
        day: String(Number(d)),
        month: new Date(2000, Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short" }),
        title: e.lessonTitle,
        meta: outstandingFlag ? `${e.lessonRef} · taught` : `${e.lessonRef} · ${e.hasQuiz ? "quiz lesson" : "scheduled"}`,
        outstanding: outstandingFlag,
      };
    });

    attentionRows = agg.roster
      .filter((s) => s.status !== "On track")
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 6);
  }

  let classIndex = spans.findIndex(([a, b]) => recordedCount >= a && recordedCount <= b);
  if (classIndex < 0) classIndex = CURRICULUM.length - 1;
  const currentClass = CURRICULUM[classIndex];

  const attendanceDelta = rate >= bands.activeThreshold ? "On target" : `${bands.activeThreshold - rate} under`;
  const attendanceTone: DeltaTone = rate >= bands.activeThreshold ? "ok" : "bad";
  const quizDelta = quizAvg >= 75 ? "Good" : "Low";
  const quizTone: DeltaTone = quizAvg >= 75 ? "ok" : "warn";

  const birthdays = upcomingBirthdays(studentsForBirthdays, today, 5);
  const canOpenStudent = NAV_BY_ROLE[user.role].includes("students");
  const studentHref = canOpenStudent ? (id: string) => `/c/${cohortId}/students/${id}` : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title={user.role === "leadership" ? "Overview" : "Dashboard"}
        subtitle={`${cohort.name} · Class ${classIndex + 1} of 7`}
      />

      <KpiRow>
        <KpiCard icon={CheckCircle} label="Attendance" value={`${rate}%`} delta={attendanceDelta} deltaTone={attendanceTone} sub={`Target ${bands.activeThreshold}%`} />
        {attentionRows !== null && (
          <KpiCard icon={WarningCircle} label="Needs attention" value={atRiskCount} sub={`of ${enrolled} students`} />
        )}
        <KpiCard icon={BookOpen} label="Lessons recorded" value={`${recordedCount}/80`} sub={`Class ${classIndex + 1} · ${currentClass.title}`} />
        <KpiCard icon={Star} label="Quiz average" value={quizAvg} delta={quizDelta} deltaTone={quizTone} sub="Every 4th lesson" />
      </KpiRow>

      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }}>
        <AttendanceChart bars={chartBars} />
        <UpNext rows={upNext} />
      </div>

      <div
        className="grid gap-4 items-start"
        style={{ gridTemplateColumns: attentionRows !== null ? "minmax(0,1fr) 320px" : "minmax(0,320px)" }}
      >
        {attentionRows !== null && (
          <NeedsAttentionTable
            cohortId={cohortId}
            rows={attentionRows}
            bands={bands}
            attentionHref={`/c/${cohortId}/attention`}
          />
        )}
        <UpcomingBirthdaysCard birthdays={birthdays} studentHref={studentHref} />
      </div>
    </div>
  );
}
