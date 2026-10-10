import type { OutcomeKind, Status, StudentAggregate } from "./types";

/**
 * A student is described on three separate axes — never one status that
 * mixes them:
 *  - lifecycle: where they are in the programme (registered → active →
 *    left / completed),
 *  - performance: how they're doing, derived from attendance + the bands,
 *  - intervention: what's being done about it (follow-up, catch-up).
 * All three are derived from facts (enrolment history, registers,
 * catch-ups, outcomes) — none is stored, so none can drift.
 */

export type Lifecycle = "registered" | "active" | "left" | "completed" | "graduated";

/**
 * - left: their enrolment has ended.
 * - graduated: their cohort finished and they meet the graduation rule
 *   (see graduationCheck).
 * - completed: still enrolled when their cohort finished, but not (yet)
 *   meeting the graduation rule.
 * - registered: enrolled, but no recorded lesson owed yet.
 * - active: everyone else.
 */
export function studentLifecycle(
  s: Pick<StudentAggregate, "leftAt" | "expected">,
  cohortFinished: boolean,
  graduated = false
): Lifecycle {
  if (s.leftAt) return "left";
  if (cohortFinished) return graduated ? "graduated" : "completed";
  if (s.expected === 0) return "registered";
  return "active";
}

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  registered: "Registered",
  active: "Active",
  left: "Left",
  completed: "Completed",
  graduated: "Graduated",
};

export type Performance = Status | "Not started";

/** Only meaningful while someone is in the programme. */
export function studentPerformance(s: Pick<StudentAggregate, "performance">, lifecycle: Lifecycle): Performance | null {
  return lifecycle === "left" ? null : s.performance;
}

export type Intervention =
  | { kind: "none" }
  | { kind: "follow-up"; overdue: boolean; contacted: boolean }
  | { kind: "catch-up"; recovered: number; toRecover: number; complete: boolean };

/**
 * - catch-up: the latest decision was to catch up; progress = made-up
 *   absences out of all absences, complete once nothing is left to make up.
 * - follow-up: struggling (performance below On track) with no decision
 *   recorded yet; overdue when the planned check-in date has passed.
 * - none: otherwise, including anyone who has left.
 */
export function studentIntervention(
  s: Pick<StudentAggregate, "leftAt" | "performance" | "absences" | "recovered" | "missed" | "contactedAt" | "followUpNextOn">,
  latestOutcome: OutcomeKind | null,
  todayISO: string
): Intervention {
  if (s.leftAt) return { kind: "none" };
  if (latestOutcome === "catchup") {
    return { kind: "catch-up", recovered: s.recovered, toRecover: s.absences, complete: s.missed === 0 };
  }
  const struggling = s.performance === "Needs help" || s.performance === "At risk";
  if (struggling && !latestOutcome) {
    return { kind: "follow-up", overdue: !!s.followUpNextOn && s.followUpNextOn < todayISO, contacted: !!s.contactedAt };
  }
  return { kind: "none" };
}

/** Is this intervention still open? A catch-up counts as resolved once
 * every absence is made up; an unanswered follow-up is open. */
export function interventionResolved(i: Intervention): boolean {
  return i.kind === "none" || (i.kind === "catch-up" && i.complete);
}

export interface GraduationCheck {
  graduated: boolean;
  /** Every programme lesson delivered (registers recorded) while still enrolled. */
  lessonsComplete: boolean;
  /** Attendance as it happened (catch-ups don't change it), over the lessons
   * owed while enrolled — never lessons before they joined. */
  attendance: number | null;
  threshold: number;
  attendanceMet: boolean;
  interventionsResolved: boolean;
}

/**
 * Graduated = all required lessons completed AND attendance ≥ the policy's
 * graduation threshold AND no unresolved intervention. Derived from the
 * facts every time — never set by hand. `threshold` comes from the policy
 * in force when the cohort finished (policyOn), the same everywhere.
 */
export function graduationCheck(
  s: Pick<StudentAggregate, "leftAt" | "expected" | "rate">,
  allLessonsDelivered: boolean,
  intervention: Intervention,
  threshold: number
): GraduationCheck {
  const lessonsComplete = allLessonsDelivered && !s.leftAt;
  const attendance = s.expected ? s.rate : null;
  const attendanceMet = attendance != null && attendance >= threshold;
  const interventionsResolved = interventionResolved(intervention);
  return { graduated: lessonsComplete && attendanceMet && interventionsResolved, lessonsComplete, attendance, threshold, attendanceMet, interventionsResolved };
}
