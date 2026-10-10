import type { Capability } from "./policy";

/**
 * Which cohort pages someone sees comes from what they may do in *that*
 * cohort — not from their account role. A country leader drilling into a
 * cohort sees its dashboard, lessons and students (read-only); its
 * facilitators also get Follow Up and Catch ups; a teacher gets lessons and
 * registers. Client-safe (no server imports).
 */
const COHORT_PAGES: { id: string; needs: Capability }[] = [
  { id: "dashboard", needs: "view_cohort" },
  { id: "lessons", needs: "view_cohort" },
  { id: "calendar", needs: "view_cohort" },
  { id: "crusades", needs: "view_cohort" },
  { id: "reports", needs: "view_cohort" },
  { id: "students", needs: "view_student" },
  { id: "followup", needs: "view_followups" },
  { id: "catchup", needs: "view_followups" },
];

export function cohortNavFor(caps: Set<Capability>): string[] {
  return COHORT_PAGES.filter((p) => caps.has(p.needs)).map((p) => p.id);
}

/** A workspace = one place a person works, with the role they hold there. */
export interface Workspace {
  href: string;
  title: string;
  role: string;
  kind: "unit" | "cohort";
}
