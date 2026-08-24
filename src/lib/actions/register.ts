"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { Database, Json } from "@/lib/supabase/database.types";

type RegisterUpdate = Database["public"]["Tables"]["register"]["Update"];

export interface SaveRegisterInput {
  cohortId: string;
  eventId: string;
  attendance: Record<string, "present" | "absent">;
}

/**
 * The one write path for attendance in the whole product (08-backend-notes.md).
 * A save on an already-recorded register is a *correction* — allowed for
 * the same facilitator/admin roles as the original save, logged to
 * audit_log either way so a correction is never silent.
 */
export async function saveRegister(input: SaveRegisterInput): Promise<void> {
  const user = await requireRole("facilitator", "admin");
  const supabase = await createClient();

  const { data: eventRow, error: eventErr } = await supabase
    .from("event")
    .select("event_date, cohort_id")
    .eq("id", input.eventId)
    .single();
  if (eventErr) throw eventErr;
  if (eventRow.cohort_id !== input.cohortId) {
    throw new Error("This lesson does not belong to that cohort.");
  }
  const todayISO = new Date().toISOString().slice(0, 10);
  if (eventRow.event_date > todayISO) {
    throw new Error("This lesson hasn't been taught yet.");
  }

  const { data: students, error: studentsErr } = await supabase
    .from("student")
    .select("id")
    .eq("cohort_id", input.cohortId);
  if (studentsErr) throw studentsErr;
  const validIds = new Set((students ?? []).map((s) => s.id));

  for (const sid of Object.keys(input.attendance)) {
    if (!validIds.has(sid)) throw new Error("Unknown student in register.");
  }

  const { data: existing, error: existingErr } = await supabase
    .from("register")
    .select("recorded_at")
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const isCorrection = !!existing?.recorded_at;

  const now = new Date().toISOString();
  const patch: RegisterUpdate = {
    attendance: input.attendance as unknown as Json,
    ...(isCorrection ? { updated_by: user.id, updated_at: now } : { recorded_by: user.id, recorded_at: now }),
  };

  const { error } = await supabase.from("register").update(patch).eq("event_id", input.eventId);
  if (error) throw error;

  if (isCorrection) {
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      entity: "register",
      entity_id: input.eventId,
      action: "correct",
      before: existing as unknown as Json,
      after: patch as unknown as Json,
    });
  }

  const base = `/c/${input.cohortId}`;
  revalidatePath(base);
  revalidatePath(`${base}/lessons`);
  revalidatePath(`${base}/lessons/${input.eventId}`);
  revalidatePath(`${base}/calendar`);
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/attention`);
  revalidatePath(`${base}/reports`);
}
