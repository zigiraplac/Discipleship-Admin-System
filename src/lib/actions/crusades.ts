"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface SetCrusadeCompletionInput {
  cohortId: string;
  afterClass: number;
  completed: boolean;
}

/**
 * Marks (or unmarks) a crusade weekend as done. Uses the regular,
 * RLS-respecting client rather than the admin client — can_write_pastoral
 * already confirms the caller is an admin or a facilitator actually
 * assigned to this cohort, so there's no separate ownership check to
 * duplicate in application code here (same as saveRegister).
 */
export async function setCrusadeCompletion(input: SetCrusadeCompletionInput): Promise<void> {
  const user = await requireRole("facilitator", "admin");
  const supabase = await createClient();

  if (input.completed) {
    const { error } = await supabase.from("crusade_completion").upsert({
      cohort_id: input.cohortId,
      after_class: input.afterClass,
      completed_by: user.id,
    });
    if (error) throw new Error("Couldn't mark this crusade as done. Please try again.");
  } else {
    const { error } = await supabase
      .from("crusade_completion")
      .delete()
      .eq("cohort_id", input.cohortId)
      .eq("after_class", input.afterClass);
    if (error) throw new Error("Couldn't undo that. Please try again.");
  }

  const base = `/c/${input.cohortId}`;
  revalidatePath(`${base}/reports`);
  revalidatePath(`${base}/calendar`);
}
