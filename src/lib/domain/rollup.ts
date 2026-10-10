import { aggregateCohort, computePace, isRecorded, lessonSeats, registerHealth, seatTotals, type SeatTotals } from "./metrics";
import { buildIdealSchedule, type ScheduleSegment } from "./generator";
import { enrolledOn, enrolmentChanges, type EnrolmentStudent } from "./enrolment";
import { bandsOf, policyOn, type PolicyVersion } from "./policy";
import { graduationCheck, studentIntervention } from "./student-state";
import type { Cohort, LessonEventView, OutcomeKind, Student } from "./types";

/**
 * Totals for the levels above the cohort (HQ › … › Promotion).
 *
 * Built in two steps so every level uses the same definitions:
 *  1. `cohortFacts` turns one cohort's real rows into a small fact sheet,
 *     using the same `aggregateCohort` the cohort's own pages use.
 *  2. `sumFacts` adds fact sheets together for any box.
 *
 * Fact sheets carry counts and dates only, never student names, so
 * nothing above the cohort ever receives an individual student's record.
 *
 * Definitions (one place, used everywhere):
 *  - registered: every student ever enrolled, including those who left.
 *  - left: students marked as having left the program.
 *  - finished cohort: marked complete, or every lesson has been recorded.
 *  - completed: students still enrolled (not left) when their cohort finished.
 *  - active: students still enrolled in a cohort that hasn't finished.
 *  - On track / Needs help / At risk: active students in a running cohort,
 *    by the network's status bands. These three always add up to active.
 *  - inactive: active, and marked absent at their last `inactiveStreak`
 *    recorded lessons in a row. Based on recorded absences only — a lesson
 *    nobody recorded says nothing about whether the student stopped coming.
 *  - attendance: present ÷ owed seats over *recorded* lessons — owed by
 *    everyone enrolled on the lesson's date, including students who left
 *    later. A due lesson with no register is a missing register (register
 *    health), never an absence. Added up as seats, never averaged %.
 *  - register completion: recorded ÷ due lessons.
 *  - behind schedule: fewer lessons taught than the cohort's own plan says
 *    should be done by now (2+), or its last lesson pushed later than planned.
 */

export type CohortPhase = "upcoming" | "running" | "finished";
export type ScheduleState = "upcoming" | "on" | "behind" | "ahead" | "finished";

/** Just enough per student to rebuild counts over time — no names. */
export interface LessonSeat {
  date: string; // YYYY-MM-DD
  present: number;
  expected: number;
}

export interface StudentSpan {
  /** First joined (YYYY-MM-DD) — when they count as enrolled from. */
  enrolled: string;
  /** Left and not back (YYYY-MM-DD), or null. */
  left: string | null;
  /** Every stretch they were enrolled, from the dated enrolment history
   * (joined → left, returned → …). Absent: one stretch, enrolled → left. */
  periods?: { from: string; to: string | null }[];
}

const periodsOf = (s: StudentSpan) => s.periods ?? [{ from: s.enrolled, to: s.left }];
/** Enrolled on that date? A leave applies from its own date. */
const enrolledThen = (s: StudentSpan, dateISO: string) => periodsOf(s).some((p) => p.from <= dateISO && (!p.to || p.to > dateISO));
/** Each time they left (a student can leave, return and leave again). */
const leavesOf = (s: StudentSpan) => periodsOf(s).flatMap((p) => (p.to ? [p.to] : []));

/** When a cohort finished — marked complete, or every lesson recorded —
 * dated by its last recorded lesson; null while it runs. */
export function cohortFinishedOn(status: Cohort["status"], lessons: { date: string; recorded: boolean }[], today: string): string | null {
  const recorded = lessons.filter((l) => l.recorded);
  const finished = status === "complete" || (lessons.length > 0 && recorded.length === lessons.length);
  return finished ? (recorded.map((l) => l.date).sort().pop() ?? today) : null;
}

/** A student's enrolment as spans, from their dated history (enrolmentChanges). */
export function studentSpan(s: EnrolmentStudent): StudentSpan {
  const periods: { from: string; to: string | null }[] = [];
  let open: string | null = null;
  for (const c of enrolmentChanges(s)) {
    if (c.kind === "left") {
      if (open) periods.push({ from: open, to: c.on });
      open = null;
    } else if (!open) open = c.on;
  }
  if (open) periods.push({ from: open, to: null });
  return {
    enrolled: periods[0]?.from ?? s.enrolledAt.slice(0, 10),
    left: s.leftAt ? s.leftAt.slice(0, 10) : null,
    periods: periods.length ? periods : undefined,
  };
}

export interface CohortFacts {
  cohortId: string;
  slug: string;
  name: string;
  orgUnitId: string | null;
  facilitatorNames: string[];
  spans: StudentSpan[];
  registered: number;
  active: number;
  left: number;
  completed: number;
  /** Of the completed, those meeting the graduation rule (graduationCheck). */
  graduated: number;
  onTrack: number;
  needsHelp: number;
  atRisk: number;
  inactive: number;
  /** Attendance % over recorded lessons. */
  attendanceRate: number | null;
  /** Lessons whose date has arrived, and how many have a register. */
  registersDue: number;
  registersRecorded: number;
  /** Each due lesson's date and whether its register was recorded — for
   * delivery over a period or month (no student data). */
  lessonsDue: { date: string; recorded: boolean }[];
  /** Each recorded lesson's seats, for adding attendance up across cohorts and periods. */
  seats: LessonSeat[];
  phase: CohortPhase;
  startsOn: string | null;
  finishedOn: string | null;
  lessonsTotal: number;
  lessonsTaught: number;
  lessonsNotRecorded: number;
  progressPct: number;
  /** Last lesson date in the cohort's plan (its cadence, incl. approved changes). */
  plannedEnd: string | null;
  /** Last lesson date in the live schedule (after postponements). */
  currentEnd: string | null;
  /** currentEnd − plannedEnd in days; negative = ahead. */
  daysBehind: number;
  /** Lessons the plan says should be taught by now, minus lessons taught. */
  lessonsBehind: number;
  schedule: ScheduleState;
  notContacted: number;
  overdueFollowUps: number;
  /** Struggling (needs help / at risk) with no follow-up decision yet. */
  followUpsRequired: number;
  /** Decided "catch up" and still has absences to make up. */
  activeCatchups: number;
  /** Absences made up through catch-ups (all current students). */
  lessonsRecovered: number;
  /** A lesson is scheduled today: has its register been saved? */
  lessonToday: { recorded: boolean } | null;
}

export interface CohortFactsInput {
  cohort: Cohort;
  /** Every student, including those who left. */
  students: Student[];
  lessonEvents: LessonEventView[];
  segments: ScheduleSegment[];
  latestOutcomeKind: Map<string, OutcomeKind>;
  facilitatorNames: string[];
  /** Every programme policy version — the one in force applies: today's
   * for a running cohort, the finish date's for a finished one. */
  policies: PolicyVersion[];
  today: string;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}

/**
 * How many of a student's most recent *recorded* lessons (since they
 * joined) they were marked absent at, in a row. Unrecorded lessons are
 * skipped, not counted. `recordedNewestFirst` = recorded lessons, newest first.
 */
export function recordedMissStreak(
  s: Pick<Student, "id" | "enrolledAt" | "leftAt" | "enrolment">,
  recordedNewestFirst: LessonEventView[]
): number {
  let streak = 0;
  for (const ev of recordedNewestFirst) {
    // Stop at a lesson they weren't enrolled for (before joining, or
    // while away) — a streak is only ever consecutive owed lessons.
    if (!enrolledOn(s, ev.date)) break;
    if (ev.register.attendance[s.id] === "present") break;
    streak++;
  }
  return streak;
}

export function cohortFacts(input: CohortFactsInput): CohortFacts {
  const { cohort, students, lessonEvents, segments, latestOutcomeKind, policies, today } = input;
  const current = students.filter((s) => !s.leftAt);
  const registers = registerHealth(lessonEvents, today);

  const lessonDates = lessonEvents.map((e) => e.date).sort();
  const startsOn = lessonDates[0] ?? null;
  const currentEnd = lessonDates[lessonDates.length - 1] ?? null;
  const ideal = buildIdealSchedule(cohort, segments).filter((e) => e.kind === "lesson");
  const plannedEnd = ideal.length ? ideal[ideal.length - 1].date : null;

  const lessonsTotal = lessonEvents.length;
  const recorded = lessonEvents.filter(isRecorded);
  const finishedOn = cohortFinishedOn(cohort.status, lessonEvents.map((e) => ({ date: e.date, recorded: isRecorded(e) })), today);
  const finished = finishedOn != null;
  const allRecorded = lessonsTotal > 0 && recorded.length === lessonsTotal;
  const phase: CohortPhase = finished ? "finished" : startsOn && startsOn > today ? "upcoming" : "running";

  // The policy in force for this cohort: when it finished, else today.
  const policy = policyOn(policies, finishedOn ?? today);
  const inactiveStreak = policy.inactiveStreak;
  const agg = aggregateCohort(students, lessonEvents, bandsOf(policy), today);

  const daysBehind = plannedEnd && currentEnd ? daysBetween(plannedEnd, currentEnd) : 0;
  const lessonsBehind = Math.max(0, computePace(cohort, segments, recorded.length, today).gap);
  const schedule: ScheduleState =
    phase === "finished"
      ? "finished"
      : phase === "upcoming"
        ? "upcoming"
        : lessonsBehind >= 2 || daysBehind > 0
          ? "behind"
          : daysBehind < 0
            ? "ahead"
            : "on";
  const recordedNewestFirst = [...recorded].sort((a, b) => (a.date < b.date ? 1 : -1));

  let onTrack = 0;
  let needsHelp = 0;
  let atRisk = 0;
  let inactive = 0;
  let notContacted = 0;
  let overdueFollowUps = 0;
  let followUpsRequired = 0;
  let activeCatchups = 0;
  let lessonsRecovered = 0;
  // Graduation: only once the cohort has finished, by the policy then.
  let graduated = 0;
  if (phase === "finished") {
    for (const s of agg.roster) {
      if (s.leftAt) continue;
      const intervention = studentIntervention(s, latestOutcomeKind.get(s.id) ?? null, today);
      if (graduationCheck(s, allRecorded, intervention, policy.graduationAttendance).graduated) graduated++;
    }
  }
  if (phase !== "finished") {
    for (const s of agg.roster) {
      if (s.leftAt) continue;
      // Someone with no recorded lesson owed yet counts with On track, so
      // the three groups still add up to `active`.
      if (s.status === "On track") onTrack++;
      else if (s.status === "Needs help") needsHelp++;
      else atRisk++;
      if (recordedMissStreak(s, recordedNewestFirst) >= inactiveStreak) inactive++;
      const latest = latestOutcomeKind.get(s.id);
      const needsAttention = s.performance === "Needs help" || s.performance === "At risk";
      if (needsAttention && !latest && !s.contactedAt) notContacted++;
      if (needsAttention && !latest) followUpsRequired++;
      if (latest === "catchup" && s.missed > 0) activeCatchups++;
      lessonsRecovered += s.recovered;
      if (s.followUpNextOn && s.followUpNextOn < today && (needsAttention || latest === "catchup")) overdueFollowUps++;
    }
  }

  const todaysLesson = lessonEvents.find((e) => e.date === today);
  const seats = lessonEvents
    .map((ev) => lessonSeats(ev, students, today))
    .filter((r) => r.due && r.recorded && r.expected > 0)
    .map((r) => ({ date: r.date, present: r.present, expected: r.expected }));

  return {
    cohortId: cohort.id,
    slug: cohort.slug,
    name: cohort.name.trim(),
    orgUnitId: cohort.orgUnitId,
    facilitatorNames: input.facilitatorNames,
    spans: students.map(studentSpan),
    registered: students.length,
    active: finished ? 0 : current.length,
    left: students.length - current.length,
    completed: finished ? current.length : 0,
    graduated,
    onTrack,
    needsHelp,
    atRisk,
    inactive,
    attendanceRate: agg.totalExpected ? agg.rate : null,
    registersDue: registers.due,
    registersRecorded: registers.recorded,
    lessonsDue: lessonEvents.filter((e) => e.date <= today).map((e) => ({ date: e.date, recorded: isRecorded(e) })),
    seats,
    phase,
    startsOn,
    finishedOn,
    lessonsTotal,
    lessonsTaught: recorded.length,
    lessonsNotRecorded: agg.outstanding.length,
    progressPct: lessonsTotal ? Math.round((recorded.length / lessonsTotal) * 100) : 0,
    plannedEnd,
    currentEnd,
    daysBehind,
    lessonsBehind,
    schedule,
    notContacted,
    overdueFollowUps,
    followUpsRequired,
    activeCatchups,
    lessonsRecovered,
    lessonToday: todaysLesson ? { recorded: isRecorded(todaysLesson) } : null,
  };
}

// ───────────── adding cohorts together ─────────────

export interface Totals {
  registered: number;
  active: number;
  left: number;
  completed: number;
  graduated: number;
  onTrack: number;
  needsHelp: number;
  atRisk: number;
  inactive: number;
  cohorts: number;
  running: number;
  upcoming: number;
  finished: number;
  onSchedule: number;
  behind: number;
  ahead: number;
  /** Average % of lessons taught, over running cohorts. */
  avgProgress: number | null;
  lessonsNotRecorded: number;
  /** Lessons due so far, and how many have a register — reporting health. */
  registersDue: number;
  registersRecorded: number;
  /** registersRecorded ÷ registersDue, 0..100; null when nothing is due. */
  registerCompletion: number | null;
  lessonsRemaining: number;
  notContacted: number;
  overdueFollowUps: number;
  followUpsRequired: number;
  activeCatchups: number;
  lessonsRecovered: number;
  startingSoon: number;
  finishingSoon: number;
}

const SOON_DAYS = 90;

export function sumFacts(facts: CohortFacts[], today: string): Totals {
  const t: Totals = {
    registered: 0, active: 0, left: 0, completed: 0, graduated: 0, onTrack: 0, needsHelp: 0, atRisk: 0, inactive: 0,
    cohorts: facts.length, running: 0, upcoming: 0, finished: 0, onSchedule: 0, behind: 0, ahead: 0, avgProgress: null,
    lessonsNotRecorded: 0, registersDue: 0, registersRecorded: 0, registerCompletion: null, lessonsRemaining: 0, notContacted: 0, overdueFollowUps: 0, followUpsRequired: 0, activeCatchups: 0, lessonsRecovered: 0, startingSoon: 0, finishingSoon: 0,
  };
  let progressSum = 0;
  const soon = addDaysISO(today, SOON_DAYS);
  for (const f of facts) {
    t.registered += f.registered;
    t.active += f.active;
    t.left += f.left;
    t.completed += f.completed;
    t.graduated += f.graduated;
    t.onTrack += f.onTrack;
    t.needsHelp += f.needsHelp;
    t.atRisk += f.atRisk;
    t.inactive += f.inactive;
    t.lessonsNotRecorded += f.lessonsNotRecorded;
    t.registersDue += f.registersDue;
    t.registersRecorded += f.registersRecorded;
    t.notContacted += f.notContacted;
    t.overdueFollowUps += f.overdueFollowUps;
    t.followUpsRequired += f.followUpsRequired;
    t.activeCatchups += f.activeCatchups;
    t.lessonsRecovered += f.lessonsRecovered;
    if (f.phase === "running") {
      t.running++;
      progressSum += f.progressPct;
      t.lessonsRemaining += f.lessonsTotal - f.lessonsTaught;
      if (f.schedule === "behind") t.behind++;
      else if (f.schedule === "ahead") t.ahead++;
      else t.onSchedule++;
      if (f.currentEnd && f.currentEnd <= soon) t.finishingSoon++;
    } else if (f.phase === "upcoming") {
      t.upcoming++;
      if (f.startsOn && f.startsOn <= soon) t.startingSoon++;
    } else {
      t.finished++;
    }
  }
  t.avgProgress = t.running ? Math.round(progressSum / t.running) : null;
  t.registerCompletion = t.registersDue ? Math.round((t.registersRecorded / t.registersDue) * 100) : null;
  return t;
}

// ───────────── over time ─────────────

export interface MonthPoint {
  month: string; // YYYY-MM
  /** Active students at the end of the month (or today, for this month). */
  active: number;
  joined: number;
  left: number;
  completed: number;
}

function monthEnd(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

/** The last `count` calendar months, ending with the current one. */
export function monthSeries(facts: CohortFacts[], today: string, count = 12): MonthPoint[] {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  const points: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const key = d.toISOString().slice(0, 7);
    const start = `${key}-01`;
    const endRaw = monthEnd(d.getUTCFullYear(), d.getUTCMonth());
    const end = endRaw > today ? today : endRaw;
    let active = 0;
    let joined = 0;
    let left = 0;
    let completed = 0;
    for (const f of facts) {
      const finishedBy = f.finishedOn && f.finishedOn <= end;
      if (f.finishedOn && f.finishedOn >= start && f.finishedOn <= end) completed += f.completed;
      for (const s of f.spans) {
        if (s.enrolled >= start && s.enrolled <= end) joined++;
        left += leavesOf(s).filter((d) => d >= start && d <= end).length;
        if (!finishedBy && enrolledThen(s, end)) active++;
      }
    }
    points.push({ month: key, active, joined, left, completed });
  }
  return points;
}

/** Attendance across cohorts for lessons dated after `from` up to `to`
 * (inclusive); whole history when `from` is null. */
export function attendanceBetween(facts: CohortFacts[], from: string | null, to: string): SeatTotals {
  return seatTotals(
    facts.flatMap((f) => f.seats.filter((r) => (!from || r.date > from) && r.date <= to)).map((r) => ({ ...r, due: true }))
  );
}

/** Attendance for the last `days` days and the `days` before that. */
export function periodAttendance(facts: CohortFacts[], today: string, days: number) {
  const from = addDaysISO(today, -days);
  return { now: attendanceBetween(facts, from, today), before: attendanceBetween(facts, addDaysISO(from, -days), from) };
}

/** Attendance per calendar month (last `count`, ending this month) — null
 * for a month with no lessons. */
export function monthlyAttendance(facts: CohortFacts[], today: string, count = 12): SeatTotals[] {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  const out: SeatTotals[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push(seatTotals(facts.flatMap((f) => f.seats.filter((r) => r.date.startsWith(key))).map((r) => ({ ...r, due: true }))));
  }
  return out;
}

/** Delivery: of the lessons due in a window, the share with a recorded
 * register. Separate from attendance (who came) and schedule (where the
 * plan says a cohort should be). Null when nothing was due. */
export interface DeliveryTotals {
  due: number;
  recorded: number;
  rate: number | null;
}

function delivery(rows: { recorded: boolean }[]): DeliveryTotals {
  const recorded = rows.filter((r) => r.recorded).length;
  return { due: rows.length, recorded, rate: rows.length ? Math.round((recorded / rows.length) * 100) : null };
}

/** Delivery for lessons dated after `from` up to `to` (whole history when null). */
export function deliveryBetween(facts: CohortFacts[], from: string | null, to: string): DeliveryTotals {
  return delivery(facts.flatMap((f) => f.lessonsDue.filter((l) => (!from || l.date > from) && l.date <= to)));
}

/** Delivery for the last `days` days and the `days` before that. */
export function periodDelivery(facts: CohortFacts[], today: string, days: number) {
  const from = addDaysISO(today, -days);
  return { now: deliveryBetween(facts, from, today), before: deliveryBetween(facts, addDaysISO(from, -days), from) };
}

/** Delivery per calendar month (last `count`, ending this month). */
export function monthlyDelivery(facts: CohortFacts[], today: string, count = 12): DeliveryTotals[] {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  const out: DeliveryTotals[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = new Date(Date.UTC(y, m - i, 1)).toISOString().slice(0, 7);
    out.push(delivery(facts.flatMap((f) => f.lessonsDue.filter((l) => l.date.startsWith(key)))));
  }
  return out;
}

/** What history needs from a cohort: its students' spans and when it finished. */
type History = Pick<CohortFacts, "spans" | "finishedOn">;

/** Students ever registered, as of a date. */
export function registeredOn(facts: History[], dateISO: string): number {
  return facts.reduce((n, f) => n + f.spans.filter((s) => s.enrolled <= dateISO).length, 0);
}

/** Students enrolled in a cohort that hadn't finished, on a date. */
export function activeOn(facts: History[], dateISO: string): number {
  let n = 0;
  for (const f of facts) {
    if (f.finishedOn && f.finishedOn <= dateISO) continue;
    for (const s of f.spans) if (enrolledThen(s, dateISO)) n++;
  }
  return n;
}

export interface HistoryPoint {
  month: string; // YYYY-MM
  /** At the month's end (or today): enrolled in a cohort that hadn't
   * finished. null = before this group's first enrolment — no history,
   * which is not the same as a real zero. */
  active: number | null;
  /** Everyone ever enrolled by then, including those who later left. */
  enrolled: number | null;
}

/** Month-end student counts for a group of cohorts over the last `count`
 * months, rebuilt from dated enrolment history and cohort finish dates —
 * never from anyone's current status. */
export function studentHistory(facts: History[], today: string, count = 12): HistoryPoint[] {
  const first = facts.flatMap((f) => f.spans.map((s) => s.enrolled)).sort()[0] ?? null;
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  const out: HistoryPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const key = d.toISOString().slice(0, 7);
    const endRaw = monthEnd(d.getUTCFullYear(), d.getUTCMonth());
    const end = endRaw > today ? today : endRaw;
    const known = first != null && first <= end;
    out.push({ month: key, active: known ? activeOn(facts, end) : null, enrolled: known ? registeredOn(facts, end) : null });
  }
  return out;
}

/** Joined / left / completed / graduated within the last `days` days
 * (completion and graduation are dated by the cohort's finish). */
export function periodMovement(facts: CohortFacts[], today: string, days: number) {
  const from = addDaysISO(today, -days);
  let joined = 0;
  let left = 0;
  let completed = 0;
  let graduated = 0;
  for (const f of facts) {
    if (f.finishedOn && f.finishedOn > from && f.finishedOn <= today) {
      completed += f.completed;
      graduated += f.graduated;
    }
    for (const s of f.spans) {
      if (s.enrolled > from && s.enrolled <= today) joined++;
      left += leavesOf(s).filter((d) => d > from && d <= today).length;
    }
  }
  return { joined, left, completed, graduated };
}

// ───────────── needs attention ─────────────

export type IssueKind = "atrisk" | "inactive" | "overdue" | "contact" | "records" | "schedule" | "leaving" | "nofac";
export type Severity = "urgent" | "watch";

export const ISSUE_ORDER: IssueKind[] = ["atrisk", "overdue", "contact", "records", "schedule", "inactive", "leaving", "nofac"];

export const ISSUE_LABELS: Record<IssueKind, { summary: string; short: string }> = {
  atrisk: { summary: "students at risk", short: "At risk" },
  inactive: { summary: "inactive students", short: "Inactive" },
  overdue: { summary: "follow-ups overdue", short: "Overdue follow-ups" },
  contact: { summary: "struggling students not contacted", short: "Not contacted" },
  records: { summary: "lessons not recorded", short: "Not recorded" },
  schedule: { summary: "cohorts behind schedule", short: "Behind schedule" },
  leaving: { summary: "students left in the last 3 months", short: "Students leaving" },
  nofac: { summary: "cohorts starting soon without a facilitator", short: "No facilitator" },
};

export interface Issue {
  kind: IssueKind;
  /** How much of the problem this cohort contributes to the summary count. */
  count: number;
  severity: Severity;
  text: string;
}

export function issuesFor(f: CohortFacts, today: string): Issue[] {
  const out: Issue[] = [];
  if (f.atRisk > 0) {
    const share = f.active ? Math.round((f.atRisk / f.active) * 100) : 0;
    out.push({ kind: "atrisk", count: f.atRisk, severity: share >= 25 ? "urgent" : "watch", text: `${plural(f.atRisk, "student")} at risk (${share}% of the cohort)` });
  }
  if (f.inactive > 0) {
    out.push({ kind: "inactive", count: f.inactive, severity: "watch", text: `${plural(f.inactive, "student")} inactive` });
  }
  if (f.overdueFollowUps > 0) {
    out.push({ kind: "overdue", count: f.overdueFollowUps, severity: "urgent", text: `${plural(f.overdueFollowUps, "follow-up")} past the "check again" date` });
  }
  if (f.notContacted > 0) {
    out.push({ kind: "contact", count: f.notContacted, severity: "urgent", text: `${plural(f.notContacted, "struggling student")} not contacted yet` });
  }
  if (f.lessonsNotRecorded >= 2) {
    out.push({
      kind: "records",
      count: f.lessonsNotRecorded,
      severity: f.lessonsNotRecorded >= 3 ? "urgent" : "watch",
      text: `${plural(f.lessonsNotRecorded, "lesson")} not recorded yet`,
    });
  }
  if (f.schedule === "behind" && (f.daysBehind >= 7 || f.lessonsBehind >= 2)) {
    out.push({
      kind: "schedule",
      count: 1,
      severity: f.daysBehind >= 14 || f.lessonsBehind >= 5 ? "urgent" : "watch",
      text:
        f.lessonsBehind >= 2
          ? `${plural(f.lessonsBehind, "lesson")} behind plan${f.currentEnd ? ` · now ends ${f.currentEnd}` : ""}`
          : `${f.daysBehind} days behind schedule${f.currentEnd ? ` · now ends ${f.currentEnd}` : ""}`,
    });
  }
  const since = addDaysISO(today, -90);
  const recentLeft = f.spans.filter((s) => leavesOf(s).some((d) => d > since)).length;
  if (recentLeft >= 3) {
    out.push({ kind: "leaving", count: recentLeft, severity: "watch", text: `${recentLeft} students left in the last 3 months` });
  }
  if (f.phase === "upcoming" && !f.facilitatorNames.length && f.startsOn && f.startsOn <= addDaysISO(today, 60)) {
    out.push({ kind: "nofac", count: 1, severity: "watch", text: `Starts ${f.startsOn} with no facilitator` });
  }
  return out;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
