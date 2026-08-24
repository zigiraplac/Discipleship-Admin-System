/**
 * Domain types shared between server queries, server actions, and client
 * components. Mirrors the schema in supabase/migrations/0001_init.sql —
 * see 02-domain-model.md / 08-backend-notes.md for the source spec.
 */

export type Role = "facilitator" | "admin" | "teacher" | "leadership";

export type CohortStatus = "running" | "complete" | "archived";

export type EventKind = "lesson" | "crusade";

export type OutcomeKind = "catchup" | "continuing" | "left";

export type Status = "On track" | "Needs help" | "At risk";

export type CohortHealth = "Healthy" | "Watch" | "Needs work";

export interface ClassRef {
  id: number; // 1..7
  title: string;
  partNote: string | null;
  lessonCount: number;
  position: number;
}

export interface LessonRef {
  id: number;
  classId: number;
  indexInClass: number; // 1..n — the L in "C3 · L7"
  globalIndex: number; // 0..79
  title: string;
  hasQuiz: boolean;
}

export interface Cohort {
  id: string;
  name: string;
  city: string | null;
  startDate: string; // ISO date
  teachingDays: number[]; // 0=Sun..6=Sat
  facilitatorId: string | null;
  facilitatorName: string | null;
  status: CohortStatus;
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
  registeredAt: string | null;
  enrolledAt: string;
  leftAt: string | null;
}

export interface CohortEvent {
  id: string;
  cohortId: string;
  kind: EventKind;
  date: string; // ISO date
  lessonId: number | null;
  afterClass: number | null; // crusade
  crusadeDay: number | null; // crusade, 0..2
  edited: boolean;
}

export interface Register {
  eventId: string;
  attendance: Record<string, "present" | "absent">;
  quiz: Record<string, number>;
  recordedBy: string | null;
  recordedAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
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
  state: "active" | "invited";
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
  hasQuiz: boolean;
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
  crusadeDay: number; // 0..2
}

export interface StudentAggregate extends Student {
  idx: number; // position in cohort roster, used for deterministic seeding only
  attended: number;
  expected: number; // lessons recorded so far
  missed: number;
  rate: number; // 0..100
  quizAvg: number | null;
  status: Status;
}
