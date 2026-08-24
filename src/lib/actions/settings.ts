"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
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
  if (error) throw error;

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    entity: "org_setting",
    entity_id: "bands",
    action: "update",
    after: bands as unknown as Json,
  });

  revalidatePath("/", "layout");
}
