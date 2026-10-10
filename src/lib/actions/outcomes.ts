"use server";

import { cohortTarget, requireCapability } from "@/lib/authz";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { outcomeRecordedNotice } from "@/lib/domain/notification-messages";
import { getCohort } from "@/lib/data/cohorts";
import type { Json } from "@/lib/supabase/database.types";
import type { OutcomeKind } from "@/lib/domain/types";
import { todayISO } from "@/lib/utils";

export interface RecordOutcomeInput {
  studentId: string;
  cohortId: string;
  kind: OutcomeKind;
  /** For "left": the day they actually left (YYYY-MM-DD, not in the
   * future). Lessons from that day on are no longer owed. Default today. */
  leftOn?: string;
}

/** Append-only — a new row every time, never an update. A student's stage
 * on screen is simply the most recent row. */
export async function recordOutcome(input: RecordOutcomeInput): Promise<void> {
  const user = await requireCapability("manage_followups", await cohortTarget(input.cohortId));
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

  // One locked transaction (record_outcome_and_sync_left, 0033): inserts
  // the outcome and, only for a leaving or returning decision, records the
  // enrolment change with its date — so history is kept and a later
  // follow-up result never silently re-enrols or un-enrols anyone.
  if (input.leftOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.leftOn) || input.leftOn > todayISO())) {
    throw new Error("Pick the day they left — today or earlier.");
  }
  const { error } = await supabase.rpc("record_outcome_and_sync_left", {
    p_student_id: input.studentId,
    p_cohort_id: input.cohortId,
    p_kind: input.kind,
    p_effective_on: input.kind === "left" ? (input.leftOn ?? null) : null,
    p_actor: user.id,
  });
  if (error) throw new Error("Couldn't record this outcome. Please try again.");

  // Recording any real decision closes the "needs contact" cycle that
  // `markStudentContacted` (src/lib/actions/students.ts) opened — if this
  // student ever falls below the band again later, Follow Up should treat
  // them as freshly flagged, not still "contacted" from a previous round.
  // The follow-up plan (who, and when to check again) ends with the same
  // decision — except a catch-up plan, where "check again on" is exactly
  // how someone keeps an eye on whether the catch-up is working.
  await supabase
    .from("student_follow_up")
    .update(
      input.kind === "catchup"
        ? { contacted_at: null, contacted_by: null, updated_at: new Date().toISOString() }
        : { contacted_at: null, contacted_by: null, assignee: null, next_on: null, updated_at: new Date().toISOString() }
    )
    .eq("student_id", input.studentId)
    .eq("cohort_id", input.cohortId);

  // audit_log is admin-write-only by RLS — go through the admin client so
  // a facilitator recording an outcome doesn't get an RLS error here, the
  // one pastoral decision most worth having a trail for.
  const admin = createAdminClient();
  const { data: auditRow } = await admin
    .from("audit_log")
    .insert({
      actor_id: user.id,
      entity: "outcome",
      entity_id: input.studentId,
      action: "record",
      after: { kind: input.kind, cohortId: input.cohortId } as unknown as Json,
    })
    .select("id")
    .single();

  const cohort = await getCohort(supabase, input.cohortId);
  const cohortSlug = cohort?.slug ?? input.cohortId;

  // Pastoral: the cohort's facilitators only, and nothing in the text
  // says who or what — Follow Up shows that to those allowed to see it.
  await notify(
    { type: "cohort_pastoral", cohortId: input.cohortId },
    () => outcomeRecordedNotice({ cohortName: cohort?.name ?? "this cohort", cohortSlug, auditId: auditRow?.id ?? null }),
    { exclude: [user.id] }
  );

  const base = `/c/${cohortSlug}`;
  revalidatePath(base);
  revalidatePath(`${base}/followup`);
  revalidatePath(`${base}/catchup`);
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/students/${input.studentId}`);
}
