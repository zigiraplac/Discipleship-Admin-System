import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { getCohort, getScheduleSegments, listCohortsInUnits, facilitatorList } from "./cohorts";
import { getStudents } from "./students";
import { getLessonEvents } from "./lessons";
import { getOutcomesForCohort, latestByStudent } from "./outcomes";
import type { DB } from "./types";
import { ancestryOf, descendantsOf } from "@/lib/domain/levels";
import { isResponsibleFor } from "@/lib/domain/responsibility";
import { cohortFacts, type CohortFacts } from "@/lib/domain/rollup";
import type { AppUser, Bands, Cohort, LessonEventView, OrgRole, OrgUnit, OrgUnitDetails, OrgUnitType, StudentAggregate } from "@/lib/domain/types";
import { bandsOf, policyOn, type PolicyVersion } from "@/lib/domain/policy";
import { cohortFinishedOn, isRecorded } from "@/lib/domain/metrics";
import { graduationCheck, studentIntervention, type GraduationCheck } from "@/lib/domain/student-state";
import { todayISO } from "@/lib/utils";

interface OrgUnitRow {
  id: string;
  parent_id: string | null;
  type: OrgUnitType;
  name: string;
  slug: string;
  path: string;
  details: unknown;
}

const UNIT_SELECT = "id, parent_id, type, name, slug, path, details";

function mapUnit(row: OrgUnitRow): OrgUnit {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    slug: row.slug,
    path: row.path,
    details: (row.details ?? {}) as OrgUnitDetails,
  };
}

/**
 * Every box in the organization, read with the service role. The table is
 * small (hundreds of rows at most) and level pages need the whole shape to
 * work out ancestry and children. Callers must check the viewer's access
 * (requireUnit) before showing anything derived from it.
 */
export const getAllUnits = cache(async function getAllUnits(): Promise<OrgUnit[]> {
  const { data, error } = await createAdminClient().from("org_unit").select(UNIT_SELECT).order("path");
  if (error) throw error;
  return ((data ?? []) as unknown as OrgUnitRow[]).map(mapUnit);
});

export interface UnitRole {
  unit: OrgUnit;
  role: OrgRole;
}

/**
 * The boxes this person has a role on, highest first. Admin acts as the
 * HQ leader and leadership as an HQ viewer (they already see every cohort),
 * on top of any explicit appointments.
 */
export const getMyUnitRoles = cache(async function getMyUnitRoles(user: AppUser): Promise<UnitRole[]> {
  const units = await getAllUnits();
  const byId = new Map(units.map((u) => [u.id, u]));
  const roles = new Map<string, OrgRole>();
  const hq = units.find((u) => u.type === "hq" && !u.parentId);
  // Admin holds system authority and acts as the top level's leader. The
  // leadership role grants nothing by itself — only assignments do.
  if (hq && user.role === "admin") roles.set(hq.id, "leader");

  const { data, error } = await createAdminClient()
    .from("org_unit_member")
    .select("org_unit_id, role")
    .eq("user_id", user.id);
  if (error) throw error;
  for (const row of data ?? []) {
    if (roles.get(row.org_unit_id) === "leader") continue;
    roles.set(row.org_unit_id, row.role as OrgRole);
  }
  return [...roles.entries()]
    .map(([id, role]) => ({ unit: byId.get(id)!, role }))
    .filter((r) => r.unit)
    .sort((a, b) => a.unit.path.split(".").length - b.unit.path.split(".").length || a.unit.name.localeCompare(b.unit.name));
});

export interface UnitAccess {
  user: AppUser;
  unit: OrgUnit;
  /** leader = may manage this box; viewer = progress only. */
  role: OrgRole;
  /** The person's own boxes (for the switcher and "back to" links). */
  myUnits: UnitRole[];
}

/**
 * For a level page: the box behind `slug`, if this person may see it.
 * Access is decided by the database (can_view_unit / can_lead_unit, run as
 * the signed-in user), not by anything in the URL — a box outside their
 * area is a 404, exactly like a cohort they're not a member of.
 */
export const requireUnit = cache(async function requireUnit(slug: string): Promise<UnitAccess> {
  const user = await requireUser();
  const units = await getAllUnits();
  const unit = units.find((u) => u.slug === slug);
  if (!unit) notFound();

  const supabase = await createClient();
  const [{ data: canView, error: viewErr }, { data: canLead, error: leadErr }] = await Promise.all([
    supabase.rpc("can_view_unit", { p_unit: unit.id }),
    supabase.rpc("can_lead_unit", { p_unit: unit.id }),
  ]);
  if (viewErr) throw viewErr;
  if (leadErr) throw leadErr;
  if (!canView) notFound();

  // Responsibility-bounded: your own levels, or a level below with nobody
  // responsible in between. A child with its own leader is theirs — you
  // see it as a summary on your dashboard, not by opening it.
  const [myUnits, leaders] = await Promise.all([getMyUnitRoles(user), getUnitLeaderContacts()]);
  const own = new Set(myUnits.map((r) => r.unit.id));
  const byId = new Map(units.map((u) => [u.id, u]));
  if (!isResponsibleFor(unit.id, own, byId, (id) => (leaders.get(id)?.length ?? 0) > 0)) notFound();
  // An unstaffed level is held with the role you have on the level above
  // that manages it (leader manages it; viewer only sees it).
  const holding = [...myUnits].reverse().find((r) => r.unit.id === unit.id || unit.path.startsWith(`${r.unit.path}.`));
  return { user, unit, role: canLead ? "leader" : (holding?.role ?? "viewer"), myUnits };
});

export interface LeaderContact {
  userId: string;
  name: string;
  email: string;
}

/** The leaders of every level, with how to reach them. Service role — the
 * caller shows these only for levels the viewer monitors or manages. */
export const getUnitLeaderContacts = cache(async function getUnitLeaderContacts(): Promise<Map<string, LeaderContact[]>> {
  const { data, error } = await createAdminClient()
    .from("org_unit_member")
    .select("org_unit_id, user_id, app_user:user_id(name, email, state)")
    .eq("role", "leader");
  if (error) throw error;
  const map = new Map<string, LeaderContact[]>();
  for (const row of data ?? []) {
    const u = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    if (!u || u.state === "deactivated") continue;
    map.set(row.org_unit_id, [...(map.get(row.org_unit_id) ?? []), { userId: row.user_id, name: u.name, email: u.email }]);
  }
  return map;
});

/** Each cohort's facilitators, with how to reach them — the people
 * responsible for a cohort. Service role; shown only to the promotion or
 * church that monitors it. */
export const getCohortStaffContacts = cache(async function getCohortStaffContacts(): Promise<Map<string, LeaderContact[]>> {
  const { data, error } = await createAdminClient()
    .from("cohort_member")
    .select("cohort_id, user_id, app_user:user_id(name, email, state)")
    .eq("capacity", "facilitator");
  if (error) throw error;
  const map = new Map<string, LeaderContact[]>();
  for (const row of data ?? []) {
    const u = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    if (!u || u.state === "deactivated") continue;
    map.set(row.cohort_id, [...(map.get(row.cohort_id) ?? []), { userId: row.user_id, name: u.name, email: u.email }]);
  }
  return map;
});

export interface CohortStaffMember {
  userId: string;
  name: string;
  email: string;
  capacity: "facilitator" | "teacher";
  state: "active" | "invited" | "deactivated";
}

/** The facilitators and teachers of these cohorts. Service role — the
 * caller shows it only to whoever manages those cohorts' staff. */
export async function getCohortStaff(cohortIds: string[]): Promise<Map<string, CohortStaffMember[]>> {
  const map = new Map<string, CohortStaffMember[]>();
  if (!cohortIds.length) return map;
  const { data, error } = await createAdminClient()
    .from("cohort_member")
    .select("cohort_id, user_id, capacity, app_user:user_id(name, email, state)")
    .in("cohort_id", cohortIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const u = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    if (!u) continue;
    map.set(row.cohort_id, [
      ...(map.get(row.cohort_id) ?? []),
      { userId: row.user_id, name: u.name, email: u.email, capacity: row.capacity as "facilitator" | "teacher", state: u.state as CohortStaffMember["state"] },
    ]);
  }
  return map;
}

/** Staff working inside each level (any depth): level roles plus cohort
 * facilitators and teachers, each person counted once per level. */
export const getStaffCounts = cache(async function getStaffCounts(): Promise<Map<string, number>> {
  const db = createAdminClient();
  const [units, { data: members, error: mErr }, { data: cohortStaff, error: cErr }, { data: cohorts, error: hErr }] = await Promise.all([
    getAllUnits(),
    db.from("org_unit_member").select("org_unit_id, user_id"),
    db.from("cohort_member").select("cohort_id, user_id"),
    db.from("cohort").select("id, org_unit_id"),
  ]);
  if (mErr) throw mErr;
  if (cErr) throw cErr;
  if (hErr) throw hErr;
  const byId = new Map(units.map((u) => [u.id, u]));
  const cohortUnit = new Map((cohorts ?? []).map((c) => [c.id, c.org_unit_id]));
  const people = new Map<string, Set<string>>();
  const credit = (unitId: string | null | undefined, userId: string) => {
    let cur = unitId ? byId.get(unitId) : undefined;
    while (cur) {
      people.set(cur.id, (people.get(cur.id) ?? new Set()).add(userId));
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  };
  for (const m of members ?? []) credit(m.org_unit_id, m.user_id);
  for (const m of cohortStaff ?? []) {
    credit(cohortUnit.get(m.cohort_id), m.user_id);
    // …and each cohort's own team, keyed by cohort id.
    people.set(m.cohort_id, (people.get(m.cohort_id) ?? new Set()).add(m.user_id));
  }
  return new Map([...people].map(([id, set]) => [id, set.size]));
});

/** Can the signed-in user see this box? (Database-checked.) */
export async function canViewUnit(unitId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_view_unit", { p_unit: unitId });
  if (error) throw error;
  return !!data;
}

/** Can the signed-in user manage this box? (Database-checked.) */
export async function canLeadUnit(unitId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_lead_unit", { p_unit: unitId });
  if (error) throw error;
  return !!data;
}

/** Can the signed-in user manage this box from above — its staff, name,
 * removal? Admin, or the leader of any box above it. (Database-checked.) */
export async function canManageUnit(unitId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_manage_unit", { p_unit: unitId });
  if (error) throw error;
  return !!data;
}

export interface StaffMember {
  userId: string;
  name: string;
  email: string;
  state: "active" | "invited" | "deactivated";
  unitId: string;
  role: OrgRole;
}

/** Everyone with a role on a box *inside* this one (any depth). Service
 * role — callers must have checked the viewer may see this box. */
export async function getBranchStaff(unit: OrgUnit): Promise<StaffMember[]> {
  const units = await getAllUnits();
  const inside = new Set(descendantsOf(unit, units).map((u) => u.id));
  if (!inside.size) return [];
  const { data, error } = await createAdminClient()
    .from("org_unit_member")
    .select("org_unit_id, user_id, role, app_user:user_id(name, email, state)")
    .in("org_unit_id", [...inside]);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const u = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    return {
      userId: row.user_id,
      name: u?.name ?? "Unknown",
      email: u?.email ?? "",
      state: (u?.state ?? "active") as StaffMember["state"],
      unitId: row.org_unit_id,
      role: row.role as OrgRole,
    };
  });
}

/** Names of the leaders (role "leader") of each box. Service role — the
 * caller has already checked the viewer may see these boxes. */
export const getUnitLeaders = cache(async function getUnitLeaders(): Promise<Map<string, string[]>> {
  const { data, error } = await createAdminClient()
    .from("org_unit_member")
    .select("org_unit_id, role, app_user:user_id(name)")
    .eq("role", "leader");
  if (error) throw error;
  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const u = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    if (!u) continue;
    map.set(row.org_unit_id, [...(map.get(row.org_unit_id) ?? []), u.name]);
  }
  return map;
});

/** Active people who can be given a role on a box. Service role — only
 * for pages whose viewer leads the box (checked by the caller). */
export const getAppointablePeople = cache(async function getAppointablePeople(): Promise<{ id: string; name: string; email: string }[]> {
  const { data, error } = await createAdminClient().from("app_user").select("id, name, email, state").neq("state", "deactivated").order("name");
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, email: p.email }));
});

/** Everyone with a role on each box: unitId → [{ userId, name, role }]. */
export const getUnitMembers = cache(async function getUnitMembers(): Promise<Map<string, { userId: string; name: string; role: OrgRole }[]>> {
  const { data, error } = await createAdminClient()
    .from("org_unit_member")
    .select("org_unit_id, user_id, role, app_user:user_id(name)")
    .order("created_at");
  if (error) throw error;
  const map = new Map<string, { userId: string; name: string; role: OrgRole }[]>();
  for (const row of data ?? []) {
    const u = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    map.set(row.org_unit_id, [...(map.get(row.org_unit_id) ?? []), { userId: row.user_id, name: u?.name ?? "Unknown", role: row.role as OrgRole }]);
  }
  return map;
});

/** Every programme policy version (0039), oldest first. One policy for
 * the whole network; each calculation picks the version in force on its
 * date (policyOn). */
export const getPolicyVersions = cache(async function getPolicyVersions(): Promise<PolicyVersion[]> {
  const { data, error } = await createAdminClient()
    .from("programme_policy")
    .select("version, effective_from, on_track_threshold, needs_help_threshold, inactive_streak, graduation_attendance_threshold, note, created_at, app_user:created_by(name)")
    .order("effective_from");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const u = Array.isArray(r.app_user) ? r.app_user[0] : r.app_user;
    return {
      version: r.version,
      effectiveFrom: r.effective_from,
      onTrack: r.on_track_threshold,
      needsHelp: r.needs_help_threshold,
      inactiveStreak: r.inactive_streak,
      graduationAttendance: r.graduation_attendance_threshold,
      note: r.note,
      createdAt: r.created_at,
      createdBy: u?.name ?? null,
    };
  });
});

/** The policy in force on a date (default today), with its status bands. */
export async function getPolicy(dateISO: string = todayISO()) {
  const versions = await getPolicyVersions();
  const policy = policyOn(versions, dateISO);
  return { versions, policy, bands: bandsOf(policy), inactiveStreak: policy.inactiveStreak, graduationAttendance: policy.graduationAttendance };
}

/** A cohort page's cohort and the status bands that apply to it: today's
 * policy while it runs; the policy in force when it finished, once it has
 * — a later policy change never re-labels a finished cohort. */
export async function getCohortWithBands(db: DB, slugOrId: string): Promise<[Cohort | null, Bands]> {
  const cohort = await getCohort(db, slugOrId);
  if (!cohort) return [null, (await getPolicy()).bands];
  const today = todayISO();
  const finishedOn = cohortFinishedOn(cohort, await getLessonEvents(db, cohort.id), today);
  return [cohort, (await getPolicy(finishedOn ?? today)).bands];
}

/**
 * Who has graduated in a finished cohort (graduationCheck), by the policy
 * in force when it finished. Null while it runs. Open interventions come
 * from outcomes read with the service role — the caller must already have
 * checked the viewer may see this cohort's students; only the result
 * (graduated or not, and why) is returned, never the follow-up detail.
 */
export async function getGraduation(
  cohort: Cohort,
  roster: StudentAggregate[],
  lessonEvents: LessonEventView[]
): Promise<Map<string, GraduationCheck> | null> {
  const today = todayISO();
  const finishedOn = cohortFinishedOn(cohort, lessonEvents, today);
  if (!finishedOn) return null;
  const [{ graduationAttendance }, outcomes] = await Promise.all([getPolicy(finishedOn), getOutcomesForCohort(createAdminClient(), cohort.id)]);
  const latest = latestByStudent(outcomes);
  const allDelivered = lessonEvents.length > 0 && lessonEvents.every(isRecorded);
  const out = new Map<string, GraduationCheck>();
  for (const s of roster) {
    if (s.leftAt) continue;
    const intervention = studentIntervention(s, latest.get(s.id)?.kind ?? null, today);
    out.set(s.id, graduationCheck(s, allDelivered, intervention, graduationAttendance));
  }
  return out;
}

/** One cohort's fact sheet, read with the service role. Only call after
 * the viewer's access to the cohort's box has been checked. */
const getCohortFacts = cache(async function getCohortFacts(cohort: Cohort, today: string): Promise<CohortFacts> {
  const db = createAdminClient();
  const [policies, students, lessonEvents, outcomes, segments] = await Promise.all([
    getPolicyVersions(),
    getStudents(db, cohort.id),
    getLessonEvents(db, cohort.id),
    getOutcomesForCohort(db, cohort.id),
    getScheduleSegments(db, cohort.id),
  ]);
  const latest = new Map([...latestByStudent(outcomes)].map(([id, o]) => [id, o.kind]));
  return cohortFacts({
    cohort,
    students,
    lessonEvents,
    segments,
    latestOutcomeKind: latest,
    facilitatorNames: facilitatorList(cohort),
    policies,
    today,
  });
});

/** Something directly inside a box: another box, or (inside a promotion or
 * church) a cohort. */
export type ChildRef =
  | { kind: "unit"; unit: OrgUnit }
  | { kind: "cohort"; cohort: Cohort };

export interface UnitReport {
  unit: OrgUnit;
  /** Boxes above this one, top first (not including it). */
  ancestors: OrgUnit[];
  children: ChildRef[];
  /** Every cohort anywhere inside this box. */
  facts: CohortFacts[];
  /** Fact sheets grouped by the direct child they sit under. */
  factsByChild: Map<string, CohortFacts[]>;
  /** For each cohort: the names from this box's direct child down to the
   * cohort itself (e.g. at Rwanda: Kigali City › … › Cohort 02). */
  pathBelow: Map<string, string[]>;
  /** For each cohort: the boxes from this box's direct child down to the
   * cohort's own box (empty for a cohort directly in this box). */
  chainBelow: Map<string, OrgUnit[]>;
  today: string;
}

export function childId(c: ChildRef): string {
  return c.kind === "unit" ? c.unit.id : c.cohort.id;
}

export function childName(c: ChildRef): string {
  return c.kind === "unit" ? c.unit.name : c.cohort.name.trim();
}

/**
 * Everything a level page needs about a box. Reads cohorts with the
 * service role, so it must only be called for a box `requireUnit` (or
 * canViewUnit) already allowed.
 */
export const getUnitReport = cache(async function getUnitReport(unitId: string): Promise<UnitReport> {
  const today = todayISO();
  const units = await getAllUnits();
  const unit = units.find((u) => u.id === unitId);
  if (!unit) notFound();
  const inside = descendantsOf(unit, units);
  const byId = new Map(units.map((u) => [u.id, u]));
  const cohorts = await listCohortsInUnits(createAdminClient(), [unit.id, ...inside.map((u) => u.id)]);
  const facts = await Promise.all(cohorts.map((c) => getCohortFacts(c, today)));

  const depth = unit.path.split(".").length;
  const childUnits = units.filter((u) => u.parentId === unit.id).sort((a, b) => a.name.localeCompare(b.name));
  const directCohorts = cohorts.filter((c) => c.orgUnitId === unit.id);
  const children: ChildRef[] = [
    ...childUnits.map((u) => ({ kind: "unit" as const, unit: u })),
    ...directCohorts.map((c) => ({ kind: "cohort" as const, cohort: c })),
  ];

  const factsByChild = new Map<string, CohortFacts[]>(children.map((c) => [childId(c), []]));
  const pathBelow = new Map<string, string[]>();
  const chainBelow = new Map<string, OrgUnit[]>();
  cohorts.forEach((c, i) => {
    const home = c.orgUnitId ? byId.get(c.orgUnitId) : undefined;
    if (!home) return;
    const chain = ancestryOf(home, units);
    const key = home.id === unit.id ? c.id : chain[depth]?.id;
    if (key) factsByChild.get(key)?.push(facts[i]);
    pathBelow.set(c.id, [...chain.slice(depth).map((u) => u.name), c.name.trim()]);
    chainBelow.set(c.id, chain.slice(depth));
  });

  return { unit, ancestors: ancestryOf(unit, units).slice(0, -1), children, facts, factsByChild, pathBelow, chainBelow, today };
});
