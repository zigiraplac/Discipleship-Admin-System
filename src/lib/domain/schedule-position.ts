import type { ScheduleItem } from "./generator";

/**
 * Shared by `postponeLesson` (src/lib/actions/schedule.ts) and
 * `postponeCrusadeWeekend` (src/lib/actions/crusades.ts) — both need to map
 * a fetched `event` row back to its position in `curriculumScheduleItems()`.
 * Pulled out of schedule.ts because a `"use server"` file can only export
 * async server actions; a plain helper function can't live there.
 */
export function scheduleItemKey(item: ScheduleItem): string {
  return item.kind === "lesson" ? `L${item.globalIndex}` : `C${item.afterClass}-${item.crusadeDay}`;
}

export interface EventRow {
  id: string;
  event_date: string;
  kind: "lesson" | "crusade";
  after_class: number | null;
  crusade_day: number | null;
  lesson: { global_index: number } | { global_index: number }[] | null;
  register: { recorded_at: string | null } | { recorded_at: string | null }[] | null;
}

export function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
