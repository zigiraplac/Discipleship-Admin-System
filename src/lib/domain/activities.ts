/**
 * TODO: set to true once supabase/migrations/0045_activities.sql has been
 * applied to the database. Until then the app keeps the old behaviour: a
 * saved crusade report means "done", there's no Done / Not done choice,
 * and Agape / Fellowship / custom activities are hidden.
 */
export const ACTIVITIES_MIGRATION_APPLIED = false;

/** Kinds every cohort is offered; a cohort can also name its own. */
export const BUILT_IN_ACTIVITY_KINDS = ["Agape", "Fellowship"] as const;

export type ActivityStatus = "planned" | "done" | "not_done";
export const ACTIVITY_STATUSES: ActivityStatus[] = ["planned", "done", "not_done"];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  planned: "Planned",
  done: "Done",
  not_done: "Not done",
};

/** Trims a typed kind and maps "agape" / "FELLOWSHIP" onto the built-in
 * spelling, so the same kind never ends up in two tabs. */
export function normalizeActivityKind(raw: string): string {
  const kind = raw.trim().replace(/\s+/g, " ");
  return BUILT_IN_ACTIVITY_KINDS.find((k) => k.toLowerCase() === kind.toLowerCase()) ?? kind;
}

/** Built-in kinds first, then the cohort's own in A–Z order. */
export function activityKinds(used: string[]): string[] {
  const builtIn: string[] = [...BUILT_IN_ACTIVITY_KINDS];
  const custom = [...new Set(used.map(normalizeActivityKind))]
    .filter((k) => !builtIn.includes(k))
    .sort((a, b) => a.localeCompare(b));
  return [...builtIn, ...custom];
}
