import { cache } from "react";
import type { DB } from "./types";
import type { Bands, Cohort } from "@/lib/domain/types";
import { DEFAULT_BANDS } from "@/lib/domain/types";

interface CohortRow {
  id: string;
  name: string;
  city: string | null;
  start_date: string;
  teaching_days: number[];
  status: "running" | "complete" | "archived";
  lessons_per_session: number;
  created_at: string;
}

const COHORT_SELECT =
  "id, name, city, start_date, teaching_days, status, lessons_per_session, created_at";

/**
 * `cohort.facilitator_id` looks like the obvious source for this but is
 * never actually written by any write path in the app — a facilitator is
 * attached to a cohort through `cohort_member` (Settings → People → Add
 * person), which is the only place that column would need updating too,
 * and it never has been. Reading `facilitator_id` here always resolved to
 * null, which is why "Facilitator" showed as unassigned even for cohorts
 * that genuinely have one. `cohort_member` is the real source of truth.
 */
async function getFacilitatorNamesByCohort(db: DB, cohortIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!cohortIds.length) return map;
  const { data, error } = await db
    .from("cohort_member")
    .select("cohort_id, app_user:user_id(name)")
    .eq("capacity", "facilitator")
    .in("cohort_id", cohortIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const user = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    if (!user) continue;
    const list = map.get(row.cohort_id) ?? [];
    list.push(user.name);
    map.set(row.cohort_id, list);
  }
  return map;
}

function mapCohortRow(row: CohortRow, facilitatorNames: string[]): Cohort {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    startDate: row.start_date,
    teachingDays: row.teaching_days,
    facilitatorName: facilitatorNames.length ? facilitatorNames.join(", ") : null,
    status: row.status,
    lessonsPerSession: row.lessons_per_session,
    createdAt: row.created_at,
  };
}

/**
 * RLS scopes this to whatever the signed-in user may see — no manual
 * filtering needed. Cached per request: Shell calls this for the cohort
 * switcher, and cohort-listing pages (Cohorts, Settings) call it again
 * for the same render — without this they'd each pay for it separately.
 */
export const listCohorts = cache(async function listCohorts(db: DB): Promise<Cohort[]> {
  const { data, error } = await db.from("cohort").select(COHORT_SELECT).order("created_at");
  if (error) throw error;
  const rows = (data ?? []) as unknown as CohortRow[];
  const facilitatorsByCohort = await getFacilitatorNamesByCohort(
    db,
    rows.map((r) => r.id)
  );
  return rows.map((row) => mapCohortRow(row, facilitatorsByCohort.get(row.id) ?? []));
});

/** Cached per request — every cohort-scoped page calls this for the
 * active cohort, same as Shell does for its own header/nav needs. */
export const getCohort = cache(async function getCohort(db: DB, cohortId: string): Promise<Cohort | null> {
  const [{ data, error }, facilitatorsByCohort] = await Promise.all([
    db.from("cohort").select(COHORT_SELECT).eq("id", cohortId).maybeSingle(),
    getFacilitatorNamesByCohort(db, [cohortId]),
  ]);
  if (error) throw error;
  if (!data) return null;
  return mapCohortRow(data as unknown as CohortRow, facilitatorsByCohort.get(cohortId) ?? []);
});

/** Cached per request — nearly every page fetches the org's band
 * thresholds, and so does Shell. */
export const getBands = cache(async function getBands(db: DB): Promise<Bands> {
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
});

export async function setBands(db: DB, bands: Bands): Promise<void> {
  const { error } = await db.from("org_setting").upsert([
    { key: "band_active_threshold", value: bands.activeThreshold },
    { key: "band_help_threshold", value: bands.helpThreshold },
  ]);
  if (error) throw error;
}
