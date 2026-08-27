"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/supabase/env";
import { requireRole } from "@/lib/auth";
import { createNotification } from "@/lib/data/notifications";
import { roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/domain/types";

export interface InvitePersonInput {
  name: string;
  email: string;
  role: Role;
  /** Cohorts to attach this person to — meaningless for admin (sees
   * everything already) and leadership (sees everything, read-only). */
  cohortIds: string[];
}

export interface InvitePersonResult {
  /**
   * Only set when this email already had an auth account with no
   * `app_user` row (e.g. it was removed by hand, or a previous invite
   * partially failed) — Supabase won't auto-send a *second* email for an
   * account that already exists, so `generateLink` hands back a raw link
   * here for the admin to deliver themselves.
   */
  resendLink?: string;
}

const ALREADY_REGISTERED_CODES = new Set(["email_exists", "user_already_exists"]);

/** `listUsers` pages at 200/request — past that many total logins
 * org-wide, an older orphaned account could sit on a later page and never
 * be found, surfacing as a confusing "already registered" dead end
 * instead of the intended re-link flow below. */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ id: string } | null> {
  for (let page = 1; page <= 50; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = list.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (list.users.length < 200) return null;
  }
  return null;
}

/**
 * Admin-only. Sends a real Supabase Auth invite (magic link) rather than
 * setting a password on the person's behalf — matches the "Invited" state
 * already modelled in `app_user.state` and doesn't require the admin to
 * relay a temporary password out-of-band. Requires the project's email
 * provider to be configured in Supabase (Auth → Providers → Email); if it
 * isn't, this throws and the dialog shows that error directly.
 */
export async function invitePerson(input: InvitePersonInput): Promise<InvitePersonResult> {
  const actor = await requireRole("admin");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new Error("Enter a name.");
  if (!email.includes("@")) throw new Error("Enter a valid email.");

  const admin = createAdminClient();
  const redirectTo = `${SITE_URL()}/auth/set-password`;

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo,
  });

  let userId: string;
  let resendLink: string | undefined;

  if (inviteErr) {
    if (!ALREADY_REGISTERED_CODES.has(inviteErr.code ?? "")) throw inviteErr;

    // The email already has an auth.users account. Either it's a real,
    // still-linked person (don't touch it — surface a clear error), or
    // it's orphaned: the app_user row was removed (by hand, or by a
    // previous invite that failed partway through) while the auth
    // account itself was left behind. Re-link the orphaned case instead
    // of leaving this email permanently stuck.
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing) throw inviteErr;

    const { data: existingPerson } = await admin
      .from("app_user")
      .select("id")
      .eq("id", existing.id)
      .maybeSingle();
    if (existingPerson) {
      throw new Error("Someone is already registered with this email.");
    }

    userId = existing.id;
    // "recovery" rather than "invite" — this account may or may not have
    // ever completed setup, and a recovery link works either way, whereas
    // `generateLink({type:'invite'})` can fail for an already-confirmed
    // account. Our /auth/set-password page treats both types identically.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) throw linkErr;
    resendLink = linkData.properties.action_link;
  } else {
    userId = invited.user.id;
  }

  const { error: userErr } = await admin.from("app_user").upsert({
    id: userId,
    name,
    email,
    role: input.role,
    state: "invited",
  });
  if (userErr) throw userErr;

  const capacity = input.role === "teacher" ? "teacher" : "facilitator";
  if ((input.role === "facilitator" || input.role === "teacher") && input.cohortIds.length) {
    const { error: memberErr } = await admin.from("cohort_member").insert(
      input.cohortIds.map((cohortId) => ({ cohort_id: cohortId, user_id: userId, capacity }))
    );
    if (memberErr) throw memberErr;
  }

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "app_user",
    entity_id: userId,
    action: "invite",
    after: { name, email, role: input.role, cohortIds: input.cohortIds },
  });

  // Sitting there waiting the first time they actually sign in — inviting
  // someone doesn't give them a session yet, so there's nothing to notify
  // "now"; this just means they aren't greeted by an empty bell.
  await createNotification(admin, {
    userId,
    kind: "welcome",
    title: "Welcome to BCC Discipleship",
    body: `You've been added as ${roleLabel(input.role)}.`,
  });

  revalidatePath("/settings");
  return { resendLink };
}

export interface UpdatePersonInput {
  id: string;
  name: string;
  role: Role;
  /** Full replacement of this person's cohort assignment — same shape as
   * invitePerson's, so "move Cohort B from Facilitator B to Facilitator
   * A" is just editing A's list to include it (and, separately, editing
   * or deactivating B). */
  cohortIds: string[];
}

/** Admin-only. Renames, re-roles, and/or reassigns which cohorts someone
 * has access to — everything invitePerson sets up front, editable after
 * the fact. Doesn't touch email or state; use deactivatePerson/
 * reactivatePerson for access, and re-inviting for email changes (a
 * person's email is their Supabase Auth identity, not just a label). */
export async function updatePerson(input: UpdatePersonInput): Promise<void> {
  const actor = await requireRole("admin");
  const name = input.name.trim();
  if (!name) throw new Error("Enter a name.");

  const admin = createAdminClient();

  const { error: userErr } = await admin
    .from("app_user")
    .update({ name, role: input.role })
    .eq("id", input.id);
  if (userErr) throw new Error("Couldn't update this person. Please try again.");

  // Full replace rather than a diff — simpler and just as correct, since
  // the dialog always submits the complete intended set.
  const { error: deleteErr } = await admin.from("cohort_member").delete().eq("user_id", input.id);
  if (deleteErr) throw new Error("Couldn't update this person's cohorts. Please try again.");

  const capacity = input.role === "teacher" ? "teacher" : "facilitator";
  if ((input.role === "facilitator" || input.role === "teacher") && input.cohortIds.length) {
    const { error: memberErr } = await admin.from("cohort_member").insert(
      input.cohortIds.map((cohortId) => ({ cohort_id: cohortId, user_id: input.id, capacity }))
    );
    if (memberErr) throw new Error("Couldn't update this person's cohorts. Please try again.");
  }

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "app_user",
    entity_id: input.id,
    action: "update",
    after: { name, role: input.role, cohortIds: input.cohortIds },
  });

  revalidatePath("/settings");
}

/** Admin-only, and not on yourself — the safe alternative to deleting
 * someone from the Supabase dashboard directly, which fails outright the
 * moment they've ever recorded a register, an outcome, or any audited
 * action (those foreign keys point at app_user without cascade, on
 * purpose). Deactivating just flips a flag: every row they ever touched,
 * and their cohort assignments, stay exactly as they were — they simply
 * can't sign in until reactivated. */
export async function deactivatePerson(id: string): Promise<void> {
  const actor = await requireRole("admin");
  if (actor.id === id) {
    throw new Error("You can't deactivate your own account.");
  }

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("app_user")
    .select("role, name")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) throw new Error("Couldn't load this person. Please try again.");
  if (!target) throw new Error("This person no longer exists.");

  if (target.role === "admin") {
    const { count, error: countErr } = await admin
      .from("app_user")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("state", "active");
    if (countErr) throw new Error("Couldn't verify admin count. Please try again.");
    if ((count ?? 0) <= 1) {
      throw new Error("Can't deactivate the last active admin — promote someone else first.");
    }
  }

  const { error } = await admin.from("app_user").update({ state: "deactivated" }).eq("id", id);
  if (error) throw new Error("Couldn't deactivate this person. Please try again.");

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "app_user",
    entity_id: id,
    action: "deactivate",
    after: { name: target.name },
  });

  revalidatePath("/settings");
}

/** Admin-only. Always restores to "active" — state has never gated
 * anything but a display label and the activate_self() privilege guard,
 * so there's no meaningful "invited" to restore back to. */
export async function reactivatePerson(id: string): Promise<void> {
  const actor = await requireRole("admin");
  const admin = createAdminClient();

  const { error } = await admin.from("app_user").update({ state: "active" }).eq("id", id);
  if (error) throw new Error("Couldn't reactivate this person. Please try again.");

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "app_user",
    entity_id: id,
    action: "reactivate",
  });

  revalidatePath("/settings");
}
