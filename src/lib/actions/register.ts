"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { todayISO } from "@/lib/utils";
import type { Database, Json } from "@/lib/supabase/database.types";

type RegisterUpdate = Database["public"]["Tables"]["register"]["Update"];

export interface SaveRegisterInput {
  cohortId: string;
  eventId: string;
  attendance: Record<string, "present" | "absent">;
  /** `updated_at ?? recorded_at ?? null` as it was when the form was
   * loaded — lets a second, concurrent save detect that someone else's
   * save landed in between and refuse to silently clobber it. */
  expectedVersion: string | null;
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
  if (eventErr) throw new Error("Couldn't load this lesson. Please try again.");
  if (eventRow.cohort_id !== input.cohortId) {
    throw new Error("This lesson does not belong to that cohort.");
  }
  if (eventRow.event_date > todayISO()) {
    throw new Error("This lesson hasn't been taught yet.");
  }

  const { data: students, error: studentsErr } = await supabase
    .from("student")
    .select("id")
    .eq("cohort_id", input.cohortId);
  if (studentsErr) throw new Error("Couldn't load this cohort's students. Please try again.");
  const validIds = new Set((students ?? []).map((s) => s.id));

  for (const [sid, mark] of Object.entries(input.attendance)) {
    if (!validIds.has(sid)) throw new Error("Unknown student in register.");
    if (mark !== "present" && mark !== "absent") throw new Error("Invalid attendance value.");
  }

  const { data: existing, error: existingErr } = await supabase
    .from("register")
    .select("recorded_at, updated_at")
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (existingErr) throw new Error("Couldn't load this register. Please try again.");

  const isCorrection = !!existing?.recorded_at;

  const patch: RegisterUpdate = {
    attendance: input.attendance as unknown as Json,
    ...(isCorrection ? { updated_by: user.id, updated_at: new Date().toISOString() } : { recorded_by: user.id, recorded_at: new Date().toISOString() }),
  };

  // The version check and the write are a single round trip here — the
  // database only applies the update if the row's version still matches
  // `expectedVersion` at the moment it runs, so there's no window for a
  // concurrent save to land in between (0013_atomic_register_save.sql).
  const { data: updatedRows, error } = await supabase.rpc("save_register", {
    p_event_id: input.eventId,
    p_attendance: input.attendance as unknown as Json,
    p_actor: user.id,
    p_is_correction: isCorrection,
    p_expected_version: input.expectedVersion,
  });
  if (error) throw new Error("Couldn't save this register. Please try again.");
  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("This register was changed by someone else since you loaded it. Reload and try again.");
  }

  if (isCorrection) {
    // audit_log is admin-write-only by RLS — go through the admin client
    // so a facilitator's correction doesn't throw here even though the
    // register update above already succeeded.
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
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
