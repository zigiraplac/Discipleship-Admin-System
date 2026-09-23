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

export interface PersonFootprintItem {
  label: string;
  count: number;
  /** Which cohort(s) this activity is tied to, where the source table has
   * one to point to — empty when the row has no cohort at all (e.g. an
   * `audit_log` entry from before schedule-affecting actions started
   * recording `cohort_id`). */
  cohortNames: string[];
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Rows joined one level, straight to a cohort: `{ cohort: {name} | {name}[] | null }`. */
function namesFromCohortJoin(rows: { cohort: { name: string } | { name: string }[] | null }[]): string[] {
  return [...new Set(rows.map((r) => one(r.cohort)?.name).filter((n): n is string => !!n))];
}

/** Rows joined two levels, through an event: `{ event: { cohort: {name} | {name}[] | null } | [...] | null }`. */
function namesFromEventJoin(rows: { event: { cohort: { name: string } | { name: string }[] | null } | { cohort: { name: string } | { name: string }[] | null }[] | null }[]): string[] {
  return [...new Set(rows.map((r) => one(one(r.event)?.cohort ?? null)?.name).filter((n): n is string => !!n))];
}

/**
 * What's still attached to this person across every `app_user` foreign
 * key that does **not** cascade on delete (`cohort.facilitator_id`,
 * `register.recorded_by`/`updated_by`, `outcome.recorded_by`,
 * `audit_log.actor_id`, `lesson_catchup.recorded_by`,
 * `crusade_report.recorded_by`, `student.contacted_by` — see the
 * migrations for why: those point at `app_user` on purpose, without a
 * cascade, so real history is never silently lost). An empty array means
 * genuinely nothing would block deleting this account outright.
 * `cohort_member` and `notification` are deliberately excluded — both
 * cascade cleanly and aren't why a delete would fail.
 */
export async function getPersonFootprint(db: DB, userId: string): Promise<PersonFootprintItem[]> {
  const [facilitatorOf, registers, outcomes, auditEntries, catchups, crusadeReports, contactedMarks] = await Promise.all([
    db.from("cohort").select("name").eq("facilitator_id", userId),
    db
      .from("register")
      .select("event:event_id(cohort:cohort_id(name))")
      .or(`recorded_by.eq.${userId},updated_by.eq.${userId}`),
    db.from("outcome").select("cohort:cohort_id(name)").eq("recorded_by", userId),
    db.from("audit_log").select("cohort:cohort_id(name)").eq("actor_id", userId),
    db.from("lesson_catchup").select("event:event_id(cohort:cohort_id(name))").eq("recorded_by", userId),
    db.from("crusade_report").select("cohort:cohort_id(name)").eq("recorded_by", userId),
    db.from("student").select("cohort:cohort_id(name)").eq("contacted_by", userId),
  ]);

  for (const res of [facilitatorOf, registers, outcomes, auditEntries, catchups, crusadeReports, contactedMarks]) {
    if (res.error) throw res.error;
  }

  const items: PersonFootprintItem[] = [];
  function add(label: string, rows: unknown[] | null, names: string[]) {
    if (!rows || !rows.length) return;
    items.push({ label, count: rows.length, cohortNames: names });
  }

  add("Set as a cohort's facilitator", facilitatorOf.data, (facilitatorOf.data ?? []).map((r) => r.name));
  add(
    "Attendance registers recorded or corrected",
    registers.data,
    namesFromEventJoin((registers.data ?? []) as never)
  );
  add("Outcomes recorded", outcomes.data, namesFromCohortJoin((outcomes.data ?? []) as never));
  add("Audit-logged actions", auditEntries.data, namesFromCohortJoin((auditEntries.data ?? []) as never));
  add("Catch-ups recorded", catchups.data, namesFromEventJoin((catchups.data ?? []) as never));
  add("Crusade reports recorded", crusadeReports.data, namesFromCohortJoin((crusadeReports.data ?? []) as never));
  add("Students marked contacted", contactedMarks.data, namesFromCohortJoin((contactedMarks.data ?? []) as never));

  return items;
}
