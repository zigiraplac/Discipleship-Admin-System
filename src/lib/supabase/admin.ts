import { createClient as createRawClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database.types";

/**
 * Service-role client — bypasses RLS entirely. Server-only, and only for
 * the seed script and the cohort-creation transaction (which legitimately
 * needs to write cohort + students + 101+ events + 80 registers in one
 * shot on behalf of an admin whose own RLS grants already permit exactly
 * that; using the service role here just avoids 101 round-trip policy
 * checks). Never import this from a Client Component or expose the key
 * to the browser.
 */
export function createAdminClient() {
  return createRawClient<Database>(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
