"use server";

import { cohortTarget, requireCapability } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCohort } from "@/lib/data/cohorts";
import { ACTIVITIES_MIGRATION_APPLIED, ACTIVITY_STATUSES, normalizeActivityKind, type ActivityStatus } from "@/lib/domain/activities";

export interface SaveActivityInput {
  cohortId: string;
  /** Omitted to add a new activity. */
  id?: string;
  kind: string;
  date: string;
  theme: string;
  preacher: string;
  status: ActivityStatus;
  notes: string;
}

async function revalidateActivities(supabase: Awaited<ReturnType<typeof createClient>>, cohortId: string) {
  const cohort = await getCohort(supabase, cohortId);
  revalidatePath(`/c/${cohort?.slug ?? cohortId}/activities`);
}

/** Adds or updates one occasional activity. Same permission as recording a
 * crusade report: the cohort's facilitators and admin (RLS agrees). */
export async function saveActivity(input: SaveActivityInput): Promise<void> {
  if (!ACTIVITIES_MIGRATION_APPLIED) throw new Error("Activities aren't switched on yet.");
  const user = await requireCapability("record_crusade", await cohortTarget(input.cohortId));

  const kind = normalizeActivityKind(input.kind);
  if (!kind) throw new Error("Choose what kind of activity this is.");
  if (kind.length > 40) throw new Error("Keep the activity type under 40 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick the date of the activity.");
  if (!ACTIVITY_STATUSES.includes(input.status)) throw new Error("Choose a status.");

  const fields = {
    kind,
    activity_date: input.date,
    theme: input.theme.trim() || null,
    preacher: input.preacher.trim() || null,
    status: input.status,
    notes: input.notes.trim() || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from("activity").update(fields).eq("id", input.id).eq("cohort_id", input.cohortId)
    : await supabase.from("activity").insert({ ...fields, cohort_id: input.cohortId, created_by: user.id });
  if (error) throw new Error("Couldn't save this activity. Please try again.");

  await revalidateActivities(supabase, input.cohortId);
}

export async function deleteActivity(input: { cohortId: string; id: string }): Promise<void> {
  if (!ACTIVITIES_MIGRATION_APPLIED) throw new Error("Activities aren't switched on yet.");
  await requireCapability("record_crusade", await cohortTarget(input.cohortId));
  const supabase = await createClient();
  const { error } = await supabase.from("activity").delete().eq("id", input.id).eq("cohort_id", input.cohortId);
  if (error) throw new Error("Couldn't delete this activity. Please try again.");
  await revalidateActivities(supabase, input.cohortId);
}
