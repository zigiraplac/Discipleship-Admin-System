import { cache } from "react";
import type { DB } from "./types";
import { ACTIVITIES_MIGRATION_APPLIED } from "@/lib/domain/activities";

export interface CrusadeReport {
  /** "done" = the weekend happened; "not_done" = it didn't, with notes on why. */
  status: "done" | "not_done";
  theme: string | null;
  preacher: string | null;
  notes: string | null;
  highlights: string | null;
  recordedAt: string;
  recordedByName: string | null;
}

/** One report per crusade weekend that's been recorded — keyed by
 * after_class. A weekend with no entry here hasn't been recorded yet; one
 * with an entry says whether it happened (`status`). */
export const getCrusadeReports = cache(async function getCrusadeReports(
  db: DB,
  cohortId: string
): Promise<Map<number, CrusadeReport>> {
  // Before migration 0045 there's no status column: every report is "done".
  const { data, error } = ACTIVITIES_MIGRATION_APPLIED
    ? await db
        .from("crusade_report")
        .select("after_class, status, theme, preacher, notes, highlights, recorded_at, recorder:app_user!crusade_report_recorded_by_fkey(name)")
        .eq("cohort_id", cohortId)
    : await db
        .from("crusade_report")
        .select("after_class, theme, preacher, notes, highlights, recorded_at, recorder:app_user!crusade_report_recorded_by_fkey(name)")
        .eq("cohort_id", cohortId);
  if (error) throw error;

  const map = new Map<number, CrusadeReport>();
  for (const row of data ?? []) {
    if (row.recorded_at == null) continue;
    const recorder = Array.isArray(row.recorder) ? row.recorder[0] : row.recorder;
    map.set(row.after_class, {
      status: "status" in row ? (row.status as CrusadeReport["status"]) : "done",
      theme: row.theme,
      preacher: row.preacher,
      notes: row.notes,
      highlights: row.highlights,
      recordedAt: row.recorded_at,
      recordedByName: recorder?.name ?? null,
    });
  }
  return map;
});
