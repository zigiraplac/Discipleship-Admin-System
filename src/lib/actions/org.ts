"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { childId, childName, getAllUnits, getMyUnitRoles, getPolicy, getStaffCounts, getUnitLeaderContacts, getUnitReport } from "@/lib/data/org";
import { childrenLabelFor } from "@/components/shell/org-nav";
import { isResponsibleFor } from "@/lib/domain/responsibility";
import { managementReason, managementStatus, statusLabel, type UnitStatus } from "@/lib/domain/status";
import { authorize, cohortTarget, getResponsibilities, unitTarget, type Capability } from "@/lib/authz";
import { inviteAccount } from "@/lib/data/invite";
import { announceLevelRole } from "@/lib/notify/staffing";
import { canSitInside, nextLevel, slugify } from "@/lib/domain/levels";
import { changedDetails, cleanUnitDetails, mergeUnitDetails } from "@/lib/domain/unit-details";
import type { OrgRole, OrgUnitDetails, OrgUnitType } from "@/lib/domain/types";
import {
  monthLabels,
  periodLabel,
  parsePeriod,
} from "@/lib/data/org-view";
import { ancestryOf, LEVELS } from "@/lib/domain/levels";
import { issuesFor, monthSeries, periodMovement, sumFacts, type ScheduleState, type Severity, type Totals } from "@/lib/domain/rollup";

export type OverviewRef = { kind: "unit" | "cohort"; id: string };

export type OverviewData =
  | {
      kind: "unit";
      name: string;
      /** Its page — only when the viewer is responsible for it (it has no
       * leader of its own); otherwise its leader answers for it. */
      href: string | null;
      levelLabel: string;
      leaders: { name: string; email: string }[];
      /** With no leader of its own, who manages it: the nearest level above. */
      managedBy: string | null;
      context: string;
      periodText: string;
      /** The management status — the same one as its card and its parent's alerts. */
      status: { status: UnitStatus; text: string; reasons: string[] };
      staff: number;
      totals: Totals;
      movement: { joined: number; left: number; completed: number; graduated: number };
      /** What it calls the things directly inside it ("Countries"). */
      childrenLabel: string;
      /** Those things, as a parent sees them: status in words and scale only. */
      children: { id: string; name: string; status: UnitStatus; statusText: string; students: number; active: number }[];
      series: { label: string; title: string; value: number }[];
    }
  | {
      kind: "cohort";
      name: string;
      href: string | null;
      facilitators: string[];
      context: string;
      phase: "upcoming" | "running" | "finished";
      startsOn: string | null;
      finishedOn: string | null;
      registered: number;
      active: number;
      completed: number;
      onTrack: number;
      needsHelp: number;
      atRisk: number;
      inactive: number;
      attendanceRate: number | null;
      lessonsTaught: number;
      lessonsTotal: number;
      progressPct: number;
      plannedEnd: string | null;
      currentEnd: string | null;
      schedule: ScheduleState;
      daysBehind: number;
      lessonsBehind: number;
      issues: { severity: Severity; text: string }[];
    };

/**
 * The side panel's overview of one child (a box, or a cohort) — totals
 * only. Access is checked here against the database (can_view_unit), not
 * trusted from the caller, so changing an id in the request can't reveal
 * a box outside the viewer's area.
 */
export async function loadOverview(ref: OverviewRef, period: string): Promise<OverviewData> {
  const user = await requireUser();
  const days = parsePeriod(period);
  const units = await getAllUnits();

  if (ref.kind === "unit") {
    const unit = units.find((u) => u.id === ref.id);
    // Responsibility-bounded: a level you're responsible for, or one of its
    // direct children (a summary — not what's inside it).
    const [leaders, myUnits] = await Promise.all([getUnitLeaderContacts(), getMyUnitRoles(user)]);
    const own = new Set(myUnits.map((r) => r.unit.id));
    const byId = new Map(units.map((u) => [u.id, u]));
    const hasLeader = (id: string) => (leaders.get(id)?.length ?? 0) > 0;
    const responsible = (id: string) => isResponsibleFor(id, own, byId, hasLeader);
    if (!unit || !(responsible(unit.id) || (unit.parentId && responsible(unit.parentId)))) throw new Error("You don't have access to this.");
    const [report, { bands }, staffCounts] = await Promise.all([getUnitReport(unit.id), getPolicy(), getStaffCounts()]);
    const totals = sumFacts(report.facts, report.today);
    const ms = managementStatus(report.facts, report.today, bands);
    return {
      kind: "unit",
      name: unit.name,
      href: responsible(unit.id) ? `/u/${unit.slug}` : null,
      levelLabel: LEVELS[unit.type].label,
      leaders: (leaders.get(unit.id) ?? []).map((l) => ({ name: l.name, email: l.email })),
      managedBy: hasLeader(unit.id) ? null : ([...report.ancestors].reverse().find((a) => a.type === "hq" || hasLeader(a.id))?.name ?? null),
      context: report.ancestors.filter((a) => a.type !== "hq").map((a) => a.name).join(" › "),
      periodText: periodLabel(days),
      status: {
        status: ms.status,
        text: statusLabel(ms.status, totals.active),
        reasons: [...new Set(ms.signals.map((s) => managementReason(s)).filter((r): r is string => !!r))],
      },
      staff: staffCounts.get(unit.id) ?? 0,
      totals,
      movement: periodMovement(report.facts, report.today, days),
      series: monthSeries(report.facts, report.today, 12).map((p) => ({ ...monthLabels(p.month), value: p.active })),
      childrenLabel: childrenLabelFor(unit.type),
      children: report.children
        .map((c) => {
          const facts = report.factsByChild.get(childId(c)) ?? [];
          const ct = sumFacts(facts, report.today);
          const cs = managementStatus(facts, report.today, bands).status;
          return { id: childId(c), name: childName(c), status: cs, statusText: statusLabel(cs, ct.active), students: ct.registered, active: ct.active };
        })
        .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name)),
    };
  }

  const { data: cohort, error } = await createAdminClient().from("cohort").select("id, org_unit_id").eq("id", ref.id).maybeSingle();
  if (error) throw error;
  const allowed =
    cohort && (await authorize("view_cohort_summary", await cohortTarget(cohort.id), user)).allowed;
  if (!cohort || !allowed || !cohort.org_unit_id) throw new Error("You don't have access to this.");
  const report = await getUnitReport(cohort.org_unit_id);
  const f = report.facts.find((x) => x.cohortId === cohort.id);
  if (!f) throw new Error("This cohort could not be found.");
  const home = units.find((u) => u.id === cohort.org_unit_id)!;
  return {
    kind: "cohort",
    name: f.name,
    // Only the cohort's own team opens it from here; levels see this summary.
    href: (await getResponsibilities(user)).some((r) => r.kind === "cohort" && r.cohortId === cohort.id) ? `/c/${f.slug}` : null,
    facilitators: f.facilitatorNames,
    context: ancestryOf(home, units).filter((a) => a.type !== "hq").map((a) => a.name).join(" › "),
    phase: f.phase,
    startsOn: f.startsOn,
    finishedOn: f.finishedOn,
    registered: f.registered,
    active: f.active,
    completed: f.completed,
    onTrack: f.onTrack,
    needsHelp: f.needsHelp,
    atRisk: f.atRisk,
    inactive: f.inactive,
    attendanceRate: f.attendanceRate,
    lessonsTaught: f.lessonsTaught,
    lessonsTotal: f.lessonsTotal,
    progressPct: f.progressPct,
    plannedEnd: f.plannedEnd,
    currentEnd: f.currentEnd,
    schedule: f.schedule,
    daysBehind: f.daysBehind,
    lessonsBehind: f.lessonsBehind,
    issues: issuesFor(f, report.today).map((i) => ({ severity: i.severity, text: i.text })),
  };
}

// ───────────── managing the levels ─────────────
//
// Writes go through the service role (same pattern as every other admin
// write in this app) after the database confirms, as the signed-in user,
// that they lead the box being changed: a box's leader adds boxes inside
// it and appoints their leaders; admin can do anything.

async function uniqueSlug(name: string, parentName: string): Promise<string> {
  const db = createAdminClient();
  const candidates = [slugify(name), `${slugify(parentName)}-${slugify(name)}`];
  for (let i = 2; i < 50; i++) candidates.push(`${slugify(parentName)}-${slugify(name)}-${i}`);
  const { data, error } = await db.from("org_unit").select("slug").in("slug", candidates);
  if (error) throw error;
  const taken = new Set((data ?? []).map((r) => r.slug));
  return candidates.find((c) => !taken.has(c))!;
}

/** The central check (authz/policy) for a capability on one level. */
async function can(capability: Capability, unitId: string): Promise<boolean> {
  const unit = (await getAllUnits()).find((u) => u.id === unitId);
  return !!unit && (await authorize(capability, unitTarget(unit))).allowed;
}

async function audit(actorId: string, entityId: string, action: string, after: Record<string, string | null>) {
  await createAdminClient().from("audit_log").insert({ actor_id: actorId, entity: "org_unit", entity_id: entityId, action, after });
}

export interface CreateUnitInput {
  parentId: string;
  type: OrgUnitType;
  name: string;
  details: OrgUnitDetails;
  leaderId: string | null;
}

/** Add a box inside one you lead. */
export async function createUnit(input: CreateUnitInput): Promise<{ slug: string }> {
  const user = await requireUser();
  const units = await getAllUnits();
  const parent = units.find((u) => u.id === input.parentId);
  if (!parent || !(await can("manage_org_structure", parent.id))) throw new Error("Only this box's leader can add boxes inside it.");
  if (!canSitInside(input.type, parent.type)) {
    const expected = nextLevel(parent.type);
    throw new Error(`Only a ${expected === "cohort" ? "cohort" : LEVELS[expected].label.toLowerCase()} can be added inside ${parent.name}.`);
  }
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Give it a name.");
  if (name.length > 80) throw new Error("Keep the name under 80 characters.");
  if (units.some((u) => u.parentId === parent.id && u.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`${parent.name} already has one called ${name}.`);
  }
  const details = cleanUnitDetails(input.type, input.details);

  const db = createAdminClient();
  const slug = await uniqueSlug(name, parent.name);
  const { data, error } = await db
    .from("org_unit")
    .insert({ parent_id: parent.id, type: input.type, name, slug, details: JSON.parse(JSON.stringify(details)), created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (input.leaderId) {
    const { error: memberErr } = await db.from("org_unit_member").insert({ org_unit_id: data.id, user_id: input.leaderId, role: "leader" });
    if (memberErr) throw new Error(memberErr.message);
  }
  await audit(user.id, data.id, "create", { name, type: input.type, parent: parent.name, leaderId: input.leaderId });
  if (input.leaderId) await announceLevelRole({ actorId: user.id, unitId: data.id, personId: input.leaderId, role: "leader", change: "appointed" });
  revalidatePath("/u", "layout");
  return { slug };
}

/** Rename a box: its own leader, its parent's leader, or admin. */
export async function renameUnit(input: { unitId: string; name: string }): Promise<void> {
  const user = await requireUser();
  const units = await getAllUnits();
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) throw new Error("This box no longer exists.");
  const allowed = await can("manage_org_structure", unit.id);
  if (!allowed) throw new Error("Only this box's leader, or a leader above it, can rename it.");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new Error("Give it a name under 80 characters.");
  if (units.some((u) => u.id !== unit.id && u.parentId === unit.parentId && u.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("Another box here already has that name.");
  }
  const { error } = await createAdminClient().from("org_unit").update({ name }).eq("id", unit.id);
  if (error) throw new Error(error.message);
  await audit(user.id, unit.id, "rename", { from: unit.name, to: name });
  revalidatePath("/u", "layout");
}

/** Edit a level's own details — general contact, description and its
 * level-specific fields. Same people as renaming. Changes only `details`:
 * never the name, parent, type or anyone's role. A field left out keeps
 * its value; an empty one is cleared. */
export async function updateUnitDetails(input: { unitId: string; details: Partial<Record<keyof OrgUnitDetails, unknown>> }): Promise<void> {
  const user = await requireUser();
  const unit = (await getAllUnits()).find((u) => u.id === input.unitId);
  if (!unit) throw new Error("This box no longer exists.");
  if (!(await can("manage_org_structure", unit.id))) throw new Error("Only this box's leader, or a leader above it, can edit its details.");
  const before = unit.details ?? {};
  const after = mergeUnitDetails(unit.type, before, input.details ?? {});
  const changed = changedDetails(before, after);
  if (!Object.keys(changed).length) return;
  const { error } = await createAdminClient()
    .from("org_unit")
    .update({ details: JSON.parse(JSON.stringify(after)) })
    .eq("id", unit.id);
  if (error) throw new Error(error.message);
  await audit(user.id, unit.id, "edit_details", changed);
  revalidatePath("/u", "layout");
}

/** Give someone a role on a box directly inside one you lead (or, for
 * admin, on any box). */
export async function setUnitMember(input: { unitId: string; userId: string; role: OrgRole }): Promise<void> {
  const user = await requireUser();
  const units = await getAllUnits();
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) throw new Error("This box no longer exists.");
  if (!(await can("manage_staff", unit.id))) throw new Error("Only a leader above this box can appoint people here.");
  if (input.role !== "leader" && input.role !== "viewer") throw new Error("Choose leader or viewer.");
  const db = createAdminClient();
  const { data: person } = await db.from("app_user").select("id, state").eq("id", input.userId).maybeSingle();
  if (!person || person.state === "deactivated") throw new Error("That person isn't an active user.");
  // Already holds exactly this role (e.g. a retried request): nothing to change or announce.
  const { data: held } = await db.from("org_unit_member").select("role").eq("org_unit_id", unit.id).eq("user_id", input.userId).maybeSingle();
  if (held?.role === input.role) return;
  const { error } = await db
    .from("org_unit_member")
    .upsert({ org_unit_id: unit.id, user_id: input.userId, role: input.role }, { onConflict: "org_unit_id,user_id" });
  if (error) throw new Error(error.message);
  await audit(user.id, unit.id, "appoint", { userId: input.userId, role: input.role });
  await announceLevelRole({ actorId: user.id, unitId: unit.id, personId: input.userId, role: input.role, change: "appointed" });
  revalidatePath("/u", "layout");
}

export async function removeUnitMember(input: { unitId: string; userId: string }): Promise<void> {
  const user = await requireUser();
  const units = await getAllUnits();
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) throw new Error("This box no longer exists.");
  if (!(await can("manage_staff", unit.id))) throw new Error("Only a leader above this box can change who's here.");
  const db = createAdminClient();
  const { data: held } = await db.from("org_unit_member").select("role").eq("org_unit_id", unit.id).eq("user_id", input.userId).maybeSingle();
  const { error } = await db.from("org_unit_member").delete().eq("org_unit_id", unit.id).eq("user_id", input.userId);
  if (error) throw new Error(error.message);
  await audit(user.id, unit.id, "remove_member", { userId: input.userId });
  if (held) await announceLevelRole({ actorId: user.id, unitId: unit.id, personId: input.userId, role: held.role as OrgRole, change: "ended" });
  revalidatePath("/u", "layout");
}

/** Remove a box. Only an empty one (no boxes or cohorts inside it), by a
 * leader above it — so nothing with history can disappear by accident. */
export async function deleteUnit(input: { unitId: string; confirmName: string }): Promise<void> {
  const user = await requireUser();
  const units = await getAllUnits();
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) throw new Error("This box no longer exists.");
  if (unit.type === "hq") throw new Error("HQ can't be removed.");
  if (!(await can("remove_unit", unit.id))) throw new Error("Only a leader above this box can remove it.");
  if (input.confirmName.trim().toLowerCase() !== unit.name.toLowerCase()) throw new Error(`Type "${unit.name}" to confirm.`);
  if (units.some((u) => u.parentId === unit.id)) throw new Error(`${unit.name} still has boxes inside it. Move or remove them first.`);
  const db = createAdminClient();
  const { count, error: cErr } = await db.from("cohort").select("id", { count: "exact", head: true }).eq("org_unit_id", unit.id);
  if (cErr) throw new Error(cErr.message);
  if (count) throw new Error(`${unit.name} still has ${count} cohort${count === 1 ? "" : "s"}. Move or remove them first.`);
  const { error } = await db.from("org_unit").delete().eq("id", unit.id);
  if (error) throw new Error(error.message);
  await audit(user.id, unit.id, "delete", { name: unit.name, type: unit.type });
  revalidatePath("/u", "layout");
}

/** Move someone's role from one box to another (both inside a box the
 * caller leads), optionally changing leader/viewer. */
export async function reassignStaff(input: { userId: string; fromUnitId: string; toUnitId: string; role: OrgRole }): Promise<void> {
  const user = await requireUser();
  if (input.role !== "leader" && input.role !== "viewer") throw new Error("Choose leader or viewer.");
  if (!(await can("manage_staff", input.fromUnitId)) || !(await can("manage_staff", input.toUnitId))) {
    throw new Error("You can only move people between boxes inside your own level.");
  }
  const db = createAdminClient();
  const { data: held } = await db.from("org_unit_member").select("role").eq("org_unit_id", input.fromUnitId).eq("user_id", input.userId).maybeSingle();
  if (input.fromUnitId !== input.toUnitId) {
    const { error: delErr } = await db.from("org_unit_member").delete().eq("org_unit_id", input.fromUnitId).eq("user_id", input.userId);
    if (delErr) throw new Error(delErr.message);
  }
  const { error } = await db
    .from("org_unit_member")
    .upsert({ org_unit_id: input.toUnitId, user_id: input.userId, role: input.role }, { onConflict: "org_unit_id,user_id" });
  if (error) throw new Error(error.message);
  await audit(user.id, input.toUnitId, "reassign", { userId: input.userId, from: input.fromUnitId, role: input.role });
  if (input.fromUnitId !== input.toUnitId && held) {
    await announceLevelRole({ actorId: user.id, unitId: input.fromUnitId, personId: input.userId, role: held.role as OrgRole, change: "ended" });
  }
  if (input.fromUnitId !== input.toUnitId || held?.role !== input.role) {
    await announceLevelRole({ actorId: user.id, unitId: input.toUnitId, personId: input.userId, role: input.role, change: "appointed" });
  }
  revalidatePath("/u", "layout");
}

/** Correct a staff member's name. Allowed when every level they hold sits
 * inside the caller's own branch (admin: anyone). Email is their sign-in
 * identity, so it's changed by re-inviting, not here. */
export async function updateStaffName(input: { userId: string; name: string }): Promise<void> {
  const user = await requireUser();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new Error("Enter a name under 80 characters.");
  const db = createAdminClient();
  const { data: person } = await db.from("app_user").select("role").eq("id", input.userId).maybeSingle();
  if (!person) throw new Error("This person no longer exists.");
  if (user.role !== "admin") {
    if (person.role === "admin" || person.role === "leadership") throw new Error("Only an administrator can edit this person.");
    const { data: roles } = await db.from("org_unit_member").select("org_unit_id").eq("user_id", input.userId);
    const { count: cohortRoles } = await db.from("cohort_member").select("user_id", { count: "exact", head: true }).eq("user_id", input.userId);
    if (!roles?.length || cohortRoles) throw new Error("Only an administrator can edit this person.");
    for (const r of roles) if (!(await can("manage_staff", r.org_unit_id))) throw new Error("This person also works outside your level.");
  }
  const { error } = await db.from("app_user").update({ name }).eq("id", input.userId);
  if (error) throw new Error(error.message);
  await audit(user.id, input.userId, "rename_staff", { name });
  revalidatePath("/u", "layout");
  revalidatePath("/settings");
}

/** Invite a new person straight into a role on a box inside the caller's
 * level. They get an account with no cohort access — just that level. */
export async function inviteStaff(input: { name: string; email: string; unitId: string; role: OrgRole }): Promise<{ resendLink?: string }> {
  const user = await requireUser();
  if (!(await can("manage_staff", input.unitId))) throw new Error("You can only invite people to boxes inside your own level.");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new Error("Enter a name.");
  if (!email.includes("@")) throw new Error("Enter a valid email.");
  const db = createAdminClient();
  const { userId, resendLink } = await inviteAccount(db, { name, email, role: "facilitator" });
  const { error } = await db.from("org_unit_member").upsert({ org_unit_id: input.unitId, user_id: userId, role: input.role }, { onConflict: "org_unit_id,user_id" });
  if (error) throw new Error(error.message);
  await audit(user.id, input.unitId, "invite_staff", { userId, name, email, role: input.role });
  await announceLevelRole({ actorId: user.id, unitId: input.unitId, personId: userId, role: input.role, change: "appointed" });
  revalidatePath("/u", "layout");
  return { resendLink };
}
