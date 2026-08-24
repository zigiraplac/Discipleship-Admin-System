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
 * Supabase Auth's own `updateUser` already scopes a password change to
 * whoever the current session belongs to — no separate permission check
 * needed here, and no re-entering the current password either, the same
 * as changing it while already signed in anywhere else.
 */
export async function changeOwnPassword(password: string): Promise<void> {
  await requireUser();
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
