import { notFound } from "next/navigation";
import { CheckCircle, WarningCircle, BookOpen, Gauge, SignOut } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { aggregateCohort, isRecorded, lessonStats, computePace, classRate } from "@/lib/domain/metrics";
import { cohortHealth } from "@/lib/domain/bands";
import { CURRICULUM, classSpans } from "@/lib/domain/curriculum";
import { upcomingBirthdays, formatBirthdayDate } from "@/lib/domain/birthdays";
import { todayISO, formatShortDate } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/lib/roles";
import { PageHead } from "@/components/shell/page-head";
import { KpiRow, KpiCard, type DeltaTone } from "@/components/dashboard/kpi-card";
import { AttendanceChart, type ChartBar } from "@/components/dashboard/attendance-chart";
import { UpcomingEventsCard, type UpcomingEventRow } from "@/components/shared/upcoming-events";
import { NeedsAttentionTable } from "@/components/dashboard/needs-attention-table";
import { Greeting } from "@/components/dashboard/greeting";
import { HealthPill } from "@/components/ui/pill";
import { LessonsHeatmap } from "@/components/lessons/lessons-heatmap";
import { buildLessonRows, buildLessonRowsPublic } from "@/components/lessons/lesson-rows";
import type { LessonRow } from "@/components/lessons/lessons-browser";
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

/** Whole days between two ISO dates — used to interleave lessons/crusades
 * and birthdays into one chronological "what's coming up" list. */
function daysFromToday(dateISO: string, todayISO: string): number {
  const [y1, m1, d1] = todayISO.split("-").map(Number);
  const [y2, m2, d2] = dateISO.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

interface UpcomingItem {
  sortKey: number;
  row: UpcomingEventRow;
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
  let lessonItems: UpcomingItem[] = [];
  let attentionRows: Awaited<ReturnType<typeof aggregateCohort>>["roster"] | null = null;
  let atRiskCount = 0;
  let enrolled = 0;
  let leftCount = 0;
  let studentsForBirthdays: Student[] = [];
  // The last curriculum lesson's own (possibly postponed) scheduled date —
  // the real, live-reflowed schedule already answers "when does this
  // finish", so there's no need to re-derive a projection from scratch.
  let finishDate: string | null = null;
  let heatmapRows: LessonRow[] = [];

  const canOpenStudent = NAV_BY_ROLE[user.role].includes("students");
  const studentHref = canOpenStudent ? (id: string) => `/c/${cohortId}/students/${id}` : null;

  if (user.role === "teacher") {
    const [pub, students] = await Promise.all([
      getLessonEventsPublic(supabase, cohortId),
      getStudents(supabase, cohortId),
    ]);
    leftCount = students.filter((s) => s.leftAt).length;
    studentsForBirthdays = students.filter((s) => !s.leftAt);
    finishDate = pub[pub.length - 1]?.date ?? null;
    heatmapRows = buildLessonRowsPublic(pub, bands, today);
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
    const upcoming = pub
      .filter((p) => !p.recorded && p.date > today)
      .sort((a, b) => a.globalIndex - b.globalIndex)
      .slice(0, 5);
    lessonItems = [...outstanding.slice(0, 2), ...upcoming].map((p) => {
      const outstandingFlag = !p.recorded && p.date <= today;
      return {
        sortKey: daysFromToday(p.date, today),
        row: {
          id: p.eventId,
          tone: outstandingFlag ? "magenta" : "cyan",
          kind: "lesson",
          title: p.lessonTitle,
          meta: outstandingFlag ? `${p.lessonRef} · no register` : p.lessonRef,
          dateLabel: formatShortDate(p.date),
          href: `/c/${cohortId}/lessons`,
        },
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
    const activeIds = new Set(students.map((s) => s.id));
    finishDate = lessonEvents[lessonEvents.length - 1]?.date ?? null;
    heatmapRows = buildLessonRows(lessonEvents, activeIds, bands, today);
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
        rate: lessonStats(e, activeIds)?.rate ?? 0,
      })),
      today
    );
    classBars = classBarsFromRates(CURRICULUM.map((_, ci) => classRate(lessonEvents, ci, activeIds)));

    const upcoming = lessonEvents
      .filter((e) => !isRecorded(e) && e.date > today)
      .slice(0, 5);
    lessonItems = [...agg.outstanding.slice(0, 2), ...upcoming].map((e) => {
      const outstandingFlag = !isRecorded(e) && e.date <= today;
      return {
        sortKey: daysFromToday(e.date, today),
        row: {
          id: e.eventId,
          tone: outstandingFlag ? "magenta" : "cyan",
          kind: "lesson",
          title: e.lessonTitle,
          meta: outstandingFlag ? `${e.lessonRef} · no register` : e.lessonRef,
          dateLabel: formatShortDate(e.date),
          href: `/c/${cohortId}/lessons/${e.eventId}`,
        },
      };
    });

    attentionRows = agg.roster
      .filter((s) => s.status !== "On track")
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 4);
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

  // Same tiers already shown on the Cohorts switcher list — surfaced here
  // too since that's the only place it showed before, not the dashboard a
  // facilitator actually spends their day on.
  const health = cohortHealth(rate, atRiskCount, enrolled);

  const birthdays = upcomingBirthdays(studentsForBirthdays, today, 5);
  const birthdayItems: UpcomingItem[] = birthdays.map((b) => ({
    sortKey: b.daysUntil,
    row: {
      id: `birthday-${b.studentId}`,
      tone: "yellow",
      kind: "birthday",
      title: b.name,
      meta: "Birthday",
      dateLabel: b.daysUntil === 0 ? "Today" : b.daysUntil === 1 ? "Tomorrow" : formatBirthdayDate(b.day, b.month),
      href: studentHref ? studentHref(b.studentId) : null,
    },
  }));

  // One combined "what's coming up" list — lessons/crusades and
  // birthdays interleaved by how soon they are, the same pattern the
  // Calendar's own "This week" panel already uses, instead of two
  // separate cards competing for the same space.
  const upNext: UpcomingEventRow[] = [...lessonItems, ...birthdayItems]
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, 6)
    .map((i) => i.row);

  const attentionHref = NAV_BY_ROLE[user.role].includes("attention") ? `/c/${cohortId}/attention` : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title={user.role === "leadership" ? "Overview" : "Dashboard"}
        subtitle={`${cohort.name} · Class ${classIndex + 1} of 7`}
      />

      <Greeting name={user.name} right={<HealthPill health={health} />} />

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
          sub={finishDate ? `Ends ${formatShortDate(finishDate)}` : "vs. this cohort's own ideal plan"}
        />
        <KpiCard icon={SignOut} label="Left the program" value={leftCount} sub="No longer tracked in these numbers" />
      </KpiRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <AttendanceChart lessonBars={lessonBars} classBars={classBars} />
          <LessonsHeatmap
            cohortId={cohortId}
            rows={heatmapRows}
            canOpenRegister={user.role === "facilitator" || user.role === "admin"}
          />
        </div>
        <UpcomingEventsCard title="Upcoming" rows={upNext} emptyLabel="Nothing coming up in the next few days." />
      </div>

      {attentionRows !== null && (
        <NeedsAttentionTable
          cohortId={cohortId}
          rows={attentionRows}
          bands={bands}
          attentionHref={attentionHref}
        />
      )}
    </div>
  );
}
