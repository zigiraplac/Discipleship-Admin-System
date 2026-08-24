import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client — reads the session from cookies and still
 * respects RLS as the signed-in user. Use this everywhere except the
 * seed script and the (rare) admin-only maintenance action.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — middleware refreshes
          // the session on navigation, so this is safe to ignore.
        }
      },
    },
  });
}
