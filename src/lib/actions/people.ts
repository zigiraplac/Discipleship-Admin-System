"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectTo = `${siteUrl}/auth/set-password`;

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
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
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
