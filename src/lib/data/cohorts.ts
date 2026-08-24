import type { DB } from "./types";
import type { Bands, Cohort } from "@/lib/domain/types";
import { DEFAULT_BANDS } from "@/lib/domain/types";

interface CohortRow {
  id: string;
  name: string;
  city: string | null;
  start_date: string;
  teaching_days: number[];
  facilitator_id: string | null;
  status: "running" | "complete" | "archived";
  lessons_per_session: number;
  created_at: string;
  facilitator: { name: string } | { name: string }[] | null;
}

function mapCohortRow(row: CohortRow): Cohort {
  const facilitator = Array.isArray(row.facilitator) ? row.facilitator[0] : row.facilitator;
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    startDate: row.start_date,
    teachingDays: row.teaching_days,
    facilitatorId: row.facilitator_id,
    facilitatorName: facilitator?.name ?? null,
    status: row.status,
    lessonsPerSession: row.lessons_per_session,
    createdAt: row.created_at,
  };
}

const COHORT_SELECT =
  "id, name, city, start_date, teaching_days, facilitator_id, status, lessons_per_session, created_at, facilitator:app_user!cohort_facilitator_id_fkey(name)";

/** RLS scopes this to whatever the signed-in user may see — no manual filtering needed. */
export async function listCohorts(db: DB): Promise<Cohort[]> {
  const { data, error } = await db.from("cohort").select(COHORT_SELECT).order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => mapCohortRow(row as unknown as CohortRow));
}

export async function getCohort(db: DB, cohortId: string): Promise<Cohort | null> {
  const { data, error } = await db
    .from("cohort")
    .select(COHORT_SELECT)
    .eq("id", cohortId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCohortRow(data as unknown as CohortRow) : null;
}

export async function getBands(db: DB): Promise<Bands> {
  const { data, error } = await db
    .from("org_setting")
    .select("key, value")
    .in("key", ["band_active_threshold", "band_help_threshold"]);
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    activeThreshold: map.get("band_active_threshold") ?? DEFAULT_BANDS.activeThreshold,
    helpThreshold: map.get("band_help_threshold") ?? DEFAULT_BANDS.helpThreshold,
  };
}

export async function setBands(db: DB, bands: Bands): Promise<void> {
  const { error } = await db.from("org_setting").upsert([
    { key: "band_active_threshold", value: bands.activeThreshold },
    { key: "band_help_threshold", value: bands.helpThreshold },
  ]);
  if (error) throw error;
}
