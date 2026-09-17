import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Role } from "@/lib/domain/types";

export { NAV_BY_ROLE, roleLabel } from "@/lib/roles";

type UserStatus =
  | { kind: "signed-out" }
  | { kind: "deactivated"; name: string }
  | { kind: "ok"; user: AppUser };

/**
 * A deactivated person still has a valid Supabase session (deactivating
 * doesn't touch auth.users, only app_user.state) — so this has to be
 * distinguished from "no session" to route each correctly. Redirecting a
 * deactivated user to /login would just bounce right back to / (the
 * proxy's own "already signed in" rule), looping forever.
 *
 * Cached per request: Shell calls requireUser() for its own needs, and
 * the page being rendered calls it again independently — without this,
 * that's a fresh auth.getUser() *and* a fresh app_user query, twice,
 * on every single page load.
 */
const getUserStatus = cache(async function getUserStatus(): Promise<UserStatus> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: "signed-out" };

  const { data } = await supabase
    .from("app_user")
    .select("id, name, email, role, state")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!data) return { kind: "signed-out" };
  if (data.state === "deactivated") return { kind: "deactivated", name: data.name };
  return { kind: "ok", user: data as AppUser };
});

export async function getCurrentUser(): Promise<AppUser | null> {
  const status = await getUserStatus();
  return status.kind === "ok" ? status.user : null;
}

/** For Server Components / layouts that require a signed-in, active app user. */
export async function requireUser(): Promise<AppUser> {
  const status = await getUserStatus();
  if (status.kind === "signed-out") redirect("/login");
  if (status.kind === "deactivated") redirect("/deactivated");
  return status.user;
}

/** For the /deactivated page itself — the one place that must NOT bounce
 * a deactivated user away (that's what got them here), only a signed-out
 * or still-active one. */
export async function requireDeactivated(): Promise<{ name: string }> {
  const status = await getUserStatus();
  if (status.kind === "signed-out") redirect("/login");
  if (status.kind === "ok") redirect("/");
  return { name: status.name };
}

/** For server actions that must only be reachable by certain roles. Real
 * enforcement still lives in RLS — this is a fast, friendly rejection
 * before the query even runs. */
export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Error(`This action requires one of: ${roles.join(", ")}.`);
  }
  return user;
}

