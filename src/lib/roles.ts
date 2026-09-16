import type { Role } from "@/lib/domain/types";

/**
 * Pure role data — deliberately isolated from `src/lib/auth.ts`, which
 * pulls in `next/navigation` + the server-only Supabase client. A Client
 * Component (e.g. the sidebar) that needs `NAV_BY_ROLE` must import it
 * from here, never from `@/lib/auth` — importing anything from that
 * module drags its server-only transitive imports into the client bundle
 * and breaks the build.
 */
export const NAV_BY_ROLE: Record<Role, string[]> = {
  facilitator: [
    "dashboard",
    "lessons",
    "students",
    "followup",
    "catchup",
    "crusades",
    "calendar",
    "reports",
    "cohorts",
  ],
  admin: [
    "dashboard",
    "lessons",
    "students",
    "followup",
    "catchup",
    "crusades",
    "calendar",
    "reports",
    "cohorts",
    "settings",
  ],
  teacher: ["dashboard", "lessons", "crusades", "calendar", "reports"],
  leadership: ["dashboard", "students", "crusades", "reports", "cohorts"],
};

export function roleLabel(role: Role): string {
  return { facilitator: "Facilitator", admin: "Administrator", teacher: "Teacher", leadership: "Leadership" }[role];
}

/**
 * Does this role's nav include whatever page `path` points to? A
 * notification is written once, for a batch of recipients across
 * different roles (e.g. an escalation notice goes to a cohort's
 * facilitators *and* teachers *and* every admin/leadership user) — its
 * `href` can't be right for all of them at once if it points at a page
 * only some of those roles can open (Follow Up, say, which teacher and
 * leadership don't have). Used by the notifications bell to decide whether
 * clicking one should navigate at all, instead of letting a
 * role-inappropriate link 404.
 */
export function canAccessPath(role: Role, path: string): boolean {
  const cohortScoped = /^\/c\/[^/]+(\/.*)?$/.exec(path);
  const rest = cohortScoped ? (cohortScoped[1] ?? "") : path;
  const segment = rest.split("/").filter(Boolean)[0] ?? "dashboard";
  return NAV_BY_ROLE[role].includes(segment);
}
