"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

/**
 * Both actions hardcode `user_id: actor.id` in the query themselves —
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
