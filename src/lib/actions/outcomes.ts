"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { createNotifications } from "@/lib/data/notifications";
import { outcomeShortLabel } from "@/components/outcome/outcome-copy";
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

  // Recording "left" is what actually marks them departed — stops
  // counting toward the cohort's own numbers everywhere they're used.
  // Recording "catchup" reinstates them, in case they'd previously left
  // and are now being given another chance.
  const { error: studentErr } = await supabase
    .from("student")
    .update({ left_at: input.kind === "left" ? new Date().toISOString() : null })
    .eq("id", input.studentId);
  if (studentErr) throw studentErr;

  const admin = createAdminClient();
  const [{ data: student }, { data: members }] = await Promise.all([
    admin.from("student").select("full_name").eq("id", input.studentId).maybeSingle(),
    admin.from("cohort_member").select("user_id").eq("cohort_id", input.cohortId).neq("user_id", user.id),
  ]);
  const recipientIds = new Set((members ?? []).map((m) => m.user_id));
  if (recipientIds.size && student) {
    await createNotifications(
      admin,
      [...recipientIds].map((userId) => ({
        userId,
        kind: "outcome_recorded",
        title: `${student.full_name}: ${outcomeShortLabel(input.kind)}`,
        body: "An outcome was just recorded for them.",
        href: `/c/${input.cohortId}/students/${input.studentId}`,
      }))
    );
  }

  const base = `/c/${input.cohortId}`;
  revalidatePath(base);
  revalidatePath(`${base}/attention`);
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/students/${input.studentId}`);
}
