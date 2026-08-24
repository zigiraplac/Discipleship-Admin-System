import type { OutcomeKind } from "@/lib/domain/types";

/**
 * The three outcomes a facilitator/admin can record for a student, plus the
 * narrative copy used on the outcome modal, Student detail's History card,
 * and the Attention cards — one source of truth so wording never drifts.
 *
 * Deliberately its own plain module (no "use client"): several Server
 * Components (attention-card.tsx, history-card.tsx, students-table.tsx)
 * need these as plain functions, not client references. Importing them
 * from outcome-modal.tsx directly would have made every export of that
 * file a client boundary, breaking exactly that.
 */
export const OUTCOME_NARRATIVE: Record<
  OutcomeKind,
  { title: string; text: (missed: number) => string }
> = {
  catchup: {
    title: "On catch-up",
    text: (missed) => `Stays in the cohort and makes up ${missed} missed lesson${missed === 1 ? "" : "s"}.`,
  },
  continuing: {
    title: "Still with us",
    text: () => "Spoke to them. No change needed.",
  },
  left: {
    title: "Left the cohort",
    text: () => "No longer continuing. History is kept.",
  },
};

/** Short form used on Students and Attention, where space is tight. */
export function outcomeShortLabel(kind: OutcomeKind): string {
  return { catchup: "On catch-up", continuing: "Continuing", left: "Left cohort" }[kind];
}

/** Pill/dot tone per outcome kind — these three genuinely differ (still
 * working on it / resolved fine / no longer applicable), so they shouldn't
 * all render the same color the way a single hardcoded tone would. */
const OUTCOME_TONE: Record<OutcomeKind, "yellow" | "cyan" | "grey"> = {
  catchup: "yellow",
  continuing: "cyan",
  left: "grey",
};

export function outcomeTone(kind: OutcomeKind): "yellow" | "cyan" | "grey" {
  return OUTCOME_TONE[kind];
}
