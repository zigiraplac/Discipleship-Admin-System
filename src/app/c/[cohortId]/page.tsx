import { notFound } from "next/navigation";
import { CheckCircle, WarningCircle, BookOpen, Gauge, SignOut } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { aggregateCohort, isRecorded, lessonStats, computePace, classRate } from "@/lib/domain/metrics";
import { CURRICULUM, classSpans } from "@/lib/domain/curriculum";
import { upcomingBirthdays } from "@/lib/domain/birthdays";
import { todayISO, formatShortDate } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/lib/roles";
import { PageHead } from "@/components/shell/page-head";
import { KpiRow, KpiCard, type DeltaTone } from "@/components/dashboard/kpi-card";
import { AttendanceChart, type ChartBar } from "@/components/dashboard/attendance-chart";
import { UpcomingEventsCard, type UpcomingEventRow } from "@/components/shared/upcoming-events";
import { NeedsAttentionTable } from "@/components/dashboard/needs-attention-table";
import { UpcomingBirthdaysCard } from "@/components/dashboard/upcoming-birthdays";
import { Greeting } from "@/components/dashboard/greeting";
import type { Student } from "@/lib/domain/types";

/** Only lessons already due (recorded or not) — a future, not-yet-taught
 * lesson has nothing to show yet and would just read as a false "0%". A
 * missing register for a due lesson, on the other hand, genuinely is 0%
 * and stays visible as a gap in the trend rather than quietly vanishing. */
function buildLessonBars(
  lessons: { globalIndex: number; lessonRef: string; date: string; recorded: boolean; rate: number }[],
  todayISO: string
): ChartBar[] {
  return lessons
    .filter((l) => l.date <= todayISO)
    .sort((a, b) => a.globalIndex - b.globalIndex)
    .slice(-16)
    .map((l) => ({
      label: `L${l.globalIndex + 1}`,
      title: l.recorded ? `${l.lessonRef} · ${l.rate}%` : `${l.lessonRef} · not recorded`,
      rate: l.recorded ? l.rate : 0,
    }));
}

function classBarsFromRates(rates: (number | null)[]): ChartBar[] {
  return rates.map((rate, ci) => ({
    label: `C${ci + 1}`,
    title: rate === null ? `${CURRICULUM[ci].title} · not started` : `${CURRICULUM[ci].title} · ${rate}%`,
    rate: rate ?? 0,
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
  let lessonBars: ChartBar[] = [];
  let classBars: ChartBar[] = [];
  let upNext: UpcomingEventRow[] = [];
  let attentionRows: Awaited<ReturnType<typeof aggregateCohort>>["roster"] | null = null;
  let atRiskCount = 0;
  let enrolled = 0;
  let leftCount = 0;
  let studentsForBirthdays: Student[] = [];

  if (user.role === "teacher") {
    const [pub, students] = await Promise.all([
      getLessonEventsPublic(supabase, cohortId),
      getStudents(supabase, cohortId),
    ]);
    leftCount = students.filter((s) => s.leftAt).length;
    studentsForBirthdays = students.filter((s) => !s.leftAt);
    const recorded = pub.filter((p) => p.recorded);
    recordedCount = recorded.length;
    enrolled = pub[0]?.enrolled ?? 0;
    const totalPresent = recorded.reduce((a, p) => a + (p.present ?? 0), 0);
    rate = enrolled && recordedCount ? Math.round((totalPresent / (enrolled * recordedCount)) * 100) : 0;
    lessonBars = buildLessonBars(
      pub.map((p) => ({ globalIndex: p.globalIndex, lessonRef: p.lessonRef, date: p.date, recorded: p.recorded, rate: p.rate ?? 0 })),
      today
    );
    classBars = classBarsFromRates(
      CURRICULUM.map((_, ci) => {
        const inClass = pub.filter((p) => p.classIndex === ci && p.recorded);
        if (!inClass.length) return null;
        const totalPresentInClass = inClass.reduce((a, p) => a + (p.present ?? 0), 0);
        const totalEnrolledInClass = inClass.reduce((a, p) => a + (p.enrolled ?? 0), 0);
        return totalEnrolledInClass ? Math.round((totalPresentInClass / totalEnrolledInClass) * 100) : null;
      })
    );

    const outstanding = pub.filter((p) => !p.recorded && p.date <= today).sort((a, b) => a.globalIndex - b.globalIndex);
    const upcoming = pub.filter((p) => !p.recorded && p.date > today).slice(0, outstanding.length ? 3 : 4);
    upNext = [...outstanding.slice(0, 1), ...upcoming].map((p) => {
      const outstandingFlag = !p.recorded && p.date <= today;
      return {
        id: p.eventId,
        tone: outstandingFlag ? "magenta" : "cyan",
        kind: "lesson",
        title: p.lessonTitle,
        meta: outstandingFlag ? `${p.lessonRef} · no register` : p.lessonRef,
        dateLabel: formatShortDate(p.date),
        href: `/c/${cohortId}/lessons`,
      };
    });
  } else {
    const [allStudents, lessonEvents] = await Promise.all([
      getStudents(supabase, cohortId),
      getLessonEvents(supabase, cohortId),
    ]);
    leftCount = allStudents.filter((s) => s.leftAt).length;
    studentsForBirthdays = allStudents.filter((s) => !s.leftAt);
    // A student marked "left" stops counting toward the cohort's own
    // health — the dashboard reflects who's actually still being tracked.
    const students = allStudents.filter((s) => !s.leftAt);
    const agg = aggregateCohort(students, lessonEvents, bands, today);
    recordedCount = agg.recordedCount;
    rate = agg.rate;
    enrolled = agg.enrolled;
    atRiskCount = agg.atRisk;

    lessonBars = buildLessonBars(
      lessonEvents.map((e) => ({
        globalIndex: e.globalIndex,
        lessonRef: e.lessonRef,
        date: e.date,
        recorded: isRecorded(e),
        rate: lessonStats(e, agg.enrolled)?.rate ?? 0,
      })),
      today
    );
    classBars = classBarsFromRates(CURRICULUM.map((_, ci) => classRate(lessonEvents, ci, agg.enrolled)));

    const upcoming = lessonEvents.filter((e) => !isRecorded(e) && e.date > today).slice(0, agg.outstanding.length ? 3 : 4);
    upNext = [...agg.outstanding.slice(0, 1), ...upcoming].map((e) => {
      const outstandingFlag = !isRecorded(e) && e.date <= today;
      return {
        id: e.eventId,
        tone: outstandingFlag ? "magenta" : "cyan",
        kind: "lesson",
        title: e.lessonTitle,
        meta: outstandingFlag ? `${e.lessonRef} · no register` : e.lessonRef,
        dateLabel: formatShortDate(e.date),
        href: `/c/${cohortId}/lessons/${e.eventId}`,
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

  // Never stored — re-derived from the cohort's own ideal plan (real
  // start date, teaching days, lessons/session) vs. what's actually
  // recorded, so postponing a lesson can never leave this stale.
  const pace = computePace(cohort, recordedCount, today);
  const onPace = pace.gap <= 0;

  const birthdays = upcomingBirthdays(studentsForBirthdays, today, 5);
  const canOpenStudent = NAV_BY_ROLE[user.role].includes("students");
  const studentHref = canOpenStudent ? (id: string) => `/c/${cohortId}/students/${id}` : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title={user.role === "leadership" ? "Overview" : "Dashboard"}
        subtitle={`${cohort.name} · Class ${classIndex + 1} of 7`}
      />

      <Greeting
        name={user.name}
        subtitle={`Here's how ${cohort.name} is doing today.`}
      />

      <KpiRow>
        <KpiCard icon={CheckCircle} label="Attendance" value={`${rate}%`} delta={attendanceDelta} deltaTone={attendanceTone} sub={`Target ${bands.activeThreshold}%`} />
        {attentionRows !== null && (
          <KpiCard icon={WarningCircle} label="Needs attention" value={atRiskCount} sub={`of ${enrolled} students`} />
        )}
        <KpiCard
          icon={BookOpen}
          label="Lessons recorded"
          value={`${recordedCount}/80`}
          sub={`Class ${classIndex + 1} · ${currentClass.title}`}
        />
        <KpiCard
          icon={Gauge}
          label="Pace"
          value={onPace ? "On pace" : `${pace.gap} behind`}
          delta={onPace ? "On target" : "Catch up"}
          deltaTone={onPace ? "ok" : "bad"}
          sub="vs. this cohort's own ideal plan"
        />
        <KpiCard icon={SignOut} label="Left the program" value={leftCount} sub="No longer tracked in these numbers" />
      </KpiRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AttendanceChart lessonBars={lessonBars} classBars={classBars} />
        <UpcomingEventsCard title="Up next" rows={upNext} emptyLabel="Nothing left to teach — 80 of 80 recorded." />
      </div>

      {attentionRows !== null ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <NeedsAttentionTable
            cohortId={cohortId}
            rows={attentionRows}
            bands={bands}
            attentionHref={`/c/${cohortId}/attention`}
          />
          <UpcomingBirthdaysCard birthdays={birthdays} studentHref={studentHref} />
        </div>
      ) : (
        <UpcomingBirthdaysCard birthdays={birthdays} studentHref={studentHref} />
      )}
    </div>
  );
}
