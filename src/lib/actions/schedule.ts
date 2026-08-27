"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { curriculumScheduleItems, placeSchedule, dayAfter, type ScheduleItem } from "@/lib/domain/generator";
import { lessonAt } from "@/lib/domain/curriculum";
import { createNotifications } from "@/lib/data/notifications";
import { getCohort } from "@/lib/data/cohorts";

export interface PostponeLessonResult {
  shiftedCount: number;
}

function scheduleItemKey(item: ScheduleItem): string {
  return item.kind === "lesson" ? `L${item.globalIndex}` : `C${item.afterClass}-${item.crusadeDay}`;
}

interface EventRow {
  id: string;
  event_date: string;
  kind: "lesson" | "crusade";
  after_class: number | null;
  crusade_day: number | null;
  lesson: { global_index: number } | { global_index: number }[] | null;
  register: { recorded_at: string | null } | { recorded_at: string | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * "We didn't get to this lesson on its scheduled day" — pushes it, and
 * every not-yet-taught lesson/crusade after it in curriculum order,
 * forward by one teaching-day slot. Lessons stay strictly sequential, so
 * postponing is never a reorder — it's always "shift the remainder,"
 * which is exactly what `placeSchedule` does when re-walked from the day
 * after the postponed lesson's own (missed) date.
 *
 * Allowed for admin, or a facilitator who is actually assigned to this
 * cohort (checked here in code, the same way `createCohort` gates its
 * own admin-only write — no new RLS policy needed on `event`).
 */
export async function postponeLesson(input: {
  cohortId: string;
  eventId: string;
}): Promise<PostponeLessonResult> {
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

  const targetRow = Array.from(byPosition.entries()).find(([, r]) => r.id === input.eventId);
  if (!targetRow) throw new Error("Lesson not found in this cohort's schedule.");
  const [targetPosition, targetInfo] = targetRow;
  if (targetInfo.kind !== "lesson") throw new Error("Only a lesson can be postponed, not a crusade day.");
  if (targetInfo.recorded) throw new Error("This lesson is already recorded — nothing to postpone.");

  const pending: { position: number; item: ScheduleItem }[] = [];
  for (let pos = targetPosition; pos < items.length; pos++) {
    const row = byPosition.get(pos);
    if (row?.recorded) continue; // defensive: shouldn't happen given strict ordering
    pending.push({ position: pos, item: items[pos] });
  }

  const anchor = dayAfter(targetInfo.date);
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

  // One atomic call (0009_atomic_writes.sql) instead of a sequential loop
  // of individually-awaited updates — a failure partway through used to
  // be able to leave some lessons shifted and others not, with no
  // rollback.
  if (updates.length) {
    const { error } = await admin.rpc("apply_event_date_updates", { p_updates: updates });
    if (error) throw error;
  }

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "event",
    entity_id: input.eventId,
    action: "postpone",
    before: { date: targetInfo.date },
    after: { anchor, shiftedCount: updates.length },
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
    const targetItem = items[targetPosition];
    const lessonRef = targetItem.kind === "lesson" ? lessonAt(targetItem.globalIndex).ref : "A lesson";
    await createNotifications(
      admin,
      [...recipientIds].map((userId) => ({
        userId,
        kind: "lesson_postponed",
        title: `${lessonRef} was postponed`,
        body:
          updates.length > 1
            ? `${updates.length} lessons and crusade days shifted forward.`
            : "It was shifted to the next study day.",
        href: `/c/${cohortSlug}/lessons`,
      }))
    );
  }

  const base = `/c/${cohortSlug}`;
  revalidatePath(base);
  revalidatePath(`${base}/lessons`);
  revalidatePath(`${base}/calendar`);
  revalidatePath(`${base}/reports`);

  return { shiftedCount: updates.length };
}
