import type { Student } from "./types";

/** One dated change in a student's enrolment (student_enrolment_event). */
export interface EnrolmentChange {
  kind: "joined" | "left" | "returned";
  /** YYYY-MM-DD — the change applies from this date. */
  on: string;
}

/** What eligibility needs to know about a student. `enrolment` is the
 * history (oldest first); without it, the current enrolled/left dates
 * stand in for a simple joined → (left) history. */
export type EnrolmentStudent = Pick<Student, "enrolledAt" | "leftAt"> & { enrolment?: EnrolmentChange[] };

export function enrolmentChanges(s: EnrolmentStudent): EnrolmentChange[] {
  if (s.enrolment?.length) return s.enrolment;
  const out: EnrolmentChange[] = [{ kind: "joined", on: s.enrolledAt.slice(0, 10) }];
  if (s.leftAt) out.push({ kind: "left", on: s.leftAt.slice(0, 10) });
  return out;
}

/**
 * Was this student enrolled on this date — i.e. do they owe attendance for
 * a lesson held that day? The latest change on or before the date decides:
 * joined/returned → yes, left → no (a leave applies from its own date).
 * Leaving later never removes lessons they were enrolled for.
 */
export function enrolledOn(s: EnrolmentStudent, dateISO: string): boolean {
  let state = false;
  for (const c of enrolmentChanges(s)) {
    if (c.on > dateISO) break;
    state = c.kind !== "left";
  }
  return state;
}
