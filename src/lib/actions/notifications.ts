"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { listNotificationsPage, type NotificationView } from "@/lib/data/notifications";
import { describeNotifications } from "@/lib/notify/describe";
import type { NotificationFilter } from "@/lib/domain/notification-category";

/**
 * Every action here hardcodes `user_id: actor.id` in the query themselves —
 * never take an id from the caller — so a signed-in client can only ever
 * touch its own notifications, even though this goes through the
 * service-role client (bypassing RLS, which has no write policy for this
 * table at all — see 0005_notifications_and_profile.sql).
 */
export async function markNotificationRead(id: string): Promise<void> {
  const actor = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", actor.id)
    .is("read_at", null);
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const actor = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", actor.id)
    .is("read_at", null);
  if (error) throw error;
  revalidatePath("/", "layout");
}

/** Back to unread — only the read flag changes; nothing new is sent. */
export async function markNotificationUnread(id: string): Promise<void> {
  const actor = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("notification").update({ read_at: null }).eq("id", id).eq("user_id", actor.id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

/** The next page of the Notifications list (see listNotificationsPage). */
export async function loadNotificationsPage(input: {
  filter: NotificationFilter;
  q?: string;
  cursor?: { createdAt: string; id: string } | null;
}): Promise<{ items: NotificationView[]; next: { createdAt: string; id: string } | null }> {
  const actor = await requireUser();
  const filter: NotificationFilter = ["all", "unread", "action", "reminder", "updates"].includes(input.filter) ? input.filter : "all";
  const page = await listNotificationsPage(createAdminClient(), actor.id, { filter, q: input.q?.slice(0, 80), cursor: input.cursor ?? null });
  return { items: await describeNotifications(page.items, actor), next: page.next };
}
