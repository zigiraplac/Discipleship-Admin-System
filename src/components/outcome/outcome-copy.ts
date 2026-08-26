import type { OutcomeKind } from "@/lib/domain/types";

/**
 * The three outcomes a facilitator/admin can record for a student, plus the
 * narrative copy used on the outcome modal, Student detail's History card,
 * and the Attention cards — one source of truth so wording never drifts.
 * Each one actually resolves something: the missed lessons get made up
 * (catchup), the student's no longer continuing (left), or a catch-up plan
 * worked and they're genuinely back to normal (resolved) — kept as its own
 * recorded decision rather than silently reverting to a computed status,
 * so the append-only history still shows that it happened.
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
  resolved: {
    title: "Back on track",
    text: () => "Caught up on everything — attendance is back to normal.",
  },
  left: {
    title: "Left the cohort",
    text: () => "No longer continuing. History is kept.",
  },
};

/** Short form used on Students and Attention, where space is tight. */
export function outcomeShortLabel(kind: OutcomeKind): string {
  return { catchup: "On catch-up", resolved: "Back on track", left: "Left cohort" }[kind];
}

/** Pill/dot tone per outcome kind, using the standard status palette:
 * yellow for still-being-addressed (at risk/warning), green for a
 * successfully closed decision, grey for no longer applicable. */
const OUTCOME_TONE: Record<OutcomeKind, "yellow" | "green" | "grey"> = {
  catchup: "yellow",
  resolved: "green",
  left: "grey",
};

export function outcomeTone(kind: OutcomeKind): "yellow" | "green" | "grey" {
  return OUTCOME_TONE[kind];
}
