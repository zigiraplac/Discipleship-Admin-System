import { CURRICULUM } from "./curriculum";

/**
 * The event generator. Rule, verbatim from 02-domain-model.md, extended
 * with a configurable pace (`lessonsPerSession`, default 1 — the
 * original one-lesson-per-teaching-day behavior):
 *
 *   for each class in curriculum (1..7):
 *     for each lesson in class:
 *       advance the cursor to the next active teaching day
 *       emit up to `lessonsPerSession` lesson events on that date
 *       advance the cursor by one day
 *     advance the cursor to the next Friday
 *     emit two crusade events: that Friday, Saturday
 *     advance the cursor past the Saturday
 *
 * Crusades are always a contiguous Friday→Saturday, never arbitrary
 * teaching days — scattering them across teaching slots was a real bug in
 * an earlier version. Dates are calendar dates only (no
 * timezone); computed at UTC noon internally to sidestep DST arithmetic,
 * then serialized as plain `YYYY-MM-DD`.
 *
 * The date-walking logic (`placeSchedule`) is factored out from the
 * "what needs to happen in what order" logic (`curriculumScheduleItems`)
 * so postponing a lesson can reuse the exact same walk over just the
 * not-yet-taught remainder, starting from a later date — see
 * `src/lib/actions/schedule.ts`. This is the one and only place that
 * walk is implemented; a fresh cohort and a reflowed one are both just
 * different inputs to `placeSchedule`.
 */

export interface GeneratedLessonEvent {
  kind: "lesson";
  date: string; // YYYY-MM-DD
  globalIndex: number;
  classNumber: number;
}

export interface GeneratedCrusadeEvent {
  kind: "crusade";
  date: string; // YYYY-MM-DD
  afterClass: number;
  crusadeDay: number; // 0 = Friday, 1 = Saturday
}

export type GeneratedEvent = GeneratedLessonEvent | GeneratedCrusadeEvent;

/** A schedule item is "what" (a lesson or a crusade day, in curriculum
 * order) with no date yet — `placeSchedule` is what assigns dates. */
export type ScheduleItem =
  | { kind: "lesson"; globalIndex: number; classNumber: number }
  | { kind: "crusade"; afterClass: number; crusadeDay: number };

export function curriculumScheduleItems(): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  let globalIndex = 0;
  for (const cls of CURRICULUM) {
    for (let li = 0; li < cls.lessons.length; li++) {
      items.push({ kind: "lesson", globalIndex, classNumber: cls.n });
      globalIndex++;
    }
    for (let k = 0; k < 2; k++) {
      items.push({ kind: "crusade", afterClass: cls.n, crusadeDay: k });
    }
  }
  return items;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

/** The calendar day immediately after an ISO date — used to anchor a
 * reflow strictly after the postponed lesson's own (now-missed) date. */
export function dayAfter(iso: string): string {
  return toISODate(addDays(parseISODate(iso), 1));
}

const MAX_GUARD = 500;

/**
 * Walks `items` in order, assigning each a date: `lessonsPerSession`
 * lesson items share one teaching day before the cursor advances; a
 * crusade run (always 2 consecutive items) always starts on the next
 * Friday. Used both for a fresh cohort (the full item list, from the
 * start date) and for a reflow (just the not-yet-taught suffix, from the
 * day after whatever got postponed).
 *
 * `intervalWeeks` (default 1, i.e. every week) gates which weeks count as
 * teaching weeks at all — week 0 is the one containing `startISO` itself,
 * and only every `intervalWeeks`-th week after that is eligible. Only
 * lesson placement respects it; a crusade weekend is a one-off milestone
 * after a class finishes, not a recurring weekly slot, so it always lands
 * on the next Friday regardless.
 */
export function placeSchedule(
  items: ScheduleItem[],
  startISO: string,
  teachingDays: number[],
  lessonsPerSession: number,
  intervalWeeks = 1
): GeneratedEvent[] {
  const days = new Set(teachingDays);
  const anchor = parseISODate(startISO);
  let cursor = anchor;
  const events: GeneratedEvent[] = [];

  const advanceTo = (pred: (d: Date) => boolean) => {
    let guard = 0;
    while (!pred(cursor) && guard++ < MAX_GUARD) cursor = addDays(cursor, 1);
  };

  const isEligibleWeek = (d: Date) => {
    if (intervalWeeks <= 1) return true;
    const daysSinceAnchor = Math.round((d.getTime() - anchor.getTime()) / 86400000);
    return Math.floor(daysSinceAnchor / 7) % intervalWeeks === 0;
  };

  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.kind === "lesson") {
      advanceTo((d) => days.has(d.getUTCDay()) && isEligibleWeek(d));
      const dateStr = toISODate(cursor);
      let placed = 0;
      while (i < items.length && items[i].kind === "lesson" && placed < lessonsPerSession) {
        const li = items[i] as { kind: "lesson"; globalIndex: number; classNumber: number };
        events.push({ kind: "lesson", date: dateStr, globalIndex: li.globalIndex, classNumber: li.classNumber });
        i++;
        placed++;
      }
      cursor = addDays(cursor, 1);
    } else {
      advanceTo((d) => d.getUTCDay() === 5);
      while (i < items.length && items[i].kind === "crusade") {
        const ci = items[i] as { kind: "crusade"; afterClass: number; crusadeDay: number };
        events.push({ kind: "crusade", date: toISODate(cursor), afterClass: ci.afterClass, crusadeDay: ci.crusadeDay });
        cursor = addDays(cursor, 1);
        i++;
      }
    }
  }
  return events;
}

export function buildEvents(
  startISO: string,
  teachingDays: number[],
  lessonsPerSession = 1,
  intervalWeeks = 1
): GeneratedEvent[] {
  return placeSchedule(curriculumScheduleItems(), startISO, teachingDays, lessonsPerSession, intervalWeeks);
}

/**
 * One cadence change, effective from a curriculum position onward — see
 * `cohort_schedule_period` (supabase/migrations/0023_cohort_schedule_periods.sql).
 * A cohort that's never changed cadence has none of these; its schedule is
 * just its own base `teachingDays`/`lessonsPerSession`/`intervalWeeks` from
 * position 0.
 */
export interface ScheduleSegment {
  startsAtPosition: number;
  teachingDays: number[];
  lessonsPerSession: number;
  intervalWeeks: number;
}

export interface BaseCadence {
  startDate: string;
  teachingDays: number[];
  lessonsPerSession: number;
  intervalWeeks: number;
}

/**
 * The cohort's full ideal schedule, replayed segment by segment: the base
 * cadence from position 0 up to the first change, then each recorded
 * change's own cadence for its own range — each segment's dates chained
 * onto the day right after the previous segment's last placed date, so a
 * cadence change never retroactively rewrites what already happened.
 * `segments` must be sorted ascending by `startsAtPosition`.
 */
export function buildIdealSchedule(base: BaseCadence, segments: ScheduleSegment[]): GeneratedEvent[] {
  const items = curriculumScheduleItems();
  const boundaries = [0, ...segments.map((s) => s.startsAtPosition), items.length];
  const cadences = [
    { teachingDays: base.teachingDays, lessonsPerSession: base.lessonsPerSession, intervalWeeks: base.intervalWeeks },
    ...segments,
  ];

  let cursorISO = base.startDate;
  const events: GeneratedEvent[] = [];
  for (let i = 0; i < cadences.length; i++) {
    const slice = items.slice(boundaries[i], boundaries[i + 1]);
    if (!slice.length) continue;
    const c = cadences[i];
    const placed = placeSchedule(slice, cursorISO, c.teachingDays, c.lessonsPerSession, c.intervalWeeks);
    events.push(...placed);
    const last = placed[placed.length - 1];
    if (last) cursorISO = dayAfter(last.date);
  }
  return events;
}

export function lastLessonDate(events: GeneratedEvent[]): string | null {
  const lessons = events.filter((e): e is GeneratedLessonEvent => e.kind === "lesson");
  return lessons.length ? lessons[lessons.length - 1].date : null;
}
