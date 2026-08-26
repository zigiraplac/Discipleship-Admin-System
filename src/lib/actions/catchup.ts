"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { Database, Json } from "@/lib/supabase/database.types";

type RegisterUpdate = Database["public"]["Tables"]["register"]["Update"];

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
 */
export async function toggleLessonCatchup(input: ToggleLessonCatchupInput): Promise<void> {
  const user = await requireRole("facilitator", "admin");
  const supabase = await createClient();

  const { data: eventRow, error: eventErr } = await supabase
    .from("event")
    .select("cohort_id, register(attendance, recorded_at)")
    .eq("id", input.eventId)
    .single();
  if (eventErr) throw eventErr;
  if (eventRow.cohort_id !== input.cohortId) {
    throw new Error("This lesson does not belong to that cohort.");
  }

  const register = Array.isArray(eventRow.register) ? eventRow.register[0] : eventRow.register;
  if (!register?.recorded_at) {
    throw new Error("This lesson hasn't had a register recorded yet.");
  }
  const attendance = { ...((register.attendance as Record<string, string> | null) ?? {}) };

  if (input.caughtUp) {
    if (attendance[input.studentId] === "present") {
      throw new Error("This student wasn't marked absent for this lesson.");
    }
    const { error } = await supabase
      .from("lesson_catchup")
      .upsert({ student_id: input.studentId, event_id: input.eventId, recorded_by: user.id });
    if (error) throw error;
    attendance[input.studentId] = "present";
  } else {
    const { data: existing, error: existingErr } = await supabase
      .from("lesson_catchup")
      .select("student_id")
      .eq("student_id", input.studentId)
      .eq("event_id", input.eventId)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (!existing) {
      throw new Error("This lesson wasn't marked as a catch-up.");
    }
    const { error } = await supabase
      .from("lesson_catchup")
      .delete()
      .eq("student_id", input.studentId)
      .eq("event_id", input.eventId);
    if (error) throw error;
    attendance[input.studentId] = "absent";
  }

  const now = new Date().toISOString();
  const patch: RegisterUpdate = {
    attendance: attendance as unknown as Json,
    updated_by: user.id,
    updated_at: now,
  };
  const { error: updateErr } = await supabase.from("register").update(patch).eq("event_id", input.eventId);
  if (updateErr) throw updateErr;

  await supabase.from("audit_log").insert({
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
