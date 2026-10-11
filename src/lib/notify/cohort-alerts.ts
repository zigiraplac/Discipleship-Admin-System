import { getAllUnits } from "@/lib/data/org";
import { daysBetween } from "@/lib/utils";
import { birthdayDigestNotice, birthdaysToday } from "@/lib/domain/notification-messages";
import type { BirthdaySource } from "@/lib/domain/birthdays";
import { notify, resolveRecipients } from "./index";

/**
 * The daily job's cohort alerts, routed by responsibility: the cohort team,
 * plus the leader responsible for the cohort (promotion → church → nearest
 * staffed level). The responsible leader's link goes to their own level's
 * page — they don't open the cohort; they ask its team.
 */

function weekBucket(todayISO: string): number {
  const [y, m, d] = todayISO.split("-").map(Number);
  return Math.floor(Math.floor(Date.UTC(y, m - 1, d) / 86400000) / 7);
}

async function levelSlug(unitId: string | undefined): Promise<string | null> {
  if (!unitId) return null;
  return (await getAllUnits()).find((u) => u.id === unitId)?.slug ?? null;
}

/** Struggling students never contacted: one summary per cohort, again
 * weekly while it stays unresolved (dedupe per week). */
export async function sendAttentionEscalation(input: {
  cohortId: string;
  cohortSlug: string;
  cohortName: string;
  neverContactedCount: number;
  todayISO: string;
}): Promise<number> {
  if (input.neverContactedCount <= 0) return 0;
  const recipients = await resolveRecipients({ type: "cohort_attention", cohortId: input.cohortId });
  const slugs = new Map<string, string | null>();
  for (const r of recipients) if (r.unitId && !slugs.has(r.unitId)) slugs.set(r.unitId, await levelSlug(r.unitId));
  const n = input.neverContactedCount;
  const title = `${n} student${n === 1 ? "" : "s"} in ${input.cohortName.trim()} still need a first follow-up`;
  return notify(
    { type: "cohort_attention", cohortId: input.cohortId },
    (audience, r) => {
      const slug = r.unitId ? slugs.get(r.unitId) : null;
      return {
        kind: "attention_escalation",
        title,
        body: audience === "team" ? "Flagged for attendance, never contacted." : "Its team hasn't contacted them yet — you're responsible for this cohort's staffing.",
        href: audience === "team" ? `/c/${input.cohortSlug}/followup` : slug ? `/u/${slug}/attention?kind=contact` : undefined,
        dedupeKey: `escalate:${input.cohortId}:${weekBucket(input.todayISO)}`,
      };
    },
    { recipients }
  );
}

/** A crusade weekend within the next 7 days: once per weekend. */
export async function sendCrusadeReminders(input: {
  cohortId: string;
  cohortSlug: string;
  cohortName: string;
  crusadeEvents: { afterClass: number; date: string }[];
  todayISO: string;
}): Promise<number> {
  const fridayByClass = new Map<number, string>();
  for (const ev of input.crusadeEvents) {
    const current = fridayByClass.get(ev.afterClass);
    if (!current || ev.date < current) fridayByClass.set(ev.afterClass, ev.date);
  }
  const due = [...fridayByClass].filter(([, friday]) => {
    const d = daysBetween(input.todayISO, friday);
    return d >= 0 && d <= 7;
  });
  if (!due.length) return 0;
  const recipients = await resolveRecipients({ type: "cohort_attention", cohortId: input.cohortId });
  let sent = 0;
  for (const [afterClass, friday] of due) {
    const days = daysBetween(input.todayISO, friday);
    sent += await notify(
      { type: "cohort_attention", cohortId: input.cohortId },
      (audience) => ({
        kind: "crusade_upcoming",
        title: audience === "team" ? `Crusade weekend after Class ${afterClass} is coming up` : `${input.cohortName.trim()}: crusade weekend after Class ${afterClass}`,
        body: days === 0 ? "Starts today" : days === 1 ? "Starts tomorrow" : `In ${days} days`,
        href: audience === "team" ? `/c/${input.cohortSlug}/activities` : undefined,
        dedupeKey: `crusade:${input.cohortId}:${afterClass}`,
        data: { kind: "crusade_upcoming", cohortId: input.cohortId, afterClass, date: friday },
      }),
      { recipients }
    );
  }
  return sent;
}

/**
 * Birthdays: one digest per cohort for the day, to its facilitators only
 * (pastoral route), and only when someone has a birthday today. The key
 * (cohort + date) makes a re-run of the daily job a no-op. This is the only
 * source of birthday notifications.
 */
export async function sendBirthdayDigest(input: {
  cohortId: string;
  cohortSlug: string;
  cohortName: string;
  students: BirthdaySource[];
  todayISO: string;
}): Promise<number> {
  const count = birthdaysToday(input.students, input.todayISO);
  if (!count) return 0;
  const notice = birthdayDigestNotice({ cohortId: input.cohortId, cohortName: input.cohortName, cohortSlug: input.cohortSlug, count, todayISO: input.todayISO });
  return notify({ type: "cohort_pastoral", cohortId: input.cohortId }, () => notice);
}
