import { cache } from "react";
import type { DB } from "./types";

export interface CrusadeReport {
  theme: string | null;
  preacher: string | null;
  notes: string | null;
  highlights: string | null;
  recordedAt: string;
  recordedByName: string | null;
}

/** One report per crusade weekend that's actually been recorded — keyed
 * by after_class. A weekend with no entry here just hasn't happened yet
 * (or hasn't had its report filled in), same as an un-recorded lesson. */
export const getCrusadeReports = cache(async function getCrusadeReports(
  db: DB,
  cohortId: string
): Promise<Map<number, CrusadeReport>> {
  const { data, error } = await db
    .from("crusade_report")
    .select("after_class, theme, preacher, notes, highlights, recorded_at, recorder:app_user!crusade_report_recorded_by_fkey(name)")
    .eq("cohort_id", cohortId);
  if (error) throw error;

  const map = new Map<number, CrusadeReport>();
  for (const row of data ?? []) {
    if (row.recorded_at == null) continue;
    const recorder = Array.isArray(row.recorder) ? row.recorder[0] : row.recorder;
    map.set(row.after_class, {
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
