import type { OutcomeKind } from "@/lib/domain/types";

/**
 * The two outcomes a facilitator/admin can record for a student, plus the
 * narrative copy used on the outcome modal, Student detail's History card,
 * and the Attention cards — one source of truth so wording never drifts.
 * Deliberately just two: attention flags an attendance problem, so the
 * decision recorded against it should actually resolve something — either
 * the missed lessons get made up, or the student's no longer continuing.
 * A middle "no change needed" option used to exist here but resolved
 * neither, so it was removed.
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
  left: {
    title: "Left the cohort",
    text: () => "No longer continuing. History is kept.",
  },
};

/** Short form used on Students and Attention, where space is tight. */
export function outcomeShortLabel(kind: OutcomeKind): string {
  return { catchup: "On catch-up", left: "Left cohort" }[kind];
}

/** Pill/dot tone per outcome kind, using the standard status palette:
 * yellow for still-being-addressed (at risk/warning), grey for no longer
 * applicable. */
const OUTCOME_TONE: Record<OutcomeKind, "yellow" | "grey"> = {
  catchup: "yellow",
  left: "grey",
};

export function outcomeTone(kind: OutcomeKind): "yellow" | "grey" {
  return OUTCOME_TONE[kind];
}
