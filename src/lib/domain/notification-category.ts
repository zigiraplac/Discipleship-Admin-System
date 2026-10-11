/**
 * What kind of notification something is — derived from its existing
 * `kind`, never stored, so it applies to the whole history. Four
 * categories; "Updates" on the Notifications page is Management +
 * Information together, not a fifth.
 *
 * A notification's read state is only about the notification. Reading it
 * never resolves a follow-up, completes a register or changes any work.
 */

export type NotificationCategory = "action" | "management" | "reminder" | "info";

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  action: "Action required",
  management: "Management",
  reminder: "Reminders",
  info: "Information",
};

/** Display order: what needs doing first, background last. */
export const CATEGORY_ORDER: NotificationCategory[] = ["action", "management", "reminder", "info"];

const BY_KIND: Record<string, NotificationCategory> = {
  // Something someone needs to act on.
  attention_escalation: "action",
  // Organisational responsibility and status.
  staff_assignment: "management",
  status_change: "management",
  // Scheduled prompts.
  birthday: "reminder",
  birthday_digest: "reminder",
  crusade_upcoming: "reminder",
  // Things that happened — good to know, nothing to do.
  outcome_recorded: "info",
  lesson_postponed: "info",
  crusade_postponed: "info",
  student_updated: "info",
  bands_updated: "info",
  welcome: "info",
};

export function categoryOf(kind: string): NotificationCategory {
  return BY_KIND[kind] ?? "info";
}

/** The kinds in some categories — for filtering the history in the database. */
export function kindsIn(categories: NotificationCategory[]): string[] {
  return Object.entries(BY_KIND)
    .filter(([, c]) => categories.includes(c))
    .map(([k]) => k);
}

export type NotificationFilter = "all" | "unread" | "action" | "reminder" | "updates";

/** Which categories a page filter shows (null = every category). */
export function filterCategories(filter: NotificationFilter): NotificationCategory[] | null {
  if (filter === "action") return ["action"];
  if (filter === "reminder") return ["reminder"];
  if (filter === "updates") return ["management", "info"];
  return null;
}

/** What opening it does, in words — only for destinations the app has. */
export function actionLabelFor(href: string | null): string | null {
  if (!href) return null;
  if (/^https?:\/\//.test(href)) return "Open link";
  const c = /^\/c\/[^/?#]+\/?([^/?#]*)(\/[^?#]+)?/.exec(href);
  if (c) {
    const page = c[1];
    if (page === "followup") return "View follow-ups";
    if (page === "students") return c[2] ? "View student" : "View students";
    if (page === "lessons") return "View lessons";
    if (page === "activities" || page === "crusades") return "View activities";
    if (page === "catchup") return "View catch-ups";
    if (page === "calendar") return "View calendar";
    return "Open cohort";
  }
  const u = /^\/u\/[^/?#]+\/?([^/?#]*)/.exec(href);
  if (u) {
    if (u[1] === "attention") return "View needs attention";
    if (u[1] === "staff") return "View staff";
    if (u[1] === "inside") return "View";
    return "Open overview";
  }
  if (href.startsWith("/cohorts")) return "View cohorts";
  if (href.startsWith("/settings")) return "Open settings";
  return "Open";
}
