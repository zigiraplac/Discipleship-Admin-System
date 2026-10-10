import { CURRICULUM, classSpans } from "./curriculum";
import { cohortHealth, statusOf } from "./bands";
import { buildIdealSchedule, type ScheduleSegment } from "./generator";
import { enrolledOn } from "./enrolment";
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
  /** Due lessons with no register yet, ascending by global index — a
   * reporting gap, not part of any attendance figure. */
  outstanding: LessonEventView[];
  totalPresent: number;
  /** Seats owed on recorded lessons (every student's own `expected`,
   * including students who left later) — the denominator of `rate`. */
  totalExpected: number;
  /** Students currently enrolled (not left). */
  enrolled: number;
}

export function aggregateCohort(
  /** Every student, including those who left — each one is counted only
   * for the recorded lessons they were enrolled for, so leaving never
   * erases their history. The roster includes them too; filter on
   * `leftAt` to show only current students. */
  students: Student[],
  lessonEvents: LessonEventView[],
  bands: Bands,
  todayISO: string
): CohortAggregate {
  const recordedCount = lessonEvents.filter(isRecorded).length;
  const current = students.filter((s) => !s.leftAt);
  const enrolled = current.length;

  // Only recorded lessons count toward attendance. A lesson that's due but
  // whose register nobody has submitted is a missing register (see
  // `registerHealth`) — it says nothing about whether students came.
  const recorded = lessonEvents.filter((e) => isRecorded(e) && e.date <= todayISO).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.globalIndex - b.globalIndex));

  const tally = new Map<
    string,
    { attended: number; expected: number; recovered: number; lastAttendedGlobalIndex: number | null; streak: number }
  >();
  for (const s of students) tally.set(s.id, { attended: 0, expected: 0, recovered: 0, lastAttendedGlobalIndex: null, streak: 0 });

  let totalPresent = 0;
  let totalExpected = 0;
  for (const ev of recorded) {
    const caughtUp = new Set(ev.register.caughtUp ?? []);
    for (const s of students) {
      const t = tally.get(s.id)!;
      const wasPresent = ev.register.attendance[s.id] === "present";
      // "Last attended" is real history regardless of the enrolment
      // window — a backfilled present mark still counts as something they
      // actually attended.
      if (wasPresent && (t.lastAttendedGlobalIndex == null || ev.globalIndex > t.lastAttendedGlobalIndex)) {
        t.lastAttendedGlobalIndex = ev.globalIndex;
      }
      // Owed only while enrolled on the lesson's date.
      if (!enrolledOn(s, ev.date)) continue;
      t.expected++;
      totalExpected++;
      if (wasPresent) {
        t.attended++;
        totalPresent++;
        t.streak = 0;
      } else {
        // The absence stands as recorded (it feeds the inactive streak);
        // a catch-up is counted alongside it, never instead of it.
        t.streak++;
        if (caughtUp.has(s.id)) t.recovered++;
      }
    }
  }

  const roster: StudentAggregate[] = students.map((s, idx) => {
    const t = tally.get(s.id)!;
    const absences = t.expected - t.attended;
    const rate = t.expected ? Math.round((t.attended / t.expected) * 100) : 0;
    const effectiveRate = t.expected ? Math.round(((t.attended + t.recovered) / t.expected) * 100) : 0;
    // Nobody is judged before a recorded lesson is owed: `performance`
    // says "Not started", and `status` stays "On track" for older callers
    // that read it directly (04-interactions-and-state.md).
    const status = t.expected === 0 ? "On track" : statusOf(effectiveRate, bands);
    return {
      ...s,
      idx,
      attended: t.attended,
      expected: t.expected,
      absences,
      recovered: t.recovered,
      missed: absences - t.recovered,
      rate,
      effectiveRate,
      status,
      performance: t.expected === 0 ? "Not started" : status,
      lastAttendedGlobalIndex: t.lastAttendedGlobalIndex,
      currentMissStreak: t.streak,
    };
  });

  // Cohort attendance = every owed seat on recorded lessons, including the
  // seats of students who've since left (their attendance happened).
  const rate = totalExpected ? Math.round((totalPresent / totalExpected) * 100) : 0;
  const atRisk = roster.filter((r) => !r.leftAt && r.performance !== "On track" && r.performance !== "Not started").length;

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
    totalExpected,
    enrolled,
  };
}

/** The student fields every seat count needs — who they are and their
 * enrolment history. Pass every student, including those who left. */
export type SeatStudent = Pick<Student, "id" | "enrolledAt" | "leftAt" | "enrolment">;

/**
 * One lesson's seats: the single unit every attendance percentage in the
 * app is built from, so no screen can quietly use a different formula.
 *
 * - `eligible` counts the students enrolled on the lesson's date (joined
 *   by then, not yet left) — whatever happened to them afterwards.
 * - `expected` is `eligible` for a recorded lesson and 0 otherwise: a due
 *   lesson with no register is a missing register, not an absence, so it
 *   stays out of every attendance rate until someone records it.
 * - `present` counts present marks among those eligible students.
 * - `due` is false for a future lesson.
 */
export interface LessonSeats {
  date: string;
  due: boolean;
  recorded: boolean;
  eligible: number;
  expected: number;
  present: number;
}

export function lessonSeats(ev: LessonEventView, students: SeatStudent[], todayISO: string): LessonSeats {
  const recorded = isRecorded(ev);
  let eligible = 0;
  let present = 0;
  for (const s of students) {
    if (!enrolledOn(s, ev.date)) continue;
    eligible++;
    if (recorded && ev.register.attendance[s.id] === "present") present++;
  }
  return { date: ev.date, due: ev.date <= todayISO, recorded, eligible, expected: recorded ? eligible : 0, present };
}

export interface SeatTotals {
  present: number;
  expected: number;
  /** null when no recorded lesson is in the set — "no data", never a fake 0%. */
  rate: number | null;
}

/** Sums any set of lessons (a period, a month, a class, the whole cohort)
 * into one rate. Only due, recorded lessons contribute (an unrecorded
 * lesson's `expected` is 0). */
export function seatTotals(rows: Pick<LessonSeats, "due" | "expected" | "present">[]): SeatTotals {
  let present = 0;
  let expected = 0;
  for (const r of rows) {
    if (!r.due) continue;
    present += r.present;
    expected += r.expected;
  }
  return { present, expected, rate: expected ? Math.round((present / expected) * 100) : null };
}

/** Is the paperwork keeping up? Separate from attendance on purpose: a
 * missing register is a reporting problem, not a student's absence. */
export interface RegisterHealth {
  /** Lessons whose date has arrived. */
  due: number;
  /** Of those, how many have a submitted register. */
  recorded: number;
  /** due − recorded. */
  missing: number;
  /** recorded ÷ due, 0..100; null when nothing is due yet. */
  completion: number | null;
}

export function registerHealth(lessonEvents: LessonEventView[], todayISO: string): RegisterHealth {
  const due = lessonEvents.filter((e) => e.date <= todayISO);
  const recorded = due.filter(isRecorded).length;
  return {
    due: due.length,
    recorded,
    missing: due.length - recorded,
    completion: due.length ? Math.round((recorded / due.length) * 100) : null,
  };
}

/**
 * Students a register save would contradict: they made this lesson up
 * (a catch-up exists), so their mark must stay "absent" — the catch-up is
 * the record that they recovered it. The database enforces the same rule
 * (register_keeps_catchups, 0034); this lets the app say so plainly first.
 */
export function catchupConflicts(attendance: Record<string, "present" | "absent">, caughtUp: string[]): string[] {
  return caughtUp.filter((id) => attendance[id] === "present");
}

/**
 * Curriculum order, schedule order and recording order can differ: a
 * register may be taken for lesson 30 while lesson 20 is still missing.
 * That's allowed — these say what's out of step so the screen can warn.
 */
export function earlierUnrecorded(lessonEvents: LessonEventView[], ev: LessonEventView, todayISO: string): LessonEventView[] {
  return lessonEvents
    .filter((e) => e.globalIndex < ev.globalIndex && e.date <= todayISO && !isRecorded(e))
    .sort((a, b) => a.globalIndex - b.globalIndex);
}

export function laterRecorded(lessonEvents: LessonEventView[], ev: LessonEventView): LessonEventView[] {
  return lessonEvents.filter((e) => e.globalIndex > ev.globalIndex && isRecorded(e)).sort((a, b) => a.globalIndex - b.globalIndex);
}

/** When a cohort finished — marked complete, or every lesson recorded —
 * as the last recorded lesson's date (today if none); null while running.
 * Finished cohorts are judged by the policy in force on this date. */
export function cohortFinishedOn(cohort: Pick<Cohort, "status">, lessonEvents: LessonEventView[], todayISO: string): string | null {
  const recorded = lessonEvents.filter(isRecorded);
  const allRecorded = lessonEvents.length > 0 && recorded.length === lessonEvents.length;
  if (cohort.status !== "complete" && !allRecorded) return null;
  return recorded.map((e) => e.date).sort().pop() ?? todayISO;
}

export interface LessonStats {
  present: number;
  absent: number;
  /** Students who were owed this lesson (joined on or before its date). */
  expected: number;
  rate: number;
}

/** A recorded lesson's own headcount, from the same seat rule as every
 * other figure. Null for a lesson that hasn't been recorded. Pass every
 * student: whoever was enrolled that day counts, even if they left since. */
export function lessonStats(ev: LessonEventView, students: SeatStudent[]): LessonStats | null {
  if (!isRecorded(ev)) return null;
  const seats = lessonSeats(ev, students, ev.date);
  return {
    present: seats.present,
    absent: seats.expected - seats.present,
    expected: seats.expected,
    rate: seats.expected ? Math.round((seats.present / seats.expected) * 100) : 0,
  };
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
export function studentMonthlyRates(
  student: SeatStudent,
  lessonEvents: LessonEventView[],
  todayISO: string
): StudentMonthlyRate[] {
  const byMonth = new Map<string, { attended: number; expected: number }>();
  for (const ev of lessonEvents) {
    const seats = lessonSeats(ev, [student], todayISO);
    if (!seats.due || !seats.recorded || !seats.expected) continue;
    const key = ev.date.slice(0, 7);
    const acc = byMonth.get(key) ?? { attended: 0, expected: 0 };
    acc.expected++;
    acc.attended += seats.present;
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
  classIndex: number
): ClassMark[] {
  return lessonEvents
    .filter((e) => e.classIndex === classIndex)
    .map((ev) => {
      if (!isRecorded(ev)) return { status: "not-taught" as const, ev };
      const mark = ev.register.attendance[studentId];
      if (mark === "present") return { status: "present" as const, ev };
      // Absent on the day; "caught-up" = that absence was made up later.
      if (ev.register.caughtUp?.includes(studentId)) return { status: "caught-up" as const, ev };
      return { status: "absent" as const, ev };
    });
}

export interface AttendanceSince {
  attended: number;
  expected: number;
  rate: number | null; // null when no lesson has been recorded since sinceISO yet
}

/**
 * "Are they actually attending now" — a student's overall rate is a
 * cumulative average since enrollment, which can take a long time to
 * recover even once someone's genuinely back on track. This instead only
 * looks at lessons due *after* a given date (a catch-up decision's
 * `recordedAt`), so following up on a catch-up plan has a real, honest
 * number to check rather than watching a slow-moving lifetime average.
 * Same seat rule as everything else: only recorded lessons count.
 */
export function attendanceSince(
  student: SeatStudent,
  lessonEvents: LessonEventView[],
  sinceISO: string,
  todayISO: string
): AttendanceSince {
  const since = sinceISO.slice(0, 10);
  const totals = seatTotals(
    lessonEvents.filter((e) => e.date > since).map((e) => lessonSeats(e, [student], todayISO))
  );
  return { attended: totals.present, expected: totals.expected, rate: totals.rate };
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
 * `segments` (from `cohort_schedule_period`) are approved cadence changes.
 * Each applies from the date it took effect: the plan before that date is
 * the original one, so a change can never make a cohort look less behind
 * than it already was (see buildIdealSchedule). An empty list — most
 * cohorts — is the single original cadence.
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
