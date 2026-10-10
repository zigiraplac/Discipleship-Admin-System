/**
 * Domain types shared between server queries, server actions, and client
 * components. Mirrors the schema in supabase/migrations/0001_init.sql —
 * see 02-domain-model.md / 08-backend-notes.md for the source spec.
 */

export type Role = "facilitator" | "admin" | "teacher" | "leadership";

export type CohortStatus = "running" | "complete" | "archived";

export type EventKind = "lesson" | "crusade";

export type OutcomeKind = "catchup" | "left" | "resolved";

export type Status = "On track" | "Needs help" | "At risk";

export type CohortHealth = "Healthy" | "Watch" | "Needs work";

/** Levels above the cohort, top to bottom. "site" is shown as "Church". */
export type OrgUnitType = "hq" | "continent" | "country" | "region" | "site" | "promotion";

/** leader: sees progress and manages the box; viewer: sees progress only. */
export type OrgRole = "leader" | "viewer";

export interface OrgUnit {
  id: string;
  parentId: string | null;
  type: OrgUnitType;
  name: string;
  slug: string;
  /** Ancestry as dot-separated ids (ltree) — a box's descendants are the
   * boxes whose path starts with `${path}.`. */
  path: string;
  details: OrgUnitDetails;
}

/** A level's own details (see domain/unit-details.ts for which apply where). */
export interface OrgUnitDetails {
  /** General contact for the level itself — not its leader's. */
  email?: string;
  description?: string;
  timeZone?: string;
  languages?: string;
  city?: string;
  address?: string;
  phone?: string;
  area?: string;
  startYear?: number;
  endYear?: number;
}

export interface ClassRef {
  id: number; // 1..7
  title: string;
  partNote: string | null;
  lessonCount: number;
  position: number;
}

export interface Cohort {
  id: string;
  /** Used in every URL from here on (/c/{slug}/...) instead of `id` — a
   * cohort's own name, kebab-cased, generated once at creation. */
  slug: string;
  name: string;
  city: string | null;
  startDate: string; // ISO date
  teachingDays: number[]; // 0=Sun..6=Sat
  /** Joined, comma-separated names of this cohort's assigned facilitators
   * (cohort_member, capacity "facilitator") — null when none yet. */
  facilitatorName: string | null;
  status: CohortStatus;
  /** Lessons covered per study session — the target pace. Defaults to 1;
   * a postponed lesson (and everything after it) reflows around whatever
   * this cohort's actual value is. */
  lessonsPerSession: number;
  /** How many weeks between teaching weeks — 1 means every week. This,
   * `teachingDays`, and `lessonsPerSession` together are the cohort's
   * *original* (creation-time) cadence, never overwritten by a later
   * change — see `ScheduleSegment` in `src/lib/domain/generator.ts`. */
  intervalWeeks: number;
  /** The promotion (or church) this cohort belongs to; null if not placed yet. */
  orgUnitId: string | null;
  createdAt: string;
}

export interface Student {
  id: string;
  cohortId: string;
  fullName: string;
  email: string | null;
  emailVerified: boolean;
  whatsapp: string | null;
  country: string | null;
  countryRaw: string | null;
  dobDay: number | null;
  dobMonth: number | null;
  city: string | null;
  /** Any registration-form column that didn't map to a known field, keyed
   * by its original header — see registrations.ts. Not read by any current
   * feature; a lossless holding pen, not a data model. */
  extra: Record<string, string> | null;
  /** When a facilitator/admin last marked this student as contacted while
   * flagged and awaiting an outcome — cleared by recordOutcome. Null means
   * either never flagged, or flagged and not yet reached out to. */
  contactedAt: string | null;
  /** Who follows up with this student while they need attention. */
  followUpAssignee: string | null;
  /** When to check on them again (YYYY-MM-DD); in the past = overdue. */
  followUpNextOn: string | null;
  registeredAt: string | null;
  enrolledAt: string;
  leftAt: string | null;
  /** Enrolment history (joined / left / returned), oldest first — decides
   * which lessons the student owed. See domain/enrolment.ts. */
  enrolment?: { kind: "joined" | "left" | "returned"; on: string }[];
}

export interface CohortEvent {
  id: string;
  cohortId: string;
  kind: EventKind;
  date: string; // ISO date
  lessonId: number | null;
  afterClass: number | null; // crusade
  crusadeDay: number | null; // crusade, 0 = Friday, 1 = Saturday
  edited: boolean;
}

export interface Register {
  eventId: string;
  attendance: Record<string, "present" | "absent">;
  recordedBy: string | null;
  recordedAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** Students whose absence at this lesson was later made up
   * (lesson_catchup). Their mark here stays "absent" — what happened on
   * the day — and the recovery is counted separately. */
  caughtUp?: string[];
}

export interface Outcome {
  id: string;
  studentId: string;
  cohortId: string;
  kind: OutcomeKind;
  note: string | null;
  recordedBy: string;
  recordedByName?: string | null;
  recordedAt: string;
}

export interface CrusadeReport {
  id: string;
  cohortId: string;
  afterClass: number;
  soulsReached: number | null;
  conversions: number | null;
  followups: number | null;
  notes: string | null;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  state: "active" | "invited" | "deactivated";
}

export interface CohortMember {
  cohortId: string;
  userId: string;
  capacity: "facilitator" | "teacher";
}

export interface Bands {
  activeThreshold: number; // "On track" at/above
  helpThreshold: number; // "Needs help" at/above
}

export const DEFAULT_BANDS: Bands = { activeThreshold: 85, helpThreshold: 60 };

/** A lesson event joined with its curriculum reference and saved register, if any. */
export interface LessonEventView {
  eventId: string;
  cohortId: string;
  date: string;
  globalIndex: number;
  classNumber: number;
  classIndex: number;
  lessonRef: string; // "C2 · L13"
  lessonTitle: string;
  edited: boolean;
  /** Always present — every lesson event is created with an empty register.
   * Use `register.recordedAt != null` to tell "saved" from "outstanding". */
  register: Register;
}

export interface CrusadeEventView {
  eventId: string;
  cohortId: string;
  date: string;
  afterClass: number;
  crusadeDay: number; // 0 = Friday, 1 = Saturday
}

export interface StudentAggregate extends Student {
  idx: number; // position in cohort roster, used for deterministic seeding only
  /** Recorded lessons this student was present at. */
  attended: number;
  /** Recorded lessons this student was enrolled for (owed). */
  expected: number;
  /** Recorded absences, as marked on the day. */
  absences: number;
  /** Of those absences, how many were made up (catch-up). */
  recovered: number;
  /** Absences still to make up (absences − recovered). */
  missed: number;
  /** Attendance as it happened: attended ÷ expected, 0..100. */
  rate: number;
  /** Counting made-up lessons: (attended + recovered) ÷ expected. */
  effectiveRate: number;
  /** Performance band, from `effectiveRate`. Meaningless while
   * `expected === 0` — see `performance`. */
  status: Status;
  /** `status`, or "Not started" when no recorded lesson is owed yet. */
  performance: Status | "Not started";
  /** The highest curriculum position (0-based, see curriculum.ts) this
   * student was actually marked present for — their own real progress,
   * not the cohort's. Null if they've never been marked present. */
  lastAttendedGlobalIndex: number | null;
  /** Consecutive misses counting back from the most recent recorded lesson
   * within this student's own enrollment window — resets to 0 on their
   * last present mark. Distinct from `missed` (a lifetime total): this is
   * what catches someone who's gone quiet *recently*, even if their
   * overall rate hasn't tipped into a worse band yet. */
  currentMissStreak: number;
}
