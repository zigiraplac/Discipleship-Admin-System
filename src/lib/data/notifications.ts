import type { DB } from "./types";
import type { Json } from "@/lib/supabase/database.types";
import type { Student } from "@/lib/domain/types";
import { upcomingBirthdays, type BirthdaySource } from "@/lib/domain/birthdays";
import { whatsappHref, birthdayGreetingMessage } from "@/lib/domain/whatsapp";
import { daysBetween } from "@/lib/utils";

/** Structured payload for a `birthday` notification — lets the bell
 * recompute a live "in N days" countdown at render time instead of trusting
 * a `body` string frozen at creation. */
export interface BirthdayNotificationData {
  kind: "birthday";
  studentId: string;
  dobDay: number;
  dobMonth: number;
}

/** Same idea for a `crusade_upcoming` notification. */
export interface CrusadeUpcomingNotificationData {
  kind: "crusade_upcoming";
  cohortId: string;
  afterClass: number;
  date: string; // the weekend's Friday, ISO date
}

export type NotificationData = BirthdayNotificationData | CrusadeUpcomingNotificationData;

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
  /** Structured fields for a kind whose display needs live recomputation
   * (see NotificationData) — stored alongside `body` so `body` can stay a
   * reasonable fallback for anywhere that doesn't bother recomputing it. */
  data?: NotificationData;
}

export async function createNotification(db: DB, input: NotificationInput): Promise<void> {
  const { error } = await db.from("notification").insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    dedupe_key: input.dedupeKey ?? null,
    data: (input.data as unknown as Json) ?? null,
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
  data: NotificationData | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(db: DB, userId: string, limit = 20): Promise<NotificationView[]> {
  const { data, error } = await db
    .from("notification")
    .select("id, kind, title, body, href, data, read_at, created_at")
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
    data: (r.data as unknown as NotificationData | null) ?? null,
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
      href: `/c/${input.cohortSlug}/followup`,
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
        // Fallback text only — the bell recomputes a live countdown from
        // `data` instead of trusting this once it's more than a moment old.
        body: daysUntil === 0 ? "Starts today" : daysUntil === 1 ? "Starts tomorrow" : `In ${daysUntil} days`,
        href: `/c/${input.cohortSlug}/crusades`,
        dedupeKey: `crusade:${input.cohortId}:${afterClass}`,
        data: { kind: "crusade_upcoming", cohortId: input.cohortId, afterClass, date: friday },
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
      title: `${b.name}'s birthday`,
      // Fallback text only — this is what freezes stale ("In 5 days" still
      // showing days later); the bell recomputes a live countdown from
      // `data` instead of trusting this once it's more than a moment old.
      body: b.daysUntil === 0 ? "Today" : b.daysUntil === 1 ? "Tomorrow" : `In ${b.daysUntil} days`,
      dedupeKey: `birthday:${b.studentId}:${year}`,
      data: { kind: "birthday", studentId: b.studentId, dobDay: b.day, dobMonth: b.month },
    }))
  );
}

/**
 * The day-of reminder — distinct from `ensureBirthdayNotifications`'
 * "coming up in the next week" heads-up: this fires exactly once, on the
 * birthday itself, straight to that cohort's own facilitators (not
 * whoever happens to be viewing), with a message already written and,
 * when the student has a WhatsApp number on file, a link that opens
 * straight into a pre-filled chat with them — wishing them well is one
 * tap away instead of a blank chat to write from scratch.
 *
 * This can't reach a facilitator outside the app on its own — there's no
 * WhatsApp Business API (or any outbound messaging) integration here, so
 * "automatic" means "the moment they next open the app, it's waiting for
 * them," not a push straight to their phone. `app_user.whatsapp`
 * (0023_app_user_whatsapp.sql) exists for the day this becomes real
 * outbound sending, and already makes the reminder itself easy to act on.
 */
export async function ensureBirthdayFacilitatorReminders(
  db: DB,
  input: {
    cohortId: string;
    cohortSlug: string;
    students: Student[];
    /** cohort_member rows with capacity 'facilitator' for this cohort —
     * deliberately not the broader "every cohort member" list the other
     * ensure* functions use; this is addressed to the facilitator only. */
    facilitatorIds: string[];
    todayISO: string;
  }
): Promise<void> {
  if (!input.facilitatorIds.length) return;
  const today = upcomingBirthdays(input.students, input.todayISO, input.students.length).filter(
    (b) => b.daysUntil === 0
  );
  if (!today.length) return;

  const year = input.todayISO.slice(0, 4);
  const byId = new Map(input.students.map((s) => [s.id, s]));

  for (const b of today) {
    const student = byId.get(b.studentId);
    const waHref = student?.whatsapp ? whatsappHref(student.whatsapp, student.country, birthdayGreetingMessage(b.name)) : null;
    await createNotifications(
      db,
      input.facilitatorIds.map((userId) => ({
        userId,
        kind: "birthday_today",
        title: `🎂 ${b.name}'s birthday is today!`,
        body: waHref
          ? "Tap to open WhatsApp with a birthday message ready to send."
          : "No WhatsApp number on file for them yet — give them a shout-out today.",
        href: waHref ?? `/c/${input.cohortSlug}/students/${b.studentId}`,
        dedupeKey: `birthday-today:${b.studentId}:${year}`,
      }))
    );
  }
}
