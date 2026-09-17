"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

/**
 * Called once, right after an invited person sets their password on
 * /auth/set-password. Flips `app_user.state` from "invited" to "active"
 * via a narrow SECURITY DEFINER function — see
 * supabase/migrations/0002_self_activate.sql for why this isn't just a
 * generic "update your own row" RLS policy (that would let someone
 * rewrite their own `role` too).
 */
export async function activateAccount(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_self");
  if (error) throw error;
}

/**
 * Same reasoning as `activate_self` — a narrow SECURITY DEFINER function
 * (see 0005_notifications_and_profile.sql) rather than a general "update
 * your own row" policy, so this can never touch `role`.
 */
export async function updateOwnName(name: string): Promise<void> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a name.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_name", { new_name: trimmed });
  if (error) throw error;
  revalidatePath("/", "layout");
}

/**
 * An active session alone isn't enough to prove you're the account owner
 * (a left-open browser, a stolen session cookie) — so this re-verifies the
 * *current* password before setting a new one. Supabase has no separate
 * "check this password" endpoint; re-running `signInWithPassword` against
 * the account's own email is the standard way to confirm it without
 * actually changing which session is active (same user, so it just
 * refreshes the existing session).
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = await requireUser();
  if (!currentPassword) throw new Error("Enter your current password.");
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
  if (newPassword === currentPassword) throw new Error("New password must be different from the current one.");

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyErr) throw new Error("Current password is incorrect.");

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
