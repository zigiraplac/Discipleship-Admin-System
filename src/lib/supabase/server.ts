import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { timeoutFetch } from "./timeout-fetch";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client — reads the session from cookies and still
 * respects RLS as the signed-in user. Use this everywhere except the
 * seed script and the (rare) admin-only maintenance action.
 *
 * Wrapped in `cache()` so every call within one request/render returns
 * the same client instance — Shell and the page it wraps both build a
 * client independently, and without this, the data-fetcher `cache()`
 * wrappers below it (getStudents, getLessonEvents, ...) couldn't dedupe
 * either, since a different client object per call breaks their argument
 * equality. Safe to share: nothing here holds per-call state, and this
 * resets every request, so nothing leaks across users/requests.
 */
export const createClient = cache(async function createClient() {
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
    global: { fetch: timeoutFetch(20_000) },
  });
});
