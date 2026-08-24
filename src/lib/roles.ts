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
  facilitator: ["dashboard", "lessons", "students", "attention", "calendar", "reports", "cohorts"],
  admin: ["dashboard", "lessons", "students", "attention", "calendar", "reports", "cohorts", "settings"],
  teacher: ["dashboard", "lessons", "calendar", "reports"],
  leadership: ["dashboard", "students", "reports", "cohorts"],
};

export function roleLabel(role: Role): string {
  return { facilitator: "Facilitator", admin: "Administrator", teacher: "Teacher", leadership: "Leadership" }[role];
}
