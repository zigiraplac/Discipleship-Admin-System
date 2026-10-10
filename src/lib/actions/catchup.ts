"use server";

import { cohortTarget, requireCapability } from "@/lib/authz";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCohort } from "@/lib/data/cohorts";
import type { Json } from "@/lib/supabase/database.types";

export interface ToggleLessonCatchupInput {
  studentId: string;
  cohortId: string;
  eventId: string;
  caughtUp: boolean;
}

/**
 * Records (or undoes) that one specific missed lesson was made up outside
 * the original class session.
 *
 * The register is never touched: it keeps what happened on the day
 * ("absent"), and `lesson_catchup` is the separate record of the recovery.
 * Attendance counts the original absence; a student's effective rate and
 * status count the recovery too (aggregateCohort). The database refuses a
 * catch-up for a lesson without a register or where the student was
 * present, and refuses a register edit that would mark a caught-up
 * student present (0034_catchup_keeps_original_absence.sql).
 */
export async function toggleLessonCatchup(input: ToggleLessonCatchupInput): Promise<void> {
  const user = await requireCapability("manage_followups", await cohortTarget(input.cohortId));
  const supabase = await createClient();

  const { data: eventRow, error: eventErr } = await supabase
    .from("event")
    .select("cohort_id, register(attendance, recorded_at)")
    .eq("id", input.eventId)
    .single();
  if (eventErr) throw new Error("Couldn't load this lesson. Please try again.");
  if (eventRow.cohort_id !== input.cohortId) {
    throw new Error("This lesson does not belong to that cohort.");
  }

  // RLS on `lesson_catchup`/`register` only verifies pastoral access to
  // `input.cohortId` — it never confirms `input.studentId` actually
  // belongs to that cohort's own roster. Without this, a caller with
  // access to two cohorts could pass a foreign student's id alongside
  // their own cohort's eventId and write a stray attendance mark for a
  // student who was never enrolled there (mirrors the same check in
  // recordOutcome, outcomes.ts).
  const { data: student, error: studentErr } = await supabase
    .from("student")
    .select("cohort_id")
    .eq("id", input.studentId)
    .maybeSingle();
  if (studentErr) throw new Error("Couldn't verify this student. Please try again.");
  if (!student || student.cohort_id !== input.cohortId) {
    throw new Error("This student does not belong to that cohort.");
  }

  const register = Array.isArray(eventRow.register) ? eventRow.register[0] : eventRow.register;
  if (!register?.recorded_at) {
    throw new Error("This lesson hasn't had a register recorded yet.");
  }
  const attendance = (register.attendance as Record<string, string> | null) ?? {};

  if (input.caughtUp) {
    if (attendance[input.studentId] === "present") {
      throw new Error("This student wasn't marked absent for this lesson.");
    }
    const { error } = await supabase
      .from("lesson_catchup")
      .upsert({ student_id: input.studentId, event_id: input.eventId, recorded_by: user.id });
    if (error) throw new Error("Couldn't save this catch-up. Please try again.");
  } else {
    const { data: existing, error: existingErr } = await supabase
      .from("lesson_catchup")
      .select("student_id")
      .eq("student_id", input.studentId)
      .eq("event_id", input.eventId)
      .maybeSingle();
    if (existingErr) throw new Error("Couldn't load this catch-up. Please try again.");
    if (!existing) {
      throw new Error("This lesson wasn't marked as a catch-up.");
    }
    const { error } = await supabase
      .from("lesson_catchup")
      .delete()
      .eq("student_id", input.studentId)
      .eq("event_id", input.eventId);
    if (error) throw new Error("Couldn't undo this catch-up. Please try again.");
  }

  // audit_log is admin-write-only by RLS — go through the admin client so
  // a facilitator's toggle doesn't throw here even though the mark above
  // already succeeded.
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    entity: "register",
    entity_id: input.eventId,
    action: input.caughtUp ? "catchup_mark" : "catchup_unmark",
    after: { student_id: input.studentId } as unknown as Json,
  });

  // revalidatePath needs the actual url the app now serves (the slug),
  // not the id this action itself operates on — otherwise it'd silently
  // invalidate a path nobody's browser is on.
  const cohort = await getCohort(supabase, input.cohortId);
  const base = `/c/${cohort?.slug ?? input.cohortId}`;
  revalidatePath(base);
  revalidatePath(`${base}/lessons`);
  revalidatePath(`${base}/lessons/${input.eventId}`);
  revalidatePath(`${base}/calendar`);
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/students/${input.studentId}`);
  revalidatePath(`${base}/catchup`);
  revalidatePath(`${base}/reports`);
}
