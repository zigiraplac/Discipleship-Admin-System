import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database.types";

/**
 * Client-side Supabase client — respects RLS as the signed-in user.
 *
 * `detectSessionInUrl` is off on purpose. The only place this client is
 * used (`/auth/set-password`) needs full control over exactly when an
 * invite/recovery link's tokens get turned into a session — auto-detection
 * races against that page's own "sign out whatever's already here first"
 * step and can attach the link to the wrong browser session (see
 * src/app/auth/set-password/page.tsx for the actual sequence).
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    auth: { detectSessionInUrl: false },
  });
}
