import { CURRICULUM, classSpans } from "./curriculum";
import { cohortHealth, statusOf } from "./bands";
import type {
  Bands,
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
  quizAvg: number;
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

  const tally = new Map<
    string,
    { attended: number; quizSum: number; quizN: number }
  >();
  for (const s of students) tally.set(s.id, { attended: 0, quizSum: 0, quizN: 0 });

  let totalPresent = 0;
  for (const ev of recorded) {
    const reg = ev.register;
    for (const s of students) {
      if (reg.attendance[s.id] !== "present") continue;
      totalPresent++;
      const t = tally.get(s.id)!;
      t.attended++;
      if (ev.hasQuiz) {
        const score = reg.quiz[s.id];
        if (typeof score === "number") {
          t.quizSum += score;
          t.quizN++;
        }
      }
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
      quizAvg: t.quizN ? Math.round(t.quizSum / t.quizN) : null,
      status,
    };
  });

  const rate =
    enrolled && recordedCount
      ? Math.round((totalPresent / (enrolled * recordedCount)) * 100)
      : 0;
  const atRisk = roster.filter((r) => r.status !== "On track").length;
  const withQuiz = roster.filter((r) => r.quizAvg !== null);
  const quizAvg = withQuiz.length
    ? Math.round(withQuiz.reduce((a, r) => a + (r.quizAvg ?? 0), 0) / withQuiz.length)
    : 0;

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
    quizAvg,
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

export function lessonQuizAvg(ev: LessonEventView): number | null {
  if (!isRecorded(ev) || !ev.hasQuiz) return null;
  const scores = Object.entries(ev.register.quiz)
    .filter(([sid]) => ev.register.attendance[sid] === "present")
    .map(([, v]) => v)
    .filter((v) => typeof v === "number");
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
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

export type ClassMarkStatus = "present" | "absent" | "not-taught";

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
      return { status: (mark === "present" ? "present" : "absent") as ClassMarkStatus, ev };
    });
}

export function studentQuizScore(studentId: string, ev: LessonEventView): number | null {
  if (!isRecorded(ev)) return null;
  const v = ev.register.quiz[studentId];
  return typeof v === "number" ? v : null;
}
