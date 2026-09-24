import { CURRICULUM, classSpans } from "./curriculum";
import { cohortHealth, statusOf } from "./bands";
import { buildIdealSchedule, type ScheduleSegment } from "./generator";
import type {
  Bands,
  Cohort,
  LessonEventView,
  Student,
  StudentAggregate,
} from "./types";

/**
 * Derived metrics — exact formulas, from 02-domain-model.md. Nothing here
 * is stored denormalised: these run against freshly-fetched rows (students
 * + lesson events with their registers) every time, so a band change or a
 * register save can never leave a stale number on screen.
 */

/** Every lesson event carries a register row from creation; "recorded"
 * means it was actually saved, not merely that the row exists. */
export function isRecorded(ev: LessonEventView): boolean {
  return ev.register.recordedAt != null;
}

export interface CohortAggregate {
  roster: StudentAggregate[];
  rate: number;
  atRisk: number;
  recordedCount: number;
  classIndex: number; // 0-based — the class containing lesson index `recordedCount`
  health: ReturnType<typeof cohortHealth>;
  outstanding: LessonEventView[]; // taught, unsaved, ascending by global index
  totalPresent: number;
  enrolled: number;
}

export function aggregateCohort(
  students: Student[],
  lessonEvents: LessonEventView[],
  bands: Bands,
  todayISO: string
): CohortAggregate {
  const recordedCount = lessonEvents.filter(isRecorded).length;
  const enrolled = students.length;

  // A lesson that's happened but whose register nobody's saved yet is
  // still *due* — it doesn't get to quietly disappear from the math just
  // because the data-entry hasn't caught up. Missing a recording is a gap
  // to go fix (record it), not something the numbers should paper over:
  // an unrecorded due lesson counts here exactly like a recorded absence,
  // until someone actually records it.
  const due = lessonEvents.filter((e) => e.date <= todayISO);

  const tally = new Map<
    string,
    { attended: number; expected: number; lastAttendedGlobalIndex: number | null; streak: number }
  >();
  for (const s of students) tally.set(s.id, { attended: 0, expected: 0, lastAttendedGlobalIndex: null, streak: 0 });

  let totalPresent = 0;
  for (const ev of due) {
    const evIsRecorded = isRecorded(ev);
    for (const s of students) {
      const t = tally.get(s.id)!;
      const wasPresent = evIsRecorded && ev.register.attendance[s.id] === "present";
      // "Last attended" is real history regardless of the enrollment
      // window below — a backfilled present mark from before a
      // late-added student's system-entry date still counts as something
      // they actually attended.
      if (wasPresent) {
        if (t.lastAttendedGlobalIndex == null || ev.globalIndex > t.lastAttendedGlobalIndex) {
          t.lastAttendedGlobalIndex = ev.globalIndex;
        }
      }
      // A student added mid-cohort (src/lib/actions/students.ts:addStudent)
      // wasn't around for lessons before they enrolled — counting those
      // against them would show someone brand new as having missed
      // everything taught so far. Only lessons on/after their own
      // enrollment date count toward their personal expected/attended.
      if (ev.date < s.enrolledAt.slice(0, 10)) continue;
      t.expected++;
      if (!wasPresent) {
        t.streak++;
        continue;
      }
      totalPresent++;
      t.attended++;
      t.streak = 0;
    }
  }

  const roster: StudentAggregate[] = students.map((s, idx) => {
    const t = tally.get(s.id)!;
    const rate = t.expected ? Math.round((t.attended / t.expected) * 100) : 0;
    // A brand-new cohort (or a student who just joined) has nothing to
    // judge them by yet — no lesson has even happened for them since they
    // enrolled — don't flag them "At risk" for that
    // (04-interactions-and-state.md: "0 and — are not interchangeable").
    // This is *not* the same as a real "On track" — callers that display
    // status should treat `expected === 0` as its own "not started yet"
    // case rather than showing it as if it were a judged, healthy rate
    // (see students-table.tsx). Once `expected > 0`, though, an
    // unrecorded lesson is a real, counted miss — there's no other
    // "incomplete data" special-casing past this point.
    const status = t.expected === 0 ? "On track" : statusOf(rate, bands);
    return {
      ...s,
      idx,
      attended: t.attended,
      expected: t.expected,
      missed: t.expected - t.attended,
      rate,
      status,
      lastAttendedGlobalIndex: t.lastAttendedGlobalIndex,
      currentMissStreak: t.streak,
    };
  });

  // Denominator is the sum of each student's own `expected` (lessons
  // recorded since *their* enrollment), not `enrolled * recordedCount` —
  // that would assume everyone was around for every recorded lesson, which
  // undercounts the cohort-wide rate as soon as anyone joined mid-cohort.
  const totalExpected = roster.reduce((sum, r) => sum + r.expected, 0);
  const rate = totalExpected ? Math.round((totalPresent / totalExpected) * 100) : 0;
  const atRisk = roster.filter((r) => r.status !== "On track").length;

  const spans = classSpans();
  let classIndex = spans.findIndex(([a, b]) => recordedCount >= a && recordedCount <= b);
  if (classIndex < 0) classIndex = CURRICULUM.length - 1;

  const health = cohortHealth(rate, atRisk, enrolled);

  const outstanding = lessonEvents
    .filter((e) => !isRecorded(e) && e.date <= todayISO)
    .sort((a, b) => a.globalIndex - b.globalIndex);

  return {
    roster,
    rate,
    atRisk,
    recordedCount,
    classIndex,
    health,
    outstanding,
    totalPresent,
    enrolled,
  };
}

export interface LessonStats {
  present: number;
  absent: number;
  rate: number;
}

/** `activeIds` — student ids to actually count, not a raw enrolled number:
 * a lesson's `attendance` blob keeps every id it was ever saved with,
 * including students who've since left, so counting by raw JSON values
 * would still fold their historical mark into "present" even after
 * they've been excluded from the roster elsewhere. */
export function lessonStats(ev: LessonEventView, activeIds: Set<string>): LessonStats | null {
  if (!isRecorded(ev)) return null;
  let present = 0;
  for (const id of activeIds) {
    if (ev.register.attendance[id] === "present") present++;
  }
  const enrolled = activeIds.size;
  return {
    present,
    absent: enrolled - present,
    rate: enrolled ? Math.round((present / enrolled) * 100) : 0,
  };
}

export function classRate(
  lessonEvents: LessonEventView[],
  classIndex: number,
  activeIds: Set<string>
): number | null {
  const inClass = lessonEvents.filter((e) => e.classIndex === classIndex && isRecorded(e));
  const enrolled = activeIds.size;
  if (!inClass.length || !enrolled) return null;
  let present = 0;
  for (const ev of inClass) present += lessonStats(ev, activeIds)!.present;
  return Math.round((present / (enrolled * inClass.length)) * 100);
}

export interface MonthlyRate {
  month: string; // YYYY-MM
  rate: number;
}

export function monthlyRates(
  lessonEvents: LessonEventView[],
  activeIds: Set<string>
): MonthlyRate[] {
  const enrolled = activeIds.size;
  const byMonth = new Map<string, { present: number; n: number }>();
  for (const ev of lessonEvents) {
    if (!isRecorded(ev) || !enrolled) continue;
    const key = ev.date.slice(0, 7);
    const s = lessonStats(ev, activeIds)!;
    const acc = byMonth.get(key) ?? { present: 0, n: 0 };
    acc.present += s.present;
    acc.n += enrolled;
    byMonth.set(key, acc);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { present, n }]) => ({ month, rate: n ? Math.round((present / n) * 100) : 0 }));
}

export interface StudentMonthlyRate {
  month: string; // YYYY-MM
  attended: number;
  expected: number;
  rate: number;
}

/**
 * The cohort-wide `monthlyRates` shows a trend for the group; a student's
 * own profile only ever showed a single cumulative lifetime average, which
 * can take a long time to visibly move even once someone's genuinely back
 * on track. Same idea as `monthlyRates`, scoped to one student instead of
 * the whole roster, so "how are they doing lately" has a real per-month
 * answer instead of just one slow-moving number.
 */
export function studentMonthlyRates(studentId: string, lessonEvents: LessonEventView[]): StudentMonthlyRate[] {
  const byMonth = new Map<string, { attended: number; expected: number }>();
  for (const ev of lessonEvents) {
    if (!isRecorded(ev)) continue;
    const key = ev.date.slice(0, 7);
    const acc = byMonth.get(key) ?? { attended: 0, expected: 0 };
    acc.expected++;
    if (ev.register.attendance[studentId] === "present") acc.attended++;
    byMonth.set(key, acc);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { attended, expected }]) => ({
      month,
      attended,
      expected,
      rate: expected ? Math.round((attended / expected) * 100) : 0,
    }));
}

export type ClassMarkStatus = "present" | "absent" | "caught-up" | "not-taught";

export interface ClassMark {
  status: ClassMarkStatus;
  ev: LessonEventView;
}

export function studentClassMarks(
  studentId: string,
  lessonEvents: LessonEventView[],
  classIndex: number,
  /** Present marks that came from correcting a lesson via catch-up rather
   * than being there on the day — same status ("present") either way for
   * every calculation, just colored differently here. */
  caughtUpEventIds: Set<string> = new Set()
): ClassMark[] {
  return lessonEvents
    .filter((e) => e.classIndex === classIndex)
    .map((ev) => {
      if (!isRecorded(ev)) return { status: "not-taught" as const, ev };
      const mark = ev.register.attendance[studentId];
      if (mark !== "present") return { status: "absent" as const, ev };
      if (caughtUpEventIds.has(ev.eventId)) return { status: "caught-up" as const, ev };
      return { status: "present" as const, ev };
    });
}

export interface AttendanceSince {
  attended: number;
  expected: number;
  rate: number | null; // null when nothing's been recorded since sinceISO yet
}

/**
 * "Are they actually attending now" — a student's overall rate is a
 * cumulative average since enrollment, which can take a long time to
 * recover even once someone's genuinely back on track. This instead only
 * looks at lessons recorded *after* a given date (a catch-up decision's
 * `recordedAt`), so following up on a catch-up plan has a real, honest
 * number to check rather than watching a slow-moving lifetime average.
 */
export function attendanceSince(studentId: string, lessonEvents: LessonEventView[], sinceISO: string): AttendanceSince {
  const since = sinceISO.slice(0, 10);
  const recorded = lessonEvents.filter((e) => isRecorded(e) && e.date > since);
  const attended = recorded.filter((e) => e.register.attendance[studentId] === "present").length;
  return {
    attended,
    expected: recorded.length,
    rate: recorded.length ? Math.round((attended / recorded.length) * 100) : null,
  };
}

export interface PaceStatus {
  /** How many lessons the cohort's own ideal plan (its real start date,
   * teaching days, and lessons-per-session) says should be done by now. */
  expectedByNow: number;
  actual: number;
  /** Positive = behind pace, 0 = on pace, negative = ahead of pace. */
  gap: number;
}

/**
 * No stored "pace" figure — it's re-derived every time by re-running the
 * generator with the cohort's real settings and counting how many lessons
 * its *ideal* schedule says should be done by today, then comparing to
 * what's actually recorded. Postponing a lesson (src/lib/actions/schedule.ts)
 * changes future dates, not this formula — the gap just naturally closes
 * back toward 0 as recorded lessons catch up to wherever the reflowed
 * schedule now expects them to be.
 *
 * `segments` (from `cohort_schedule_period`, ascending by `startsAtPosition`)
 * let a deliberate mid-cohort cadence change re-baseline the target from
 * the change point on, instead of either rewriting the whole ideal
 * schedule from day one (wrong: it'd judge already-taught weeks by a
 * cadence that wasn't in force then) or never changing it at all (wrong:
 * the gap would keep growing forever after a real, approved slowdown). An
 * empty list (the common case — most cohorts never change cadence)
 * behaves exactly like the old flat single-cadence calculation.
 */
export function computePace(
  cohort: Pick<Cohort, "startDate" | "teachingDays" | "lessonsPerSession" | "intervalWeeks">,
  segments: ScheduleSegment[],
  recordedCount: number,
  todayISO: string
): PaceStatus {
  const events = buildIdealSchedule(cohort, segments);
  const expectedByNow = events.filter((e) => e.kind === "lesson" && e.date <= todayISO).length;
  return { expectedByNow, actual: recordedCount, gap: expectedByNow - recordedCount };
}
