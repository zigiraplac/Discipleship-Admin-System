"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";

export interface ToggleLessonCatchupInput {
  studentId: string;
  cohortId: string;
  eventId: string;
  caughtUp: boolean;
}

/**
 * Marks (or unmarks) one specific missed lesson as made up outside the
 * original class session. This is the same correction path `saveRegister`
 * uses (register.ts) — the actual attendance record is flipped to present,
 * so every page that reads attendance sees it automatically, with no
 * parallel bookkeeping to keep in sync. `lesson_catchup` stays alongside
 * purely as a note that *this particular* present mark came from a
 * catch-up rather than being there on the day — used only so the
 * attendance grid can still color it differently.
 *
 * The actual attendance write goes through `set_attendance_mark`
 * (0009_atomic_writes.sql), a single atomic UPDATE, rather than reading
 * the whole attendance blob, editing it in JS, and writing it all back —
 * two students on the same lesson toggled close together used to be able
 * to race and silently revert each other.
 */
export async function toggleLessonCatchup(input: ToggleLessonCatchupInput): Promise<void> {
  const user = await requireRole("facilitator", "admin");
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

  const { error: markErr } = await supabase.rpc("set_attendance_mark", {
    p_event_id: input.eventId,
    p_student_id: input.studentId,
    p_present: input.caughtUp,
    p_actor: user.id,
  });
  if (markErr) throw new Error("Couldn't update attendance for this lesson. Please try again.");

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

  const base = `/c/${input.cohortId}`;
  revalidatePath(base);
  revalidatePath(`${base}/lessons`);
  revalidatePath(`${base}/lessons/${input.eventId}`);
  revalidatePath(`${base}/calendar`);
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/students/${input.studentId}`);
  revalidatePath(`${base}/attention`);
  revalidatePath(`${base}/reports`);
}
