import type { DB } from "./types";

/** Which of a student's present marks came from a catch-up correction
 * rather than being there on the day — a plain set of event ids, cheap to
 * check against while rendering the attendance grid amber. */
export async function getCatchupEventIds(db: DB, studentId: string): Promise<Set<string>> {
  const { data, error } = await db.from("lesson_catchup").select("event_id").eq("student_id", studentId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.event_id));
}
