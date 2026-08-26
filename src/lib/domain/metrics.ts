import { CURRICULUM, classSpans } from "./curriculum";
import { cohortHealth, statusOf } from "./bands";
import { buildEvents } from "./generator";
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
  const recorded = lessonEvents.filter(isRecorded);
  const recordedCount = recorded.length;
  const enrolled = students.length;

  const tally = new Map<string, { attended: number }>();
  for (const s of students) tally.set(s.id, { attended: 0 });

  let totalPresent = 0;
  for (const ev of recorded) {
    const reg = ev.register;
    for (const s of students) {
      if (reg.attendance[s.id] !== "present") continue;
      totalPresent++;
      const t = tally.get(s.id)!;
      t.attended++;
    }
  }

  const roster: StudentAggregate[] = students.map((s, idx) => {
    const t = tally.get(s.id)!;
    const rate = recordedCount ? Math.round((t.attended / recordedCount) * 100) : 0;
    // A brand-new cohort has nothing to judge anyone by yet — don't flag
    // every student "At risk" just because no register has been saved.
    // The attention loop only starts once there's at least one recorded
    // lesson (04-interactions-and-state.md: "0 and — are not interchangeable").
    const status = recordedCount === 0 ? "On track" : statusOf(rate, bands);
    return {
      ...s,
      idx,
      attended: t.attended,
      expected: recordedCount,
      missed: recordedCount - t.attended,
      rate,
      status,
    };
  });

  const rate =
    enrolled && recordedCount
      ? Math.round((totalPresent / (enrolled * recordedCount)) * 100)
      : 0;
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

export function lessonStats(ev: LessonEventView, enrolled: number): LessonStats | null {
  if (!isRecorded(ev)) return null;
  const present = Object.values(ev.register.attendance).filter((v) => v === "present").length;
  return {
    present,
    absent: enrolled - present,
    rate: enrolled ? Math.round((present / enrolled) * 100) : 0,
  };
}

export function classRate(
  lessonEvents: LessonEventView[],
  classIndex: number,
  enrolled: number
): number | null {
  const inClass = lessonEvents.filter((e) => e.classIndex === classIndex && isRecorded(e));
  if (!inClass.length || !enrolled) return null;
  let present = 0;
  for (const ev of inClass) present += lessonStats(ev, enrolled)!.present;
  return Math.round((present / (enrolled * inClass.length)) * 100);
}

export interface MonthlyRate {
  month: string; // YYYY-MM
  rate: number;
}

export function monthlyRates(
  lessonEvents: LessonEventView[],
  enrolled: number
): MonthlyRate[] {
  const byMonth = new Map<string, { present: number; n: number }>();
  for (const ev of lessonEvents) {
    if (!isRecorded(ev) || !enrolled) continue;
    const key = ev.date.slice(0, 7);
    const s = lessonStats(ev, enrolled)!;
    const acc = byMonth.get(key) ?? { present: 0, n: 0 };
    acc.present += s.present;
    acc.n += enrolled;
    byMonth.set(key, acc);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { present, n }]) => ({ month, rate: n ? Math.round((present / n) * 100) : 0 }));
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
 */
export function computePace(
  cohort: Pick<Cohort, "startDate" | "teachingDays" | "lessonsPerSession">,
  recordedCount: number,
  todayISO: string
): PaceStatus {
  const events = buildEvents(cohort.startDate, cohort.teachingDays, cohort.lessonsPerSession);
  const expectedByNow = events.filter((e) => e.kind === "lesson" && e.date <= todayISO).length;
  return { expectedByNow, actual: recordedCount, gap: expectedByNow - recordedCount };
}
