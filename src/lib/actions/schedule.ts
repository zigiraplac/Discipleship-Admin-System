"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { AppUser } from "@/lib/domain/types";
import { curriculumScheduleItems, placeSchedule, dayAfter, type ScheduleItem } from "@/lib/domain/generator";
import { scheduleItemKey, one, type EventRow } from "@/lib/domain/schedule-position";
import { lessonAt } from "@/lib/domain/curriculum";
import { createNotifications } from "@/lib/data/notifications";
import { getCohort } from "@/lib/data/cohorts";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Admin, or a facilitator who's actually a member of this cohort — the
 * same gate `postponeLesson` and `changeCohortSchedule` both need, checked
 * in application code since `event`/`cohort_schedule_period` are
 * admin-write-only by RLS (see 0003_pacing.sql, 0023_cohort_schedule_periods.sql). */
async function requireScheduleAccess(cohortId: string): Promise<AppUser> {
  const actor = await requireRole("facilitator", "admin");
  if (actor.role !== "admin") {
    const supabase = await createClient();
    const { data: membership } = await supabase
      .from("cohort_member")
      .select("cohort_id")
      .eq("cohort_id", cohortId)
      .eq("user_id", actor.id)
      .eq("capacity", "facilitator")
      .maybeSingle();
    if (!membership) throw new Error("You don't have access to this cohort.");
  }
  return actor;
}

interface EventInfo {
  id: string;
  date: string;
  kind: "lesson" | "crusade";
  recorded: boolean;
}

/**
 * Fetches this cohort's whole schedule, maps it onto curriculum positions,
 * validates `eventId` is a not-yet-recorded lesson, then re-walks it and
 * everything after it through `placeSchedule` with whatever cadence the
 * caller gives it — anchored the day after the target lesson's own
 * (currently scheduled) date. `postponeLesson` passes the cohort's
 * existing cadence (so it's a pure "push forward" shift); a cadence
 * change (`changeCohortSchedule`) passes a new one — the reflow mechanics
 * are identical either way, only the cadence differs.
 */
async function reflowFrom(
  admin: AdminClient,
  cohortId: string,
  eventId: string,
  teachingDays: number[],
  lessonsPerSession: number,
  intervalWeeks: number
): Promise<{
  targetPosition: number;
  targetInfo: EventInfo;
  items: ScheduleItem[];
  anchor: string;
  updates: { id: string; event_date: string }[];
}> {
  const { data: rows, error: rowsErr } = await admin
    .from("event")
    .select("id, event_date, kind, after_class, crusade_day, lesson:lesson_id(global_index), register(recorded_at)")
    .eq("cohort_id", cohortId);
  if (rowsErr) throw rowsErr;

  const items = curriculumScheduleItems();
  const positionByKey = new Map(items.map((item, idx) => [scheduleItemKey(item), idx]));

  const byPosition = new Map<number, EventInfo>();
  for (const raw of (rows ?? []) as unknown as EventRow[]) {
    const lesson = one(raw.lesson);
    const key = raw.kind === "lesson" && lesson ? `L${lesson.global_index}` : `C${raw.after_class}-${raw.crusade_day}`;
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

  const targetRow = Array.from(byPosition.entries()).find(([, r]) => r.id === eventId);
  if (!targetRow) throw new Error("Lesson not found in this cohort's schedule.");
  const [targetPosition, targetInfo] = targetRow;
  if (targetInfo.kind !== "lesson") throw new Error("Only a lesson can be the starting point, not a crusade day.");
  if (targetInfo.recorded) throw new Error("This lesson is already recorded — pick one that hasn't happened yet.");

  const pending: { position: number; item: ScheduleItem }[] = [];
  for (let pos = targetPosition; pos < items.length; pos++) {
    const row = byPosition.get(pos);
    if (row?.recorded) continue; // defensive: shouldn't happen given strict ordering
    pending.push({ position: pos, item: items[pos] });
  }

  const anchor = dayAfter(targetInfo.date);
  const replaced = placeSchedule(pending.map((p) => p.item), anchor, teachingDays, lessonsPerSession, intervalWeeks);

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

  return { targetPosition, targetInfo, items, anchor, updates };
}

export interface PostponeLessonResult {
  shiftedCount: number;
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
  /** Shown on Reports' "What changed" timeline alongside every major
   * schedule change — optional, but a postponement with no reason on
   * record just falls back to a plain computed description there. */
  reason?: string;
}): Promise<PostponeLessonResult> {
  const actor = await requireScheduleAccess(input.cohortId);
  const admin = createAdminClient();

  const { data: cohort, error: cohortErr } = await admin
    .from("cohort")
    .select("teaching_days, lessons_per_session, interval_weeks")
    .eq("id", input.cohortId)
    .single();
  if (cohortErr) throw cohortErr;

  const { targetPosition, targetInfo, items, anchor, updates } = await reflowFrom(
    admin,
    input.cohortId,
    input.eventId,
    cohort.teaching_days,
    cohort.lessons_per_session,
    cohort.interval_weeks
  );

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "event",
    entity_id: input.eventId,
    cohort_id: input.cohortId,
    action: "postpone",
    before: { date: targetInfo.date },
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

export interface ChangeCohortScheduleResult {
  shiftedCount: number;
}

/**
 * Leadership deciding to study weekly vs. every two weeks (or change which
 * days, or lessons per session) partway through a cohort — unlike
 * `postponeLesson`, this doesn't just push dates around under the same
 * cadence, it records a new one (`cohort_schedule_period`) effective from
 * `fromEventId` onward, so `computePace` judges everything before this
 * point by the old cadence and everything after by the new one, instead of
 * either rewriting history or leaving the pace target stuck on a cadence
 * nobody's following anymore.
 */
export async function changeCohortSchedule(input: {
  cohortId: string;
  /** The first not-yet-recorded lesson the new cadence applies from —
   * same targeting as `postponeLesson`. */
  fromEventId: string;
  teachingDays: number[];
  lessonsPerSession: number;
  intervalWeeks: number;
  reason?: string;
}): Promise<ChangeCohortScheduleResult> {
  if (input.teachingDays.length === 0) throw new Error("Pick at least one teaching day.");
  const actor = await requireScheduleAccess(input.cohortId);
  const admin = createAdminClient();

  const { targetPosition, targetInfo, updates, anchor } = await reflowFrom(
    admin,
    input.cohortId,
    input.fromEventId,
    input.teachingDays,
    input.lessonsPerSession,
    input.intervalWeeks
  );

  const { error: periodErr } = await admin.from("cohort_schedule_period").insert({
    cohort_id: input.cohortId,
    starts_at_position: targetPosition,
    teaching_days: input.teachingDays,
    lessons_per_session: input.lessonsPerSession,
    interval_weeks: input.intervalWeeks,
    effective_date: anchor,
    reason: input.reason?.trim() || null,
    actor_id: actor.id,
  });
  if (periodErr) throw periodErr;

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    entity: "cohort",
    entity_id: input.cohortId,
    cohort_id: input.cohortId,
    action: "schedule_change",
    before: { date: targetInfo.date },
    after: {
      anchor,
      shiftedCount: updates.length,
      teachingDays: input.teachingDays,
      lessonsPerSession: input.lessonsPerSession,
      intervalWeeks: input.intervalWeeks,
      reason: input.reason?.trim() || null,
    },
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
        kind: "lesson_postponed",
        title: "This cohort's schedule changed",
        body:
          updates.length > 0
            ? `${updates.length} upcoming lessons and crusade days were rescheduled.`
            : "The teaching cadence changed going forward.",
        href: `/settings`,
      }))
    );
  }

  const base = `/c/${cohortSlug}`;
  revalidatePath(base);
  revalidatePath(`${base}/lessons`);
  revalidatePath(`${base}/calendar`);
  revalidatePath(`${base}/reports`);
  revalidatePath("/settings");

  return { shiftedCount: updates.length };
}
