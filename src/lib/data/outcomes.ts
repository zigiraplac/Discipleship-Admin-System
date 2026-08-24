import type { DB } from "./types";
import type { Outcome } from "@/lib/domain/types";

interface OutcomeRow {
  id: string;
  student_id: string;
  cohort_id: string;
  kind: "catchup" | "continuing" | "left";
  note: string | null;
  recorded_by: string;
  recorded_at: string;
  recorder: { name: string } | { name: string }[] | null;
}

function mapOutcomeRow(row: OutcomeRow): Outcome {
  const recorder = Array.isArray(row.recorder) ? row.recorder[0] : row.recorder;
  return {
    id: row.id,
    studentId: row.student_id,
    cohortId: row.cohort_id,
    kind: row.kind,
    note: row.note,
    recordedBy: row.recorded_by,
    recordedByName: recorder?.name ?? null,
    recordedAt: row.recorded_at,
  };
}

const OUTCOME_SELECT =
  "id, student_id, cohort_id, kind, note, recorded_by, recorded_at, recorder:app_user!outcome_recorded_by_fkey(name)";

/** Append-only history, newest first, for every student in a cohort. */
export async function getOutcomesForCohort(db: DB, cohortId: string): Promise<Outcome[]> {
  const { data, error } = await db
    .from("outcome")
    .select(OUTCOME_SELECT)
    .eq("cohort_id", cohortId)
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapOutcomeRow(row as unknown as OutcomeRow));
}

export async function getOutcomesForStudent(db: DB, studentId: string): Promise<Outcome[]> {
  const { data, error } = await db
    .from("outcome")
    .select(OUTCOME_SELECT)
    .eq("student_id", studentId)
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapOutcomeRow(row as unknown as OutcomeRow));
}

/** Latest outcome per student — the stage a card/row shows at a glance. */
export function latestByStudent(outcomes: Outcome[]): Map<string, Outcome> {
  const map = new Map<string, Outcome>();
  for (const o of outcomes) {
    if (!map.has(o.studentId)) map.set(o.studentId, o); // already newest-first
  }
  return map;
}
