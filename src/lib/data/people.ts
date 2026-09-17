import type { DB } from "./types";
import type { AppUser, Role } from "@/lib/domain/types";

export async function getPeople(db: DB): Promise<AppUser[]> {
  const { data, error } = await db
    .from("app_user")
    .select("id, name, email, role, state")
    .order("name");
  if (error) throw error;
  return (data ?? []) as AppUser[];
}

export interface PersonCohortScope {
  userId: string;
  cohortNames: string[];
  capacities: ("facilitator" | "teacher")[];
}

/** For Settings → People: what each person can see, as display text
 * ("Ghana, Kigali" / "All · read only" / "Unassigned") — and, via
 * `cohortId`, which cohorts to pre-check when editing that person's
 * assignment. */
export async function getCohortScopesByUser(
  db: DB
): Promise<Map<string, { cohortId: string; cohortName: string; capacity: string }[]>> {
  const { data, error } = await db
    .from("cohort_member")
    .select("user_id, capacity, cohort:cohort_id(id, name)");
  if (error) throw error;

  const map = new Map<string, { cohortId: string; cohortName: string; capacity: string }[]>();
  for (const row of data ?? []) {
    const cohort = Array.isArray(row.cohort) ? row.cohort[0] : row.cohort;
    if (!cohort) continue;
    const list = map.get(row.user_id) ?? [];
    list.push({ cohortId: cohort.id, cohortName: cohort.name, capacity: row.capacity });
    map.set(row.user_id, list);
  }
  return map;
}

export function describeScope(role: Role, scopes?: { cohortName: string }[]): string {
  if (role === "admin") return "All cohorts";
  if (role === "leadership") return "All · read only";
  if (!scopes || !scopes.length) return "Unassigned";
  return scopes.map((s) => s.cohortName).join(", ");
}
