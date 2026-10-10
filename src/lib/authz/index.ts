import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllUnits, getUnitLeaderContacts } from "@/lib/data/org";
import { cohortStewardOf, stewardOf } from "@/lib/domain/responsibility";
import type { AppUser, OrgUnit } from "@/lib/domain/types";
import { capabilitiesOn, decide, type Capability, type Decision, type Responsibility, type Target } from "./policy";

export type { Capability, Decision, Responsibility, Target } from "./policy";

/**
 * The authorization boundary. Every server action and page that reads or
 * changes something sensitive asks here — never `user.role === …` — and
 * the database applies the same tiers underneath (0036). Reads that use
 * the service role (level roll-ups) must call `requireCapability` first.
 */

/** Everything this person is responsible for. Read with the service role:
 * it's their own memberships, needed before any other check can run. */
export const getResponsibilities = cache(async function getResponsibilities(user: AppUser): Promise<Responsibility[]> {
  const db = createAdminClient();
  const [units, { data: unitRows, error: unitErr }, { data: cohortRows, error: cohortErr }] = await Promise.all([
    getAllUnits(),
    db.from("org_unit_member").select("org_unit_id, role").eq("user_id", user.id),
    db.from("cohort_member").select("cohort_id, capacity, cohort:cohort_id(name)").eq("user_id", user.id),
  ]);
  if (unitErr) throw unitErr;
  if (cohortErr) throw cohortErr;

  const out: Responsibility[] = [];
  if (user.role === "admin") out.push({ kind: "system", role: "admin" });
  const byId = new Map(units.map((u) => [u.id, u]));
  for (const row of unitRows ?? []) {
    const u = byId.get(row.org_unit_id);
    if (!u) continue;
    out.push({ kind: "unit", unitId: u.id, unitName: u.name, unitType: u.type, unitPath: u.path, role: row.role as "leader" | "viewer" });
  }
  for (const row of cohortRows ?? []) {
    const c = Array.isArray(row.cohort) ? row.cohort[0] : row.cohort;
    out.push({ kind: "cohort", cohortId: row.cohort_id, cohortName: c?.name?.trim() ?? "Cohort", capacity: row.capacity as "facilitator" | "teacher" });
  }
  return out;
});

export function unitTarget(unit: OrgUnit): Target {
  return { kind: "unit", unitId: unit.id, unitPath: unit.path, unitType: unit.type };
}

/** A cohort as a target: where it sits in the hierarchy decides which
 * levels above can see it. */
export const cohortTarget = cache(async function cohortTarget(cohortId: string): Promise<Target> {
  const { data, error } = await createAdminClient().from("cohort").select("org_unit_id").eq("id", cohortId).maybeSingle();
  if (error) throw error;
  const unit = data?.org_unit_id ? (await getAllUnits()).find((u) => u.id === data.org_unit_id) : undefined;
  return { kind: "cohort", cohortId, unitPath: unit?.path ?? null, unitId: unit?.id ?? null };
});

export async function authorize(capability: Capability, target: Target, user?: AppUser): Promise<Decision & { user: AppUser }> {
  const u = user ?? (await requireUser());
  return { ...decide(await getResponsibilities(u), capability, await withSteward(target)), user: u };
}

/** Fill in who staffs a level or a cohort (manage_staff, remove_unit,
 * manage_cohort_staff). */
async function withSteward(target: Target): Promise<Target> {
  if (target.kind === "system" || target.stewardId !== undefined) return target;
  const [units, leaders] = await Promise.all([getAllUnits(), getUnitLeaderContacts()]);
  const byId = new Map(units.map((x) => [x.id, x]));
  const hasLeader = (id: string) => (leaders.get(id)?.length ?? 0) > 0;
  if (target.kind === "cohort") {
    return { ...target, stewardId: target.unitId ? cohortStewardOf(target.unitId, byId, hasLeader).stewardId : null };
  }
  const unit = byId.get(target.unitId);
  return { ...target, stewardId: unit ? stewardOf(unit, byId, hasLeader) : null };
}

/** Throws a plain-language error when not allowed; returns the user. */
export async function requireCapability(capability: Capability, target: Target): Promise<AppUser> {
  const d = await authorize(capability, target);
  if (!d.allowed) throw new Error(d.reason);
  return d.user;
}

/** Everything the signed-in person may do on one cohort — for pages to
 * decide what to show and enable. */
export const cohortCapabilities = cache(async function cohortCapabilities(cohortId: string): Promise<Set<Capability>> {
  const user = await requireUser();
  const [responsibilities, target] = await Promise.all([getResponsibilities(user), cohortTarget(cohortId)]);
  return capabilitiesOn(responsibilities, await withSteward(target));
});

export async function unitCapabilities(unit: OrgUnit): Promise<Set<Capability>> {
  const user = await requireUser();
  return capabilitiesOn(await getResponsibilities(user), await withSteward(unitTarget(unit)));
}

export async function systemCapabilities(): Promise<Set<Capability>> {
  const user = await requireUser();
  return capabilitiesOn(await getResponsibilities(user), { kind: "system" });
}
