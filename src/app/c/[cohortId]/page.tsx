import { notFound } from "next/navigation";
import { CheckCircle, WarningCircle, BookOpen, Gauge, Megaphone, UserPlus, ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands, getScheduleSegments } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic, getCrusadeEvents } from "@/lib/data/lessons";
import { getCrusadeReports } from "@/lib/data/crusades";
import { getCatchupCountsByEvent } from "@/lib/data/catchup";
import { aggregateCohort, isRecorded, lessonStats, computePace } from "@/lib/domain/metrics";
import { cohortHealth } from "@/lib/domain/bands";
import { CURRICULUM, classSpans, lessonAt } from "@/lib/domain/curriculum";
import { upcomingBirthdays, formatBirthdayDate } from "@/lib/domain/birthdays";
import { crusadeWeekends } from "@/components/reports/report-utils";
import { todayISO, formatShortDate } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/lib/roles";
import { PageHead } from "@/components/shell/page-head";
import { KpiRow, KpiCard, type DeltaTone } from "@/components/dashboard/kpi-card";
import { AttendanceCard, type ChartBar } from "@/components/dashboard/attendance-card";
import { UpcomingEventsCard, type UpcomingEventRow } from "@/components/shared/upcoming-events";
import { TopAttendersCard } from "@/components/dashboard/top-attenders-card";
import { Greeting } from "@/components/dashboard/greeting";
import { HealthPill } from "@/components/ui/pill";
import { StatusDonut, type DonutSegment } from "@/components/dashboard/status-donut";
import { QuickActions, type QuickAction } from "@/components/dashboard/quick-actions";
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
  const user = await requireUser();
  const supabase = await createClient();

  const [cohort, bands] = await Promise.all([getCohort(supabase, routeParam), getBands(supabase)]);
  if (!cohort) notFound();
  const cohortId = cohort.id;
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
  const crusadesDone = weekends.filter((w) => crusadeReports.has(w.afterClass)).length;

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
  let nextLessonHref: string | null = null;
  let enrolled = 0;
  let studentsForBirthdays: Student[] = [];
  // The last curriculum lesson's own (possibly postponed) scheduled date —
  // the real, live-reflowed schedule already answers "when does this
  // finish", so there's no need to re-derive a projection from scratch.
  let finishDate: string | null = null;
  let statusSegments: DonutSegment[] | null = null;

  const canOpenStudent = NAV_BY_ROLE[user.role].includes("students");
  const studentHref = canOpenStudent ? (id: string) => `/c/${cohortSlug}/students/${id}` : null;

  if (user.role === "teacher") {
    const [pub, students] = await Promise.all([
      getLessonEventsPublic(supabase, cohortId),
      getStudents(supabase, cohortId),
    ]);
    studentsForBirthdays = students.filter((s) => !s.leftAt);
    finishDate = pub[pub.length - 1]?.date ?? null;
    const recorded = pub.filter((p) => p.recorded);
    recordedCount = recorded.length;
    enrolled = pub[0]?.enrolled ?? 0;
    const totalPresent = recorded.reduce((a, p) => a + (p.present ?? 0), 0);
    rate = enrolled && recordedCount ? Math.round((totalPresent / (enrolled * recordedCount)) * 100) : 0;
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
    // A student marked "left" stops counting toward the cohort's own
    // health — the dashboard reflects who's actually still being tracked.
    const students = allStudents.filter((s) => !s.leftAt);
    const activeIds = new Set(students.map((s) => s.id));
    finishDate = lessonEvents[lessonEvents.length - 1]?.date ?? null;
    const agg = aggregateCohort(students, lessonEvents, bands, today);
    recordedCount = agg.recordedCount;
    rate = agg.rate;
    enrolled = agg.enrolled;
    atRiskCount = agg.atRisk;
    nextLessonHref = agg.outstanding[0]
      ? `/c/${cohortSlug}/lessons/${agg.outstanding[0].eventId}`
      : `/c/${cohortSlug}/lessons`;

    const catchupCounts = await getCatchupCountsByEvent(
      supabase,
      lessonEvents.map((e) => e.eventId),
      activeIds
    );

    lessonBars = buildLessonBars(
      lessonEvents.map((e) => {
        const catchup = catchupCounts.get(e.eventId) ?? 0;
        return {
          globalIndex: e.globalIndex,
          lessonRef: e.lessonRef,
          date: e.date,
          recorded: isRecorded(e),
          present: (lessonStats(e, activeIds)?.present ?? 0) - catchup,
          catchup,
          enrolled: activeIds.size,
        };
      }),
      today
    );
    classBars = classBarsFromCounts(
      CURRICULUM.map((_, ci) => {
        // Due, not just recorded — see the matching comment in the teacher
        // branch above. An unrecorded due lesson still owes this class a
        // full 0-present headcount, the same way it owes every enrolled
        // student a real miss in aggregateCohort.
        const dueInClass = lessonEvents.filter((e) => e.classIndex === ci && e.date <= today);
        let present = 0;
        let catchup = 0;
        for (const e of dueInClass) {
          if (!isRecorded(e)) continue;
          const cu = catchupCounts.get(e.eventId) ?? 0;
          present += lessonStats(e, activeIds)!.present - cu;
          catchup += cu;
        }
        return { present, catchup, enrolled: activeIds.size * dueInClass.length, started: dueInClass.length > 0 };
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
    topAttenders = agg.roster
      .filter((s) => s.status === "On track" && s.expected > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);

    needsFollowUp = agg.roster
      .filter((s) => s.status !== "On track")
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);

    statusSegments = [
      { label: "On track", count: agg.roster.filter((s) => s.status === "On track" && s.expected > 0).length, tone: "cyan" },
      { label: "Not started", count: agg.roster.filter((s) => s.expected === 0).length, tone: "grey" },
      { label: "Needs help", count: agg.roster.filter((s) => s.status === "Needs help").length, tone: "yellow" },
      { label: "At risk", count: agg.roster.filter((s) => s.status === "At risk").length, tone: "magenta" },
    ];
  }

  let classIndex = spans.findIndex(([a, b]) => recordedCount >= a && recordedCount <= b);
  if (classIndex < 0) classIndex = CURRICULUM.length - 1;
  const currentClass = CURRICULUM[classIndex];

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

  // Gated by who can actually *do* the thing, not just who can see the
  // page it lives on — "Add student" only exists as a button for
  // facilitator/admin (students/page.tsx), and only those two roles can
  // open a register to record it, so showing these to anyone else would
  // be a shortcut to a page with nothing to click.
  const allowedNav = NAV_BY_ROLE[user.role];
  const canRecordLessons = user.role === "facilitator" || user.role === "admin";
  const rawActions: (QuickAction | false)[] = [
    canRecordLessons && {
      label: "Add student",
      href: `/c/${cohortSlug}/students?add=1`,
      icon: UserPlus,
      tone: "cyan",
    },
    canRecordLessons && {
      label: "Record lesson",
      href: nextLessonHref ?? `/c/${cohortSlug}/lessons`,
      icon: BookOpen,
      tone: "green",
    },
    allowedNav.includes("followup") && { label: "Follow ups", href: `/c/${cohortSlug}/followup`, icon: WarningCircle, tone: "yellow" },
    allowedNav.includes("reports") && { label: "Reports", href: `/c/${cohortSlug}/reports`, icon: ChartLineUp, tone: "violet" },
  ];
  const quickActions = rawActions.filter((a): a is QuickAction => a !== false);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title={user.role === "leadership" ? "Overview" : "Dashboard"}
        subtitle={`${cohort.name} · Class ${classIndex + 1} of 7`}
      />

      <Greeting name={user.name} right={<HealthPill health={health} />} />

      <KpiRow>
        <KpiCard
          icon={<CheckCircle size={15} />}
          label="Attendance"
          value={`${rate}%`}
          delta={attendanceDelta}
          deltaTone={attendanceTone}
          sub={`Target ${bands.activeThreshold}%`}
        />
        {statusSegments !== null && (
          <KpiCard
            icon={<WarningCircle size={15} />}
            label="Needs follow up"
            value={atRiskCount}
            sub={`of ${enrolled} students`}
          />
        )}
        <KpiCard
          icon={<BookOpen size={15} />}
          label="Lessons recorded"
          value={`${recordedCount}/80`}
          sub={`Class ${classIndex + 1} · ${currentClass.title}`}
        />
        <KpiCard
          icon={<Gauge size={15} />}
          label="Pace"
          value={onPace ? "On pace" : `${pace.gap} behind`}
          delta={onPace ? "On target" : "Catch up"}
          deltaTone={onPace ? "ok" : "bad"}
          sub={
            recordedCount < 80
              ? `Now at ${lessonAt(recordedCount).ref}${finishDate ? ` · Ends ${formatShortDate(finishDate)}` : ""}`
              : finishDate
                ? `Ends ${formatShortDate(finishDate)}`
                : "vs. this cohort's own ideal plan"
          }
        />
        <KpiCard
          icon={<Megaphone size={15} />}
          label="Crusades done"
          value={`${crusadesDone}/${weekends.length}`}
          sub="Weekend reports recorded"
        />
      </KpiRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <AttendanceCard lessonBars={lessonBars} classBars={classBars} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {topAttenders !== null && needsFollowUp !== null && (
              <TopAttendersCard good={topAttenders} followUp={needsFollowUp} bands={bands} />
            )}
            {statusSegments !== null && <StatusDonut segments={statusSegments} total={enrolled} />}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <QuickActions actions={quickActions} />
          <UpcomingEventsCard
            title="Upcoming"
            rows={upNext}
            emptyLabel="Nothing coming up in the next few days."
            className="p-4"
          />
        </div>
      </div>
    </div>
  );
}
