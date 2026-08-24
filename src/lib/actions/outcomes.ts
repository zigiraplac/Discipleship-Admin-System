"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { OutcomeKind } from "@/lib/domain/types";

export interface RecordOutcomeInput {
  studentId: string;
  cohortId: string;
  kind: OutcomeKind;
}

/** Append-only — a new row every time, never an update. A student's stage
 * on screen is simply the most recent row. */
export async function recordOutcome(input: RecordOutcomeInput): Promise<void> {
  const user = await requireRole("facilitator", "admin");
  const supabase = await createClient();

  const { error } = await supabase.from("outcome").insert({
    student_id: input.studentId,
    cohort_id: input.cohortId,
    kind: input.kind,
    recorded_by: user.id,
  });
  if (error) throw error;

  const base = `/c/${input.cohortId}`;
  revalidatePath(base);
  revalidatePath(`${base}/attention`);
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/students/${input.studentId}`);
}
