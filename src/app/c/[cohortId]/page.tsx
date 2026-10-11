import { cohortCapabilities } from "@/lib/authz";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { getScheduleSegments } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic, getCrusadeEvents } from "@/lib/data/lessons";
import { getCrusadeReports } from "@/lib/data/crusades";
import { getCatchupCountsByEvent } from "@/lib/data/catchup";
import { aggregateCohort, isRecorded, lessonSeats, seatTotals, computePace } from "@/lib/domain/metrics";
import { cohortHealth } from "@/lib/domain/bands";
import { CURRICULUM, classSpans } from "@/lib/domain/curriculum";
import { upcomingBirthdays, formatBirthdayDate } from "@/lib/domain/birthdays";
import { crusadeWeekends } from "@/components/reports/report-utils";
import { todayISO, formatShortDate } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { KpiRow, KpiCard, type DeltaTone } from "@/components/dashboard/kpi-card";
import { AttendanceCard, type ChartBar } from "@/components/dashboard/attendance-card";
import { UpcomingEventsCard, type UpcomingEventRow } from "@/components/shared/upcoming-events";
import { TopAttendersCard } from "@/components/dashboard/top-attenders-card";
import { HealthPill, Pill } from "@/components/ui/pill";
import { StatusDonut, type DonutSegment } from "@/components/dashboard/status-donut";
import type { Student, StudentAggregate } from "@/lib/domain/types";

/** Only lessons already due (recorded or not) — a future, not-yet-taught
 * lesson has nothing to show yet and would just read as a false "0%". A
 * missing register for a due lesson, on the other hand, genuinely is 0%
 * and stays visible as a gap in the trend rather than quietly vanishing. */
const EMPTY_BAR: Pick<ChartBar, "rate" | "presentPct" | "catchupPct" | "absentPct" | "presentCount" | "absentCount"> = {
  rate: 0,
  presentPct: 0,
  catchupPct: 0,
  absentPct: 0,
  presentCount: 0,
  absentCount: 0,
};

/** `present` excludes catch-up corrections — those are their own segment
 * for the percentage breakdown — so presentPct + catchupPct + absentPct
 * always adds to 100 for a recorded lesson/class. `presentCount`/
 * `absentCount` fold catch-ups into "attended" as raw headcounts, for the
 * simpler two-series Present/Absent bar view. */
function splitBar(present: number, catchup: number, enrolled: number): typeof EMPTY_BAR {
  if (!enrolled) return EMPTY_BAR;
  const presentPct = Math.round((present / enrolled) * 100);
  const catchupPct = Math.round((catchup / enrolled) * 100);
  const absentPct = Math.max(0, 100 - presentPct - catchupPct);
  const presentCount = present + catchup;
  return {
    rate: presentPct + catchupPct,
    presentPct,
    catchupPct,
    absentPct,
    presentCount,
    absentCount: Math.max(0, enrolled - presentCount),
  };
}

function splitBarTitle(ref: string, split: typeof EMPTY_BAR): string {
  if (split.rate === 0 && split.presentPct === 0 && split.absentPct === 0) return `${ref} · not recorded`;
  return split.catchupPct > 0
    ? `${ref} · ${split.rate}% attended (${split.catchupPct}% caught up) · ${split.absentPct}% absent`
    : `${ref} · ${split.rate}% attended · ${split.absentPct}% absent`;
}

function buildLessonBars(
  lessons: {
    globalIndex: number;
    lessonRef: string;
    date: string;
    recorded: boolean;
    present: number;
    catchup: number;
    enrolled: number;
  }[],
  todayISO: string
): ChartBar[] {
  return lessons
    .filter((l) => l.date <= todayISO)
    .sort((a, b) => a.globalIndex - b.globalIndex)
    .slice(-16)
    .map((l) => {
      const split = l.recorded ? splitBar(l.present, l.catchup, l.enrolled) : EMPTY_BAR;
      return { label: `L${l.globalIndex + 1}`, title: splitBarTitle(l.lessonRef, split), ...split };
    });
}

function classBarsFromCounts(
  counts: { present: number; catchup: number; enrolled: number; started: boolean }[]
): ChartBar[] {
  // Same rule buildLessonBars already applies to not-yet-due lessons: a
  // class that hasn't been reached yet has nothing to show, so it's
  // dropped from the array entirely rather than rendered as an empty
  // reserved column — otherwise an early-stage cohort's chart is mostly
  // dead space with one tiny bar, instead of reading like the compact
  // bars the Lessons view already shows.
  return counts
    .map((c, ci) => ({ ...c, classNumber: ci + 1 }))
    .filter((c) => c.started)
    .map((c) => {
      const split = splitBar(c.present, c.catchup, c.enrolled);
      return { label: `C${c.classNumber}`, title: splitBarTitle(CURRICULUM[c.classNumber - 1].title, split), ...split };
    });
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
  const { cohortId: routeParam } = await params;
  await requireUser();
  const supabase = await createClient();

  const [cohort, bands] = await getCohortWithBands(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_cohort")) notFound();
  const cohortSlug = cohort.slug;
  const today = todayISO();
  const spans = classSpans();

  // Crusade weekends aren't role-specific (teacher sees this page's own
  // Crusades nav item too) — fetched once regardless of which branch below
  // runs. "Done" matches the Crusades page's own definition: a report
  // recorded, not just the weekend's date having passed.
  const [crusadeEvents, crusadeReports, scheduleSegments] = await Promise.all([
    getCrusadeEvents(supabase, cohortId),
    getCrusadeReports(supabase, cohortId),
    getScheduleSegments(supabase, cohortId),
  ]);
  const weekends = crusadeWeekends(crusadeEvents);
  const crusadesDone = weekends.filter((w) => crusadeReports.get(w.afterClass)?.status === "done").length;

  let recordedCount = 0;
  let rate = 0;
  let lessonBars: ChartBar[] = [];
  let classBars: ChartBar[] = [];
  let lessonItems: UpcomingItem[] = [];
  let topAttenders: StudentAggregate[] | null = null;
  let needsFollowUp: StudentAggregate[] | null = null;
  let atRiskCount = 0;
  // The next due-but-unrecorded lesson's own register — "Record lesson"
  // deep-links straight there instead of just the Lessons list, so the
  // shortcut actually does the thing it says.
  let enrolled = 0;
  let studentsForBirthdays: Student[] = [];
  let statusSegments: DonutSegment[] | null = null;

  const canOpenStudent = caps.has("view_student");
  const studentHref = canOpenStudent ? (id: string) => `/c/${cohortSlug}/students/${id}` : null;

  if (!caps.has("view_attendance")) {
    const [pub, students] = await Promise.all([
      getLessonEventsPublic(supabase, cohortId),
      getStudents(supabase, cohortId),
    ]);
    studentsForBirthdays = students.filter((s) => !s.leftAt);
    recordedCount = pub.filter((p) => p.recorded).length;
    enrolled = studentsForBirthdays.length;
    // Same seat rule as aggregateCohort (the facilitator branch below): the
    // public stats count, per lesson, the students enrolled on its date,
    // and only recorded lessons count — a missing register isn't an absence.
    rate =
      seatTotals(pub.map((p) => ({ due: p.date <= today, expected: p.recorded ? p.enrolled : 0, present: p.recorded ? (p.present ?? 0) : 0 })))
        .rate ?? 0;
    // A teacher's client never sees `lesson_catchup` (pastoral detail,
    // blocked by RLS) — their chart shows attended/absent only, no
    // caught-up segment.
    lessonBars = buildLessonBars(
      pub.map((p) => ({
        globalIndex: p.globalIndex,
        lessonRef: p.lessonRef,
        date: p.date,
        recorded: p.recorded,
        present: p.present ?? 0,
        catchup: 0,
        enrolled: p.enrolled ?? 0,
      })),
      today
    );
    classBars = classBarsFromCounts(
      CURRICULUM.map((_, ci) => {
        // Due, not just recorded — same rule as buildLessonBars/aggregateCohort:
        // a due lesson nobody's recorded yet is still owed a full 0-present
        // headcount in this class's denominator, not silently left out of it
        // (which would let unrecorded lessons quietly inflate the class %).
        const dueInClass = pub.filter((p) => p.classIndex === ci && p.date <= today);
        return {
          present: dueInClass.reduce((a, p) => a + (p.recorded ? p.present ?? 0 : 0), 0),
          catchup: 0,
          enrolled: dueInClass.reduce((a, p) => a + (p.enrolled ?? 0), 0),
          started: dueInClass.length > 0,
        };
      })
    );

    // Overdue/no-register lessons aren't shown here — Lessons' own
    // "Missing register" KPI and the notification system already flag
    // those, so Upcoming only ever shows what's genuinely still ahead.
    const upcoming = pub
      .filter((p) => !p.recorded && p.date > today)
      .sort((a, b) => a.globalIndex - b.globalIndex)
      .slice(0, 5);
    lessonItems = upcoming.map((p) => ({
      sortKey: daysFromToday(p.date, today),
      row: {
        id: p.eventId,
        tone: "cyan",
        kind: "lesson",
        title: p.lessonTitle,
        meta: p.lessonRef,
        dateLabel: formatShortDate(p.date),
        href: `/c/${cohortSlug}/lessons`,
      },
    }));
  } else {
    const [allStudents, lessonEvents] = await Promise.all([
      getStudents(supabase, cohortId),
      getLessonEvents(supabase, cohortId),
    ]);
    studentsForBirthdays = allStudents.filter((s) => !s.leftAt);
    // Attendance counts everyone enrolled on each lesson's date (someone
    // who left later still attended what they attended); the roster
    // panels below show current students only.
    const allIds = new Set(allStudents.map((s) => s.id));
    const agg = aggregateCohort(allStudents, lessonEvents, bands, today);
    const current = agg.roster.filter((s) => !s.leftAt);
    recordedCount = agg.recordedCount;
    rate = agg.rate;
    enrolled = agg.enrolled;
    atRiskCount = agg.atRisk;

    const catchupCounts = await getCatchupCountsByEvent(
      supabase,
      lessonEvents.map((e) => e.eventId),
      allIds
    );

    const seatsByEvent = new Map(lessonEvents.map((e) => [e.eventId, lessonSeats(e, allStudents, today)]));
    lessonBars = buildLessonBars(
      lessonEvents.map((e) => {
        const catchup = catchupCounts.get(e.eventId) ?? 0;
        const seats = seatsByEvent.get(e.eventId)!;
        return {
          globalIndex: e.globalIndex,
          lessonRef: e.lessonRef,
          date: e.date,
          recorded: seats.recorded,
          // Present on the day, and (separately) absences made up later.
          present: seats.present,
          catchup,
          enrolled: seats.expected,
        };
      }),
      today
    );
    classBars = classBarsFromCounts(
      CURRICULUM.map((_, ci) => {
        // Only recorded lessons owe seats (an unrecorded one's `expected`
        // is 0); "started" still follows the calendar.
        const dueInClass = lessonEvents.filter((e) => e.classIndex === ci && e.date <= today);
        let present = 0;
        let catchup = 0;
        let expected = 0;
        for (const e of dueInClass) {
          const seats = seatsByEvent.get(e.eventId)!;
          expected += seats.expected;
          if (!seats.recorded) continue;
          const cu = catchupCounts.get(e.eventId) ?? 0;
          present += seats.present;
          catchup += cu;
        }
        return { present, catchup, enrolled: expected, started: dueInClass.length > 0 };
      })
    );

    // Overdue/no-register lessons aren't shown here — Lessons' own
    // "Missing register" KPI and the notification system already flag
    // those, so Upcoming only ever shows what's genuinely still ahead.
    const upcoming = lessonEvents.filter((e) => !isRecorded(e) && e.date > today).slice(0, 5);
    lessonItems = upcoming.map((e) => ({
      sortKey: daysFromToday(e.date, today),
      row: {
        id: e.eventId,
        tone: "cyan",
        kind: "lesson",
        title: e.lessonTitle,
        meta: e.lessonRef,
        dateLabel: formatShortDate(e.date),
        href: `/c/${cohortSlug}/lessons/${e.eventId}`,
      },
    }));

    // "On track" specifically, not just "has some expected lessons" — a
    // 0%-attendance student was slipping in here whenever fewer than 5
    // people genuinely had good attendance. This and `needsFollowUp`
    // below are opposite halves of the same roster (every status other
    // than "On track"), so nobody is double-counted or dropped.
    topAttenders = current
      .filter((s) => s.status === "On track" && s.expected > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);

    needsFollowUp = current
      .filter((s) => s.status !== "On track")
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);

    statusSegments = [
      { label: "On track", count: current.filter((s) => s.performance === "On track").length, tone: "cyan" },
      { label: "Not started", count: current.filter((s) => s.performance === "Not started").length, tone: "grey" },
      { label: "Needs help", count: current.filter((s) => s.performance === "Needs help").length, tone: "yellow" },
      { label: "At risk", count: current.filter((s) => s.performance === "At risk").length, tone: "magenta" },
    ];
  }

  let classIndex = spans.findIndex(([a, b]) => recordedCount >= a && recordedCount <= b);
  if (classIndex < 0) classIndex = CURRICULUM.length - 1;

  const attendanceDelta = rate >= bands.activeThreshold ? "On target" : `${bands.activeThreshold - rate} under`;
  const attendanceTone: DeltaTone = rate >= bands.activeThreshold ? "ok" : "bad";

  // Never stored — re-derived from the cohort's own ideal plan (real
  // start date, teaching days, lessons/session) vs. what's actually
  // recorded, so postponing a lesson can never leave this stale.
  const pace = computePace(cohort, scheduleSegments, recordedCount, today);
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
    .slice(0, 4)
    .map((i) => i.row);



  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title={caps.has("edit_attendance") ? "Dashboard" : "Overview"}
        subtitle={`${cohort.name} · Class ${classIndex + 1} of 7`}
      />

      <div className="flex items-center justify-between gap-3">
        <Pill tone="cyan" className="px-3.5 py-1 text-sm">
          {cohort.name.trim()}
        </Pill>
        <HealthPill health={health} />
      </div>

      <KpiRow>
        <KpiCard label="Students" value={enrolled} />
        <KpiCard label="Attendance" value={`${rate}%`} delta={attendanceDelta} deltaTone={attendanceTone} />
        <KpiCard
          label="Behind"
          value={Math.max(0, pace.gap)}
          delta={onPace ? "On target" : "Catch up"}
          deltaTone={onPace ? "ok" : "bad"}
        />
        <KpiCard
          label="Lessons"
          value={`${recordedCount}/80`}
          sub={`Class ${classIndex + 1} · ${CURRICULUM[classIndex].title}`}
        />
        <KpiCard label="Crusades" value={`${crusadesDone}/${weekends.length}`} />
      </KpiRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AttendanceCard lessonBars={lessonBars} classBars={classBars} />
        <div className="flex flex-col gap-4">
          <UpcomingEventsCard
            title="Upcoming"
            rows={upNext}
            emptyLabel="Nothing coming up in the next few days."
            className="p-4"
          />
        </div>
      </div>

      {(topAttenders !== null || statusSegments !== null) && (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {topAttenders !== null && needsFollowUp !== null && (
            <TopAttendersCard good={topAttenders} followUp={needsFollowUp} bands={bands} />
          )}
          {statusSegments !== null && <StatusDonut segments={statusSegments} total={enrolled} />}
        </div>
      )}
    </div>
  );
}
