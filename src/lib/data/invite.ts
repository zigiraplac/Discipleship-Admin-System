import type { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/supabase/env";
import type { Role } from "@/lib/domain/types";

type Admin = ReturnType<typeof createAdminClient>;

const ALREADY_REGISTERED_CODES = new Set(["email_exists", "user_already_exists"]);

/** `listUsers` pages at 200/request — past that many total logins
 * org-wide, an older orphaned account could sit on a later page and never
 * be found, surfacing as a confusing "already registered" dead end
 * instead of the intended re-link flow below. */
async function findAuthUserByEmail(admin: Admin, email: string): Promise<{ id: string } | null> {
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
 * Creates (or re-links) a person's account and sends them a Supabase Auth
 * invite to set their own password. Shared by Settings › People (admin)
 * and a level's Staff page (its leaders). The caller checks permission.
 *
 * `resendLink` is only set when this email already had an auth account
 * with no profile attached — Supabase won't auto-send a second email for
 * an existing account, so the link is handed back to deliver by hand.
 */
export async function inviteAccount(
  admin: Admin,
  input: { name: string; email: string; role: Role }
): Promise<{ userId: string; resendLink?: string }> {
  const redirectTo = `${SITE_URL()}/auth/set-password`;
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { name: input.name },
    redirectTo,
  });

  let userId: string;
  let resendLink: string | undefined;
  if (inviteErr) {
    if (!ALREADY_REGISTERED_CODES.has(inviteErr.code ?? "")) throw inviteErr;
    // The email already has an auth account. Either it's a real, still-
    // linked person (surface a clear error), or it's orphaned (profile
    // removed while the auth account stayed) — re-link that instead of
    // leaving the email permanently stuck.
    const existing = await findAuthUserByEmail(admin, input.email);
    if (!existing) throw inviteErr;
    const { data: existingPerson } = await admin.from("app_user").select("id").eq("id", existing.id).maybeSingle();
    if (existingPerson) throw new Error("Someone is already registered with this email.");
    userId = existing.id;
    // "recovery" works whether or not the account ever finished setup;
    // /auth/set-password treats it exactly like an invite.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: input.email,
      options: { redirectTo },
    });
    if (linkErr) throw linkErr;
    resendLink = linkData.properties.action_link;
  } else {
    userId = invited.user.id;
  }

  const { error: userErr } = await admin.from("app_user").upsert({
    id: userId,
    name: input.name,
    email: input.email,
    role: input.role,
    state: "invited",
  });
  if (userErr) throw userErr;
  return { userId, resendLink };
}
