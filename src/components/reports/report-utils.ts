import type { CrusadeEventView } from "@/lib/domain/types";

export type Period = "Month" | "Quarter" | "All";

/** Normalized lesson shape Reports needs — built server-side from either the
 * full register view (facilitator/admin/leadership) or the public aggregate
 * view (teacher). Deliberately mirrors `LessonPublicView`'s aggregate-only
 * fields so both roles feed the same downstream maths without re-deriving
 * anything from `src/lib/domain/metrics.ts` (left untouched per instructions —
 * the small aggregations below are local equivalents, not edits to it). */
export interface ReportLesson {
  eventId: string;
  date: string; // YYYY-MM-DD
  globalIndex: number;
  classIndex: number;
  classNumber: number;
  lessonRef: string;
  lessonTitle: string;
  recorded: boolean;
  present: number | null;
  absent: number | null;
  rate: number | null;
}

export interface MonthlyRate {
  month: string; // YYYY-MM
  rate: number;
}

export interface CrusadeWeekend {
  afterClass: number;
  friday: string;
  saturday: string;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = m - 1 + delta;
  const y2 = y + Math.floor(idx / 12);
  const m2 = (((idx % 12) + 12) % 12) + 1;
  return { y: y2, m: m2 };
}

/** Resolve the [start, end] ISO date window for the period selector.
 * "All" spans the cohort's first-to-last *recorded* lesson (or just today,
 * if nothing has been recorded yet). */
export function resolvePeriodRange(
  period: Period,
  today: string,
  lessons: ReportLesson[]
): { start: string; end: string } {
  const [ty, tm] = today.split("-").map(Number);

  if (period === "Month") {
    return { start: ymd(ty, tm, 1), end: ymd(ty, tm, daysInMonth(ty, tm)) };
  }
  if (period === "Quarter") {
    const from = shiftMonth(ty, tm, -2);
    return { start: ymd(from.y, from.m, 1), end: ymd(ty, tm, daysInMonth(ty, tm)) };
  }

  const recordedDates = lessons
    .filter((l) => l.recorded)
    .map((l) => l.date)
    .sort();
  if (recordedDates.length === 0) return { start: today, end: today };
  return { start: recordedDates[0], end: recordedDates[recordedDates.length - 1] };
}

export function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/** "1 – 31 Aug 2026" style range label — collapses the shared month/year
 * when start and end fall in the same one. */
export function formatRangeLabel(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const endLabel = `${ed} ${MONTH_SHORT[em - 1]} ${ey}`;
  if (sy === ey && sm === em) return `${sd} – ${endLabel}`;
  if (sy === ey) return `${sd} ${MONTH_SHORT[sm - 1]} – ${endLabel}`;
  return `${sd} ${MONTH_SHORT[sm - 1]} ${sy} – ${endLabel}`;
}

export function monthLabel(monthKey: string): string {
  const m = Number(monthKey.slice(5, 7));
  return MONTH_SHORT[m - 1] ?? monthKey;
}

/** Local equivalent of `monthlyRates` from domain/metrics.ts, operating on
 * the normalized `ReportLesson[]` shared by both roles. */
export function monthlyRatesFrom(lessons: ReportLesson[], enrolled: number): MonthlyRate[] {
  const byMonth = new Map<string, { present: number; n: number }>();
  for (const l of lessons) {
    if (!l.recorded || !enrolled || l.present == null) continue;
    const key = l.date.slice(0, 7);
    const acc = byMonth.get(key) ?? { present: 0, n: 0 };
    acc.present += l.present;
    acc.n += enrolled;
    byMonth.set(key, acc);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { present, n }]) => ({ month, rate: n ? Math.round((present / n) * 100) : 0 }));
}

/** Local equivalent of `classRate` from domain/metrics.ts. Whole-cohort —
 * never period-filtered (it's a curriculum-progress figure). */
export function classRateFrom(
  lessons: ReportLesson[],
  classIndex: number,
  enrolled: number
): number | null {
  const inClass = lessons.filter((l) => l.classIndex === classIndex && l.recorded);
  if (!inClass.length || !enrolled) return null;
  let present = 0;
  for (const l of inClass) present += l.present ?? 0;
  return Math.round((present / (enrolled * inClass.length)) * 100);
}

/** Groups crusade day-events (0/1) into weekends by `afterClass`. There is
 * no stored "weekend" record — each day is its own event row on a
 * consecutive Fri/Sat date, so the weekend's span is just the min/max
 * date within the group. */
export function crusadeWeekends(events: CrusadeEventView[]): CrusadeWeekend[] {
  const byAfterClass = new Map<number, CrusadeEventView[]>();
  for (const ev of events) {
    const arr = byAfterClass.get(ev.afterClass) ?? [];
    arr.push(ev);
    byAfterClass.set(ev.afterClass, arr);
  }
  const weekends: CrusadeWeekend[] = [];
  for (const [afterClass, evs] of byAfterClass) {
    const sorted = [...evs].sort((a, b) => a.date.localeCompare(b.date));
    const friday = sorted[0]?.date;
    const saturday = sorted[sorted.length - 1]?.date;
    if (friday && saturday) weekends.push({ afterClass, friday, saturday });
  }
  return weekends.sort((a, b) => a.afterClass - b.afterClass);
}
