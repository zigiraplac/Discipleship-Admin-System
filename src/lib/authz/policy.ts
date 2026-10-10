import type { OrgUnitType } from "@/lib/domain/types";

/**
 * The single answer to "can this person do this, here?" — pure, so it runs
 * the same on the server, in tests, and (for showing/hiding buttons) in the
 * browser. The server wrapper (./index.ts) loads the facts and enforces it;
 * the database enforces the same tiers underneath (0036).
 *
 *   person's responsibilities + capability + target  →  decision (+ why)
 *
 * Responsibilities come from three places and are all kept — one person can
 * lead a promotion *and* teach two of its cohorts:
 *   - system role (app_user.role): admin = system authority (everything,
 *     incl. support access to any cohort — recorded). Programme leadership
 *     is NOT a system power: a "leadership" account sees only what its
 *     organisational assignment gives it, like any other leader
 *   - level roles (org_unit_member): leader / viewer of a level and
 *     everything inside it
 *   - cohort roles (cohort_member): facilitator / teacher of one cohort
 * A plain facilitator/teacher app role grants nothing by itself.
 */

export type Sensitivity = "aggregate" | "operational" | "pastoral";

export const CAPABILITIES = {
  // levels
  view_org: "aggregate",
  /** A cohort's totals (no names) — what levels above it see. */
  view_cohort_summary: "aggregate",
  manage_org_structure: "aggregate",
  remove_unit: "aggregate",
  manage_staff: "aggregate",
  manage_settings: "aggregate",
  create_cohort: "aggregate",
  manage_schedule: "operational",
  // cohorts and students
  view_cohort: "operational",
  view_student: "operational",
  view_attendance: "operational",
  edit_attendance: "operational",
  postpone_lesson: "operational",
  record_crusade: "operational",
  /** Assign / remove / invite a cohort's facilitators and teachers. */
  manage_cohort_staff: "operational",
  view_followups: "pastoral",
  manage_followups: "pastoral",
  edit_student: "pastoral",
  // system
  manage_accounts: "aggregate",
  /** Create a new programme policy version (bands, inactive rule,
   * graduation threshold) — network-wide, so administrators only. */
  manage_policy: "aggregate",
} as const satisfies Record<string, Sensitivity>;

export type Capability = keyof typeof CAPABILITIES;

export type Responsibility =
  | { kind: "system"; role: "admin" | "leadership" }
  | { kind: "unit"; unitId: string; unitName: string; unitType: OrgUnitType; unitPath: string; role: "leader" | "viewer" }
  | { kind: "cohort"; cohortId: string; cohortName: string; capacity: "facilitator" | "teacher" };

/** What a capability is checked against. `unitPath` is the level's ltree
 * path (the cohort's own level for a cohort); null for a cohort not placed
 * in the hierarchy. */
export type Target =
  | { kind: "system" }
  | {
      kind: "unit";
      unitId: string;
      unitPath: string;
      unitType: OrgUnitType;
      /** The level that staffs this one (stewardOf): the level above, or
       * the nearest staffed level further up. Needed for manage_staff /
       * remove_unit; filled in by authorize(). */
      stewardId?: string | null;
    }
  | {
      kind: "cohort";
      cohortId: string;
      unitPath: string | null;
      /** The cohort's own level. */
      unitId?: string | null;
      /** The level that assigns its staff (cohortStewardOf); filled in by authorize(). */
      stewardId?: string | null;
    };

export interface Decision {
  allowed: boolean;
  /** The responsibility that granted it (absent when denied). */
  via?: Responsibility;
  /** Plain-language why/why not — shown in errors and useful in audits. */
  reason: string;
}

/** What any level role sees of a cohort below it: totals only. Student-
 * level detail belongs to the cohort's own team (product decision: levels
 * consume summarised intelligence; problems surface upward as exceptions). */
const LEVEL_COHORT: Capability[] = ["view_cohort_summary"];
const ADMIN_ALL = Object.keys(CAPABILITIES) as Capability[];
const FACILITATOR: Capability[] = [
  "view_cohort_summary", "view_cohort", "view_student", "view_attendance", "edit_attendance", "postpone_lesson", "record_crusade",
  "view_followups", "manage_followups",
];
const TEACHER: Capability[] = ["view_cohort_summary", "view_cohort", "view_student", "view_attendance", "edit_attendance"];

/** Levels that run cohorts day to day: they create cohorts and manage
 * their schedules (for the cohorts inside them). */
const RUNS_COHORTS: OrgUnitType[] = ["site", "promotion"];

const inside = (path: string, ancestor: string) => path === ancestor || path.startsWith(`${ancestor}.`);

function describe(r: Responsibility): string {
  if (r.kind === "system") return r.role === "admin" ? "administrator" : "global viewer";
  if (r.kind === "unit") return `${r.role} of ${r.unitName}`;
  return `${r.capacity} of ${r.cohortName}`;
}

/** What one responsibility grants on one target. */
function grants(r: Responsibility, target: Target): Capability[] {
  // Only admin carries system authority; a leadership account's reach comes
  // from its organisational assignments (unit responsibilities) alone.
  if (r.kind === "system") return r.role === "admin" ? ADMIN_ALL : [];

  if (r.kind === "cohort") {
    if (target.kind !== "cohort" || target.cohortId !== r.cohortId) return [];
    return r.capacity === "facilitator" ? FACILITATOR : TEACHER;
  }

  // Level role: only on its own level and what's inside it.
  const path = target.kind === "unit" ? target.unitPath : target.kind === "cohort" ? target.unitPath : null;
  if (!path || !inside(path, r.unitPath)) return [];
  if (r.role === "viewer") return target.kind === "unit" ? ["view_org"] : LEVEL_COHORT;

  // Leader. Cohorts inside: totals only — plus, for the church or promotion
  // that runs them, their teaching schedule.
  if (target.kind === "cohort") {
    const caps: Capability[] = RUNS_COHORTS.includes(r.unitType) ? [...LEVEL_COHORT, "manage_schedule", "postpone_lesson"] : [...LEVEL_COHORT];
    // Cohort staff: the leader responsible for the cohort's own level
    // (promotion → church → nearest staffed level), never anyone above them.
    if (target.stewardId === r.unitId) caps.push("manage_cohort_staff");
    return caps;
  }
  if (target.kind !== "unit") return [];
  // On their own level and below: settings, adding/renaming boxes, and (for
  // a church or promotion) cohorts and their schedules.
  const caps: Capability[] = ["view_org", "manage_settings", "manage_org_structure"];
  if (RUNS_COHORTS.includes(r.unitType) && RUNS_COHORTS.includes(target.unitType)) caps.push("create_cohort", "manage_schedule");
  // Staffing authority comes from the level above: a leader staffs (and
  // may remove) the levels it oversees — never its own.
  if (target.stewardId === r.unitId) caps.push("manage_staff", "remove_unit");
  return caps;
}

export function decide(responsibilities: Responsibility[], capability: Capability, target: Target): Decision {
  for (const r of responsibilities) {
    if (grants(r, target).includes(capability)) {
      return { allowed: true, via: r, reason: `Allowed as ${describe(r)}.` };
    }
  }
  return { allowed: false, reason: denialReason(capability) };
}

/** Every capability this person has on a target — for showing/hiding UI. */
export function capabilitiesOn(responsibilities: Responsibility[], target: Target): Set<Capability> {
  return new Set(responsibilities.flatMap((r) => grants(r, target)));
}

function denialReason(c: Capability): string {
  switch (CAPABILITIES[c]) {
    case "pastoral":
      return "Only this cohort's facilitators can see or change follow-up and pastoral details.";
    case "operational":
      return c === "edit_attendance"
        ? "Only this cohort's facilitators and teachers can take its registers."
        : "You don't have access to this cohort.";
    default:
      return "You don't have permission to do that here.";
  }
}

/** Short label for a responsibility, e.g. "Rwanda · Country leader". */
export function responsibilityLabel(r: Responsibility, levelLabel?: string): { title: string; role: string } {
  if (r.kind === "system") return { title: "Global HQ", role: r.role === "admin" ? "Administrator" : "Viewer" };
  if (r.kind === "unit") return { title: r.unitName, role: `${levelLabel ?? ""} ${r.role === "leader" ? "leader" : "viewer"}`.trim() };
  return { title: r.cohortName, role: r.capacity === "facilitator" ? "Facilitator" : "Teacher" };
}
