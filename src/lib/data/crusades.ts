import { cache } from "react";
import type { DB } from "./types";

/** Which crusade weekends (by after_class) have been manually marked as
 * done. Cached per request for the same reason as the other data
 * fetchers — Reports is the only current caller, but keeping the pattern
 * consistent costs nothing. */
export const getCrusadeCompletions = cache(async function getCrusadeCompletions(
  db: DB,
  cohortId: string
): Promise<Set<number>> {
  const { data, error } = await db
    .from("crusade_completion")
    .select("after_class")
    .eq("cohort_id", cohortId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.after_class));
});
