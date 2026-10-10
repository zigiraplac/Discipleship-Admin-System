import type { Bands } from "./types";

/**
 * The programme policy: one set of rules for the whole network, kept as
 * effective-dated versions (programme_policy, 0039). A calculation about a
 * date uses the version in force on that date, so changing the policy
 * (say On track 85% → 70% from 2027) never re-interprets earlier periods.
 * Versions are never edited — a change is a new version.
 */
export interface PolicyVersion {
  version: number;
  /** YYYY-MM-DD — in force from this date until the next version's. */
  effectiveFrom: string;
  /** Attendance status bands: On track ≥ onTrack, Needs help ≥ needsHelp. */
  onTrack: number;
  needsHelp: number;
  /** Recorded absences in a row before a student counts as inactive. */
  inactiveStreak: number;
  /** Attendance needed to graduate — its own rule, not tied to On track. */
  graduationAttendance: number;
  note: string | null;
  createdAt: string | null;
  createdBy: string | null;
}

/** The version in force on a date (versions in any order). Before the
 * first version, the first one applies. */
export function policyOn(versions: PolicyVersion[], dateISO: string): PolicyVersion {
  if (!versions.length) throw new Error("No programme policy has been set.");
  const sorted = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let current = sorted[0];
  for (const v of sorted) if (v.effectiveFrom <= dateISO) current = v;
  return current;
}

export function bandsOf(p: Pick<PolicyVersion, "onTrack" | "needsHelp">): Bands {
  return { activeThreshold: p.onTrack, helpThreshold: p.needsHelp };
}

export type PolicyDraft = Pick<PolicyVersion, "effectiveFrom" | "onTrack" | "needsHelp" | "inactiveStreak" | "graduationAttendance">;

/** Why a new version can't be created, or null. Forward-only: from today
 * or later, after the latest version (the database enforces the same). */
export function newVersionProblem(existing: PolicyVersion[], draft: PolicyDraft, todayISO: string): string | null {
  const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom)) return "Pick the date the new policy starts.";
  if (draft.effectiveFrom < todayISO) return "A policy can't start in the past — earlier periods keep the rules they had.";
  const latest = existing.reduce<string | null>((m, v) => (!m || v.effectiveFrom > m ? v.effectiveFrom : m), null);
  if (latest && draft.effectiveFrom <= latest) return `It must start after the latest version (${latest}).`;
  if (!whole(draft.onTrack, 1, 100) || !whole(draft.needsHelp, 0, 99)) return "Thresholds must be whole numbers between 0 and 100.";
  if (draft.needsHelp >= draft.onTrack) return "Needs help must be lower than On track.";
  if (!whole(draft.inactiveStreak, 2, 20)) return "Inactive rule: a whole number of lessons between 2 and 20.";
  if (!whole(draft.graduationAttendance, 1, 100)) return "Graduation attendance must be a whole number between 1 and 100.";
  return null;
}
