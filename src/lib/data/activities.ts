import { cache } from "react";
import type { DB } from "./types";
import { ACTIVITIES_MIGRATION_APPLIED, type ActivityStatus } from "@/lib/domain/activities";

export interface Activity {
  id: string;
  kind: string;
  date: string;
  theme: string | null;
  preacher: string | null;
  status: ActivityStatus;
  notes: string | null;
}

/** A cohort's occasional activities (agape, fellowship, …), oldest first. */
export const getActivities = cache(async function getActivities(db: DB, cohortId: string): Promise<Activity[]> {
  // The activity table arrives with migration 0045.
  if (!ACTIVITIES_MIGRATION_APPLIED) return [];
  const { data, error } = await db
    .from("activity")
    .select("id, kind, activity_date, theme, preacher, status, notes")
    .eq("cohort_id", cohortId)
    .order("activity_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    date: row.activity_date,
    theme: row.theme,
    preacher: row.preacher,
    status: row.status,
    notes: row.notes,
  }));
});
