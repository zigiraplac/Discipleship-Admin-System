"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { createNotifications } from "@/lib/data/notifications";
import { outcomeShortLabel } from "@/components/outcome/outcome-copy";
import type { Json } from "@/lib/supabase/database.types";
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

  // The RLS check on `outcome` only verifies the caller has pastoral
  // access to `input.cohortId` — it never confirms the student actually
  // belongs to that cohort. Without this, a facilitator with access to
  // cohort A could name a student from cohort B and both save a
  // mismatched record and have that student's name/status notified to
  // cohort A's own members below.
  const { data: student, error: studentErr } = await supabase
    .from("student")
    .select("cohort_id, full_name")
    .eq("id", input.studentId)
    .maybeSingle();
  if (studentErr) throw new Error("Couldn't verify this student. Please try again.");
  if (!student || student.cohort_id !== input.cohortId) {
    throw new Error("This student does not belong to that cohort.");
  }

  // Inserts the outcome row and sets the departure flag from the *actual*
  // latest outcome row in one locked transaction — two outcomes recorded
  // for the same student in close succession (e.g. two facilitators)
  // can no longer complete out of order and leave left_at reflecting the
  // wrong one (0014_atomic_outcome_left_sync.sql). Recording "left" marks
  // them departed; anything else (currently just "catchup"/"resolved")
  // reinstates them, in case they'd previously left and are now being
  // given another chance.
  const { error } = await supabase.rpc("record_outcome_and_sync_left", {
    p_student_id: input.studentId,
    p_cohort_id: input.cohortId,
    p_kind: input.kind,
    p_actor: user.id,
  });
  if (error) throw new Error("Couldn't record this outcome. Please try again.");

  // audit_log is admin-write-only by RLS — go through the admin client so
  // a facilitator recording an outcome doesn't get an RLS error here, the
  // one pastoral decision most worth having a trail for.
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    entity: "outcome",
    entity_id: input.studentId,
    action: "record",
    after: { kind: input.kind, cohortId: input.cohortId } as unknown as Json,
  });

  const [{ data: members }] = await Promise.all([
    admin.from("cohort_member").select("user_id").eq("cohort_id", input.cohortId).neq("user_id", user.id),
  ]);
  const recipientIds = new Set((members ?? []).map((m) => m.user_id));
  if (recipientIds.size) {
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
