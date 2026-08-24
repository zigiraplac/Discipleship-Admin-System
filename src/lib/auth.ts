import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Role } from "@/lib/domain/types";

export { NAV_BY_ROLE, roleLabel } from "@/lib/roles";

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data } = await supabase
    .from("app_user")
    .select("id, name, email, role, state")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!data) return null;
  return data as AppUser;
}

/** For Server Components / layouts that require a signed-in app user. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
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

