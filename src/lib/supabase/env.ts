/**
 * Next.js only inlines a `NEXT_PUBLIC_*` variable into the browser bundle
 * when it sees the literal `process.env.NEXT_PUBLIC_X` expression in the
 * source — it's a static compile-time scan, not a runtime lookup. So each
 * one is read as its own literal property access below; a generic
 * `process.env[name]` helper would work server-side but silently resolve
 * to `undefined` in any client-side bundle.
 */
export function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.local.example to .env.local and fill in your Supabase project's credentials.`
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const SUPABASE_SERVICE_ROLE_KEY = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
// A silent `?? "http://localhost:3000"` fallback here would mean a host
// who forgets to set this var ships every invite/reset-password email
// with an unusable localhost link and no error at all — this variable is
// required so that mistake fails loudly at the moment of sending instead.
export const SITE_URL = () =>
  required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);
