"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { createNotifications } from "@/lib/data/notifications";
import type { Bands } from "@/lib/domain/types";
import type { Json } from "@/lib/supabase/database.types";

/** Changing a band re-labels students instantly; it never alters a saved
 * register (02-domain-model.md). */
export async function updateBands(bands: Bands): Promise<void> {
  const user = await requireRole("admin");
  const supabase = await createClient();

  const { error } = await supabase.from("org_setting").upsert([
    { key: "band_active_threshold", value: bands.activeThreshold },
    { key: "band_help_threshold", value: bands.helpThreshold },
  ]);
  if (error) throw new Error("Couldn't save the new thresholds. Please try again.");

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    entity: "org_setting",
    entity_id: "bands",
    action: "update",
    after: bands as unknown as Json,
  });

  // Org-wide and easy to miss: this can instantly re-label who's "on
  // track" vs "at risk" on every cohort's dashboard with no other visible
  // trigger — worth telling everyone whose day-to-day view just moved,
  // not just leaving it to be noticed later.
  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from("app_user")
    .select("id")
    .in("role", ["facilitator", "teacher", "leadership"])
    .neq("id", user.id);
  const recipientIds = (recipients ?? []).map((r) => r.id);
  if (recipientIds.length) {
    await createNotifications(
      admin,
      recipientIds.map((userId) => ({
        userId,
        kind: "bands_updated",
        title: "Attendance status thresholds changed",
        body: `On track ≥ ${bands.activeThreshold}% · Needs help ≥ ${bands.helpThreshold}%. Student statuses may have shifted.`,
      }))
    );
  }

  revalidatePath("/", "layout");
}
