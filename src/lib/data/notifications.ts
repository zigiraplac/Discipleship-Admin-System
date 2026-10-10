import type { DB } from "./types";
import type { Json } from "@/lib/supabase/database.types";
import { filterCategories, kindsIn, type NotificationCategory, type NotificationFilter } from "@/lib/domain/notification-category";

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

/** One cohort's birthdays today (the daily digest). */
export interface BirthdayDigestNotificationData {
  kind: "birthday_digest";
  cohortId: string;
  date: string;
  count: number;
}

export type NotificationData = BirthdayNotificationData | CrusadeUpcomingNotificationData | BirthdayDigestNotificationData;

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
  /** May this person open `href`? Set from their capabilities (authz) —
   * undefined means not checked (treated as openable). */
  canOpen?: boolean;
  /** Derived for display (see lib/notify/describe.ts). */
  category?: NotificationCategory;
  /** The cohort or level it concerns, e.g. "Cohort 01" or "Rwanda". */
  context?: string | null;
  /** What opening it does, e.g. "View follow-ups". */
  actionLabel?: string | null;
}

const SELECT = "id, kind, title, body, href, data, read_at, created_at";

type Row = { id: string; kind: string; title: string; body: string | null; href: string | null; data: unknown; read_at: string | null; created_at: string };
const toView = (r: Row): NotificationView => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  href: r.href,
  data: (r.data as NotificationData | null) ?? null,
  read: r.read_at != null,
  createdAt: r.created_at,
});

/** The latest few, for the bell. */
export async function listNotifications(db: DB, userId: string, limit = 20): Promise<NotificationView[]> {
  const { data, error } = await db.from("notification").select(SELECT).eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toView);
}

/** Unread totals across the whole history — the bell's badge. */
export async function notificationCounts(db: DB, userId: string): Promise<{ unread: number; unreadAction: number }> {
  const base = () => db.from("notification").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  const [all, action] = await Promise.all([base(), base().in("kind", kindsIn(["action"]))]);
  if (all.error) throw all.error;
  if (action.error) throw action.error;
  return { unread: all.count ?? 0, unreadAction: action.count ?? 0 };
}

/**
 * One page of a person's notification history, newest first: filtered,
 * searched, and continued from `cursor` (the last item already shown) so
 * filters and "Load more" work together without loading everything.
 * Always scoped to `userId` — never anyone else's.
 *
 * Search matches title and text, except for kinds whose older notices may
 * hold a student's name (individual birthdays, early outcome notices):
 * those are shown neutrally and never matched by search.
 */
export async function listNotificationsPage(
  db: DB,
  userId: string,
  opts: { filter: NotificationFilter; q?: string; cursor?: { createdAt: string; id: string } | null; limit?: number }
): Promise<{ items: NotificationView[]; next: { createdAt: string; id: string } | null }> {
  const limit = opts.limit ?? 30;
  let query = db.from("notification").select(SELECT).eq("user_id", userId);
  if (opts.filter === "unread") query = query.is("read_at", null);
  const cats = filterCategories(opts.filter);
  if (cats) query = query.in("kind", kindsIn(cats));
  const q = opts.q?.trim().replace(/[%,()*\\]/g, " ").trim();
  if (q) {
    query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`).not("kind", "in", `(${SEARCH_EXCLUDED.join(",")})`);
  }
  if (opts.cursor) {
    query = query.or(`created_at.lt.${opts.cursor.createdAt},and(created_at.eq.${opts.cursor.createdAt},id.lt.${opts.cursor.id})`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (error) throw error;
  const rows = ((data ?? []) as Row[]).map(toView);
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}

/** Kinds never matched by search (older notices may name a student). */
const SEARCH_EXCLUDED = ["birthday", "outcome_recorded"];
