import { CURRICULUM } from "./curriculum";

/**
 * The event generator. Rule, verbatim from 02-domain-model.md:
 *
 *   for each class in curriculum (1..7):
 *     for each lesson in class:
 *       advance the cursor to the next active teaching day
 *       emit a lesson event on that date
 *       advance the cursor by one day
 *     advance the cursor to the next Friday
 *     emit three crusade events: that Friday, Saturday, Sunday
 *     advance the cursor past the Sunday
 *
 * Crusades are always a contiguous Friday→Saturday→Sunday, never three
 * arbitrary teaching days — scattering them across teaching slots was a
 * real bug in an earlier version. Dates are calendar dates only (no
 * timezone); computed at UTC noon internally to sidestep DST arithmetic,
 * then serialized as plain `YYYY-MM-DD`.
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
  crusadeDay: number; // 0..2
}

export type GeneratedEvent = GeneratedLessonEvent | GeneratedCrusadeEvent;

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

const MAX_GUARD = 500;

export function buildEvents(
  startISO: string,
  teachingDays: number[]
): GeneratedEvent[] {
  const days = new Set(teachingDays);
  let cursor = parseISODate(startISO);
  const events: GeneratedEvent[] = [];
  let globalIndex = 0;

  const advanceTo = (pred: (d: Date) => boolean) => {
    let guard = 0;
    while (!pred(cursor) && guard++ < MAX_GUARD) cursor = addDays(cursor, 1);
  };

  for (const cls of CURRICULUM) {
    for (let li = 0; li < cls.lessons.length; li++) {
      advanceTo((d) => days.has(d.getUTCDay()));
      events.push({
        kind: "lesson",
        date: toISODate(cursor),
        globalIndex,
        classNumber: cls.n,
      });
      globalIndex++;
      cursor = addDays(cursor, 1);
    }
    advanceTo((d) => d.getUTCDay() === 5);
    for (let k = 0; k < 3; k++) {
      events.push({
        kind: "crusade",
        date: toISODate(cursor),
        afterClass: cls.n,
        crusadeDay: k,
      });
      cursor = addDays(cursor, 1);
    }
  }
  return events;
}

export function lastLessonDate(events: GeneratedEvent[]): string | null {
  const lessons = events.filter((e): e is GeneratedLessonEvent => e.kind === "lesson");
  return lessons.length ? lessons[lessons.length - 1].date : null;
}
