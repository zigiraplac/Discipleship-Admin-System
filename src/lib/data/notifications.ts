import type { DB } from "./types";
import { upcomingBirthdays, type BirthdaySource } from "@/lib/domain/birthdays";
import { daysBetween } from "@/lib/utils";

/**
 * Plain data-layer functions, not server actions — deliberately not
 * exported from a "use server" file. `createNotification` writes on
 * another user's behalf (e.g. notifying a cohort's other facilitators),
 * which must only ever happen from inside an action that has already
 * checked the caller's permission to do that; a "use server" export would
 * let any signed-in client call it directly with an arbitrary `userId`.
 */
export interface NotificationInput {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  /** Set only for notifications that can legitimately recur (a birthday) —
   * (user_id, dedupeKey) is unique, so re-creating one is a harmless no-op. */
  dedupeKey?: string;
}

export async function createNotification(db: DB, input: NotificationInput): Promise<void> {
  const { error } = await db.from("notification").insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    dedupe_key: input.dedupeKey ?? null,
  });
  // 23505 = unique_violation — an expected, harmless hit of the dedupe key.
  if (error && error.code !== "23505") throw error;
}

export async function createNotifications(db: DB, inputs: NotificationInput[]): Promise<void> {
  for (const input of inputs) await createNotification(db, input);
}

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(db: DB, userId: string, limit = 20): Promise<NotificationView[]> {
  const { data, error } = await db
    .from("notification")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    href: r.href,
    read: r.read_at != null,
    createdAt: r.created_at,
  }));
}

/** A stable 7-day bucket (not a calendar week) — just needs to change
 * once a week so a dedupe key built from it fires again the next week if
 * the situation is still unresolved, without needing real ISO week math. */
function weekBucket(todayISO: string): number {
  const [y, m, d] = todayISO.split("-").map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return Math.floor(days / 7);
}

/**
 * A student who's flagged (attendance below the band) and has *never* had
 * an outcome recorded is the case most likely to fall through the cracks
 * silently — nobody's actively working it, and nothing currently surfaces
 * that beyond the Attention page itself. One summary notification per
 * cohort (not one per student, to avoid a flood) goes to that cohort's own
 * facilitators/teachers plus every admin/leadership user, re-firing at
 * most once a week for as long as it stays unresolved.
 */
export async function ensureAttentionEscalation(
  db: DB,
  input: {
    /** The cohort's real id, not its slug — used only for the dedupe key,
     * which should stay stable even in the (currently impossible, but
     * cheap to guard against) event a slug ever changed. */
    cohortId: string;
    cohortSlug: string;
    cohortName: string;
    neverContactedCount: number;
    recipientIds: string[];
    todayISO: string;
  }
): Promise<void> {
  if (input.neverContactedCount <= 0 || !input.recipientIds.length) return;
  const bucket = weekBucket(input.todayISO);
  await createNotifications(
    db,
    input.recipientIds.map((userId) => ({
      userId,
      kind: "attention_escalation",
      title: `${input.neverContactedCount} student${input.neverContactedCount === 1 ? "" : "s"} in ${input.cohortName} still need a first follow-up`,
      body: "Flagged for attendance, never contacted.",
      href: `/c/${input.cohortSlug}/attention`,
      dedupeKey: `escalate:${input.cohortId}:${bucket}`,
    }))
  );
}

/**
 * A crusade weekend (3 day-events sharing the same after_class) has no
 * natural "the plan changed, tell people" moment the way postponing a
 * lesson does — this instead reminds everyone once the weekend is within
 * the next 7 days, so it can actually be communicated ahead of time
 * rather than showing up unannounced. One notification per weekend to
 * every recipient, same batched shape as ensureAttentionEscalation. The
 * dedupe key has no year in it (unlike birthdays) — a given cohort only
 * ever has this weekend once, so it only ever needs to fire once.
 */
export async function ensureCrusadeReminders(
  db: DB,
  input: {
    /** The cohort's real id, not its slug — used only for the dedupe key. */
    cohortId: string;
    cohortSlug: string;
    crusadeEvents: { afterClass: number; date: string }[];
    recipientIds: string[];
    todayISO: string;
  }
): Promise<void> {
  if (!input.recipientIds.length || !input.crusadeEvents.length) return;

  const fridayByClass = new Map<number, string>();
  for (const ev of input.crusadeEvents) {
    const current = fridayByClass.get(ev.afterClass);
    if (!current || ev.date < current) fridayByClass.set(ev.afterClass, ev.date);
  }

  for (const [afterClass, friday] of fridayByClass) {
    const daysUntil = daysBetween(input.todayISO, friday);
    if (daysUntil < 0 || daysUntil > 7) continue;
    await createNotifications(
      db,
      input.recipientIds.map((userId) => ({
        userId,
        kind: "crusade_upcoming",
        title: `Crusade weekend after Class ${afterClass} is coming up`,
        body: daysUntil === 0 ? "Starts today" : daysUntil === 1 ? "Starts tomorrow" : `In ${daysUntil} days`,
        href: `/c/${input.cohortSlug}/reports`,
        dedupeKey: `crusade:${input.cohortId}:${afterClass}`,
      }))
    );
  }
}

/**
 * A birthday isn't a discrete event, so there's no natural moment to
 * insert its notification — instead, every time a page load happens to
 * have the relevant students' data in hand, this ensures a row exists for
 * anyone whose birthday falls in the next 7 days. The unique dedupe key
 * (student + this year) means calling this on every such page load is
 * always safe and never posts the same birthday twice.
 */
export async function ensureBirthdayNotifications(
  db: DB,
  userId: string,
  students: BirthdaySource[],
  todayISO: string
): Promise<void> {
  const soon = upcomingBirthdays(students, todayISO, students.length).filter((b) => b.daysUntil <= 7);
  if (!soon.length) return;
  const year = todayISO.slice(0, 4);
  await createNotifications(
    db,
    soon.map((b) => ({
      userId,
      kind: "birthday",
      title: `${b.name}'s birthday ${b.daysUntil === 0 ? "is today" : "is coming up"}`,
      body: b.daysUntil === 0 ? "Today" : b.daysUntil === 1 ? "Tomorrow" : `In ${b.daysUntil} days`,
      dedupeKey: `birthday:${b.studentId}:${year}`,
    }))
  );
}
