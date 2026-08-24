"use server";

import { createClient } from "@/lib/supabase/server";

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
