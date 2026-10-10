import { upcomingBirthdays, type BirthdaySource } from "./birthdays";

/**
 * The wording of the pastoral notifications, kept here so it can be tested
 * for what it must never say: no student's name, no outcome, nothing a
 * reader couldn't already see. The destination page shows the detail to
 * those allowed to see it.
 */

export interface NoticeText {
  kind: string;
  title: string;
  body: string;
  href: string;
  dedupeKey?: string;
}

/** An outcome was recorded — which student, and what, stays on Follow Up. */
export function outcomeRecordedNotice(input: { cohortName: string; cohortSlug: string; auditId: string | number | null }): NoticeText {
  return {
    kind: "outcome_recorded",
    title: `An outcome was recorded in ${input.cohortName.trim()}`,
    body: "Open Follow Up to see it.",
    href: `/c/${input.cohortSlug}/followup`,
    dedupeKey: input.auditId != null ? `outcome:${input.auditId}` : undefined,
  };
}

/** How many active students have their birthday today (same date rules as
 * the dashboard's upcoming birthdays). */
export function birthdaysToday(students: BirthdaySource[], todayISO: string): number {
  return upcomingBirthdays(students, todayISO, students.length).filter((b) => b.daysUntil === 0).length;
}

/** One digest per cohort per day — names only on the cohort's own pages. */
export function birthdayDigestNotice(input: { cohortId: string; cohortName: string; cohortSlug: string; count: number; todayISO: string }): NoticeText & {
  data: { kind: "birthday_digest"; cohortId: string; date: string; count: number };
} {
  const n = input.count;
  return {
    kind: "birthday_digest",
    title: `Birthdays today in ${input.cohortName.trim()}`,
    body: `${n} student${n === 1 ? " has a birthday" : "s have birthdays"} today.`,
    href: `/c/${input.cohortSlug}`,
    dedupeKey: `birthday_digest:${input.cohortId}:${input.todayISO}`,
    data: { kind: "birthday_digest", cohortId: input.cohortId, date: input.todayISO, count: n },
  };
}
