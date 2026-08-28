import type { DB } from "./types";

/** Which of a student's present marks came from a catch-up correction
 * rather than being there on the day — a plain set of event ids, cheap to
 * check against while rendering the attendance grid amber. */
export async function getCatchupEventIds(db: DB, studentId: string): Promise<Set<string>> {
  const { data, error } = await db.from("lesson_catchup").select("event_id").eq("student_id", studentId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.event_id));
}

/** How many active students' present mark, per event, came from a
 * catch-up correction rather than being there on the day — for the
 * Dashboard attendance chart's stacked "attended / caught up / absent"
 * breakdown. Left students are excluded the same way `activeIds` already
 * excludes them everywhere else present/absent is tallied. */
export async function getCatchupCountsByEvent(
  db: DB,
  eventIds: string[],
  activeIds: Set<string>
): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const { data, error } = await db.from("lesson_catchup").select("student_id, event_id").in("event_id", eventIds);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!activeIds.has(row.student_id)) continue;
    counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  }
  return counts;
}
