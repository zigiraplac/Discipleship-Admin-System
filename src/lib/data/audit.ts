import { cache } from "react";
import type { DB } from "./types";

export interface MajorChange {
  id: string;
  /** ISO date (YYYY-MM-DD), for grouping into Reports' monthly timeline. */
  date: string;
  /** YYYY-MM — the group key. */
  month: string;
  /** "crusade" changes are Crusades' own history, not Reports' — Reports
   * filters this list down to "lesson" | "cohort" (see reports-view.tsx);
   * the Crusades page filters down to "crusade". */
  changeKind: "lesson" | "crusade" | "cohort";
  summary: string;
  effect: string | null;
  reason: string | null;
  actorName: string | null;
}

interface AuditRow {
  id: number;
  entity: string;
  entity_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string } | { name: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function describe(row: AuditRow): { summary: string; effect: string | null; changeKind: MajorChange["changeKind"] } {
  const after = row.after ?? {};
  const before = row.before ?? {};

  if (row.entity === "cohort" && row.action === "create") {
    const students = typeof after.students === "number" ? after.students : "some";
    const events = typeof after.events === "number" ? after.events : "a";
    return {
      summary: `Cohort created ("${after.name ?? "—"}")`,
      effect: `${students} students enrolled, ${events} events scheduled.`,
      changeKind: "cohort",
    };
  }

  if (row.entity === "event" && row.action === "postpone") {
    const shiftedCount = typeof after.shiftedCount === "number" ? after.shiftedCount : 0;
    const shiftedText =
      shiftedCount > 1
        ? `${shiftedCount} lessons and crusade days shifted forward.`
        : shiftedCount === 1
          ? "1 lesson or crusade day shifted forward."
          : "Nothing after it needed to shift.";

    if (typeof before.crusadeAfterClass === "number") {
      return {
        summary: `Crusade weekend after Class ${before.crusadeAfterClass} was postponed`,
        effect: shiftedText,
        changeKind: "crusade",
      };
    }
    return {
      summary: `A lesson scheduled for ${before.date ?? "—"} was postponed`,
      effect: shiftedText,
      changeKind: "lesson",
    };
  }

  // Fallback for any other cohort-scoped entity/action this feed ever
  // widens to include — never silently drops a row it fetched.
  return { summary: `${row.entity}: ${row.action}`, effect: null, changeKind: "lesson" };
}

/**
 * "What changed" — the schedule-affecting events (lesson/crusade
 * postponements, cohort creation) worth calling out on Reports' monthly
 * timeline, each with whatever reason was given at the time. `audit_log`
 * is written to far more broadly than this (every outcome, every register
 * correction) — this deliberately narrows to the entity/action pairs that
 * are a "major change" in the sense the product asked for, not a full
 * activity log.
 */
export const getAuditLogForCohort = cache(async function getAuditLogForCohort(
  db: DB,
  cohortId: string,
  { limit = 100 }: { limit?: number } = {}
): Promise<MajorChange[]> {
  const { data, error } = await db
    .from("audit_log")
    .select("id, entity, entity_id, action, before, after, created_at, actor:app_user!audit_log_actor_id_fkey(name)")
    .eq("cohort_id", cohortId)
    .in("entity", ["event", "cohort"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as unknown as AuditRow[]).map((row) => {
    const { summary, effect, changeKind } = describe(row);
    const after = row.after ?? {};
    const actor = one(row.actor);
    return {
      id: String(row.id),
      date: row.created_at.slice(0, 10),
      month: row.created_at.slice(0, 7),
      changeKind,
      summary,
      effect,
      reason: typeof after.reason === "string" && after.reason ? after.reason : null,
      actorName: actor?.name ?? null,
    };
  });
});
