"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { getCohort } from "@/lib/data/cohorts";
import { createNotifications } from "@/lib/data/notifications";
import {
  curriculumScheduleItems,
  placeSchedule,
  dayAfter,
  type ScheduleItem,
} from "@/lib/domain/generator";
import { scheduleItemKey, one, type EventRow } from "@/lib/domain/schedule-position";

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

  const cohort = await getCohort(supabase, input.cohortId);
  const base = `/c/${cohort?.slug ?? input.cohortId}`;
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

  const cohort = await getCohort(supabase, input.cohortId);
  const base = `/c/${cohort?.slug ?? input.cohortId}`;
  revalidatePath(`${base}/reports`);
  revalidatePath(`${base}/calendar`);
}

export interface PostponeCrusadeResult {
  shiftedCount: number;
}

/**
 * A crusade weekend has no register and no "recorded" flag the way a
 * lesson does — instead, an already-reported weekend (saveCrusadeReport)
 * is what "already happened" means, and postponing that is refused the
 * same way postponing an already-recorded lesson is. Otherwise this is
 * exactly `postponeLesson` (src/lib/actions/schedule.ts), applied to the
 * weekend's two day-events (crusade_day 0 and 1) as a block instead of one
 * lesson — the anchor is the day after the weekend's own Friday, so the
 * re-walk's "advance to the next Friday" naturally lands one week later,
 * cascading everything scheduled after it exactly like a lesson postponement.
 */
export async function postponeCrusadeWeekend(input: {
  cohortId: string;
  afterClass: number;
  reason?: string;
}): Promise<PostponeCrusadeResult> {
  const actor = await requireRole("facilitator", "admin");

  if (actor.role !== "admin") {
    const supabase = await createClient();
    const { data: membership } = await supabase
      .from("cohort_member")
      .select("cohort_id")
      .eq("cohort_id", input.cohortId)
      .eq("user_id", actor.id)
      .eq("capacity", "facilitator")
      .maybeSingle();
    if (!membership) throw new Error("You don't have access to this cohort.");
  }

  const admin = createAdminClient();

  const { data: existingReport } = await admin
    .from("crusade_report")
    .select("id")
    .eq("cohort_id", input.cohortId)
    .eq("after_class", input.afterClass)
    .maybeSingle();
  if (existingReport) {
    throw new Error("This weekend's report is already recorded — nothing to postpone.");
  }

  const { data: cohort, error: cohortErr } = await admin
    .from("cohort")
    .select("teaching_days, lessons_per_session")
    .eq("id", input.cohortId)
    .single();
  if (cohortErr) throw cohortErr;

  const { data: rows, error: rowsErr } = await admin
    .from("event")
    .select("id, event_date, kind, after_class, crusade_day, lesson:lesson_id(global_index), register(recorded_at)")
    .eq("cohort_id", input.cohortId);
  if (rowsErr) throw rowsErr;

  const items = curriculumScheduleItems();
  const positionByKey = new Map(items.map((item, idx) => [scheduleItemKey(item), idx]));

  const byPosition = new Map<
    number,
    { id: string; date: string; kind: "lesson" | "crusade"; recorded: boolean }
  >();
  for (const raw of (rows ?? []) as unknown as EventRow[]) {
    const lesson = one(raw.lesson);
    const key =
      raw.kind === "lesson" && lesson
        ? `L${lesson.global_index}`
        : `C${raw.after_class}-${raw.crusade_day}`;
    const position = positionByKey.get(key);
    if (position === undefined) continue;
    const register = one(raw.register);
    byPosition.set(position, {
      id: raw.id,
      date: raw.event_date,
      kind: raw.kind,
      recorded: raw.kind === "lesson" && register?.recorded_at != null,
    });
  }

  const fridayPosition = positionByKey.get(`C${input.afterClass}-0`);
  const fridayRow = fridayPosition != null ? byPosition.get(fridayPosition) : undefined;
  if (fridayPosition == null || !fridayRow) {
    throw new Error("This crusade weekend isn't in this cohort's schedule.");
  }

  const pending: { position: number; item: ScheduleItem }[] = [];
  for (let pos = fridayPosition; pos < items.length; pos++) {
    const row = byPosition.get(pos);
    if (row?.recorded) continue; // an already-recorded lesson later in the list stays put
    pending.push({ position: pos, item: items[pos] });
  }

  const anchor = dayAfter(fridayRow.date);
  const replaced = placeSchedule(
    pending.map((p) => p.item),
    anchor,
    cohort.teaching_days,
    cohort.lessons_per_session
  );

  const updates: { id: string; event_date: string }[] = [];
  for (let i = 0; i < replaced.length; i++) {
    const row = byPosition.get(pending[i].position);
    if (!row || row.date === replaced[i].date) continue;
    updates.push({ id: row.id, event_date: replaced[i].date });
  }

  if (updates.length) {
    const { error } = await admin.rpc("apply_event_date_updates", { p_updates: updates });
    if (error) throw error;
  }

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "event",
    entity_id: fridayRow.id,
    cohort_id: input.cohortId,
    action: "postpone",
    before: { date: fridayRow.date, crusadeAfterClass: input.afterClass },
    after: { anchor, shiftedCount: updates.length, reason: input.reason?.trim() || null },
  });

  const cohortForLinks = await getCohort(admin, input.cohortId);
  const cohortSlug = cohortForLinks?.slug ?? input.cohortId;

  const { data: members } = await admin
    .from("cohort_member")
    .select("user_id")
    .eq("cohort_id", input.cohortId)
    .neq("user_id", actor.id);
  const recipientIds = new Set((members ?? []).map((m) => m.user_id));
  if (recipientIds.size) {
    await createNotifications(
      admin,
      [...recipientIds].map((userId) => ({
        userId,
        kind: "crusade_postponed",
        title: `The crusade weekend after Class ${input.afterClass} was postponed`,
        body:
          updates.length > 1
            ? `${updates.length} lessons and crusade days shifted forward.`
            : "It was shifted to the following weekend.",
        href: `/c/${cohortSlug}/crusades`,
      }))
    );
  }

  const base = `/c/${cohortSlug}`;
  revalidatePath(base);
  revalidatePath(`${base}/crusades`);
  revalidatePath(`${base}/calendar`);
  revalidatePath(`${base}/reports`);

  return { shiftedCount: updates.length };
}
