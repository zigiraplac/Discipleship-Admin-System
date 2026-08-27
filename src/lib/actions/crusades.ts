"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface SaveCrusadeReportInput {
  cohortId: string;
  afterClass: number;
  theme: string;
  preacher: string;
  notes: string;
  highlights: string;
}

/**
 * Upserts the report for one crusade weekend — recording it *is* how a
 * weekend gets marked as having happened, no separate boolean. Uses the
 * regular, RLS-respecting client: can_write_pastoral already confirms the
 * caller is an admin or a facilitator actually assigned to this cohort,
 * same as saveRegister.
 */
export async function saveCrusadeReport(input: SaveCrusadeReportInput): Promise<void> {
  const user = await requireRole("facilitator", "admin");
  const supabase = await createClient();

  const { error } = await supabase.from("crusade_report").upsert(
    {
      cohort_id: input.cohortId,
      after_class: input.afterClass,
      theme: input.theme.trim() || null,
      preacher: input.preacher.trim() || null,
      notes: input.notes.trim() || null,
      highlights: input.highlights.trim() || null,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    },
    { onConflict: "cohort_id,after_class" }
  );
  if (error) throw new Error("Couldn't save this report. Please try again.");

  const base = `/c/${input.cohortId}`;
  revalidatePath(`${base}/reports`);
  revalidatePath(`${base}/calendar`);
}

/** Clears a weekend's report — the "undo" for a report saved by mistake. */
export async function clearCrusadeReport(input: { cohortId: string; afterClass: number }): Promise<void> {
  await requireRole("facilitator", "admin");
  const supabase = await createClient();

  const { error } = await supabase
    .from("crusade_report")
    .delete()
    .eq("cohort_id", input.cohortId)
    .eq("after_class", input.afterClass);
  if (error) throw new Error("Couldn't clear this report. Please try again.");

  const base = `/c/${input.cohortId}`;
  revalidatePath(`${base}/reports`);
  revalidatePath(`${base}/calendar`);
}
