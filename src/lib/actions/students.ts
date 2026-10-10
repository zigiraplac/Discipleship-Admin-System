"use server";

import { createHash } from "node:crypto";
import { cohortTarget, requireCapability } from "@/lib/authz";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { getCohort } from "@/lib/data/cohorts";

export interface AddStudentInput {
  cohortId: string;
  fullName: string;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  dobDay: number | null;
  dobMonth: number | null;
  /** Recorded lesson events this student already attended before being
   * entered into the system — a facilitator forgetting to register someone
   * for the first few lessons shouldn't mean their real attendance is
   * unrecoverable. When given, `enrolled_at` is backdated to the earliest
   * of these instead of "now," so the existing per-student expected/
   * attended window (aggregateCohort, metrics.ts) counts everything from
   * their real start date forward — including any lesson in between that
   * wasn't ticked, which correctly comes out as a real miss. */
  attendedEventIds?: string[];
}

/**
 * The only other way a `student` row gets created is in bulk, at cohort
 * creation, from an admin-uploaded CSV (createCohort). This covers the gap
 * for a real student who shows up after that import is done — same
 * validation as `updateStudent`, same admin-only gate (RLS's
 * `student_write_admin` policy only allows an insert from `is_admin()`
 * regardless, so this couldn't be opened up to facilitators without a
 * policy change too).
 */
export async function addStudent(input: AddStudentInput): Promise<{ studentId: string }> {
  const actor = await requireRole("admin");

  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Enter a name.");

  if (input.dobDay != null && (input.dobDay < 1 || input.dobDay > 31)) {
    throw new Error("Birthday day must be between 1 and 31.");
  }
  if (input.dobMonth != null && (input.dobMonth < 1 || input.dobMonth > 12)) {
    throw new Error("Birthday month must be between 1 and 12.");
  }
  if ((input.dobDay == null) !== (input.dobMonth == null)) {
    throw new Error("Enter both a birthday day and month, or leave both blank.");
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Never trust event ids from the client outright — same defensive check
  // toggleLessonCatchup uses (catchup.ts) — confirm each one is actually a
  // recorded lesson belonging to this cohort before it can move their
  // enrollment date or get an attendance mark written against it.
  let backfillEvents: { id: string; event_date: string }[] = [];
  if (input.attendedEventIds?.length) {
    const { data: rows, error: eventsErr } = await supabase
      .from("event")
      .select("id, event_date, kind, register(recorded_at)")
      .eq("cohort_id", input.cohortId)
      .in("id", input.attendedEventIds);
    if (eventsErr) throw new Error("Couldn't verify those lessons. Please try again.");
    backfillEvents = (rows ?? [])
      .filter((r) => {
        const reg = Array.isArray(r.register) ? r.register[0] : r.register;
        return r.kind === "lesson" && reg?.recorded_at != null;
      })
      .map((r) => ({ id: r.id, event_date: r.event_date }));
  }

  const enrolledAt = backfillEvents.length
    ? new Date(`${backfillEvents.reduce((min, e) => (e.event_date < min ? e.event_date : min), backfillEvents[0].event_date)}T00:00:00Z`).toISOString()
    : now;

  const { data, error } = await supabase
    .from("student")
    .insert({
      cohort_id: input.cohortId,
      full_name: fullName,
      full_name_raw: fullName,
      email: input.email?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      country: input.country?.trim() || null,
      city: input.city?.trim() || null,
      dob_day: input.dobDay,
      dob_month: input.dobMonth,
      registered_at: now,
      enrolled_at: enrolledAt,
    })
    .select("id")
    .single();
  if (error) throw error;

  // A plain "they were there" mark, not a catch-up correction — no
  // lesson_catchup row, since that table specifically means "made up a
  // missed lesson later," which isn't what happened here. Same atomic RPC
  // toggleLessonCatchup already uses (0009_atomic_writes.sql), so no new
  // migration is needed for this.
  for (const ev of backfillEvents) {
    const { error: markErr } = await supabase.rpc("set_attendance_mark", {
      p_event_id: ev.id,
      p_student_id: data.id,
      p_present: true,
      p_actor: actor.id,
    });
    if (markErr) throw new Error("Student was added, but couldn't backfill their attendance. Please try again.");
  }

  const cohort = await getCohort(supabase, input.cohortId);
  const cohortSlug = cohort?.slug ?? input.cohortId;
  await notify(
    { type: "cohort_operational", cohortId: input.cohortId },
    () => ({
      kind: "student_updated",
      title: `${fullName} joined the cohort`,
      body: "Added after the initial import.",
      href: `/c/${cohortSlug}/students/${data.id}`,
      dedupeKey: `student_added:${data.id}`,
    }),
    { exclude: [actor.id] }
  );

  const base = `/c/${cohortSlug}`;
  revalidatePath(base);
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/reports`);

  return { studentId: data.id };
}

export interface UpdateStudentInput {
  studentId: string;
  cohortId: string;
  fullName: string;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  dobDay: number | null;
  dobMonth: number | null;
  /** ISO date (YYYY-MM-DD) — the window `aggregateCohort` (metrics.ts)
   * uses to decide which lessons count toward this student's own
   * expected/attended totals. `addStudent`'s own backfill checklist only
   * offers lessons already *recorded* at add-time; a lesson recorded
   * later than that (e.g. a Meet report imported for an earlier date)
   * has no way to be backdated except here. */
  enrolledAt: string;
}

/**
 * Admin-only, deliberately — a facilitator recording attendance/outcomes
 * is a very different trust level than rewriting someone's stored identity
 * (name, email, DOB). RLS's `can_write_pastoral` would technically also
 * allow a cohort's own facilitator to write here, so the real restriction
 * is this explicit role check, the same pattern the rest of the app uses
 * to be narrower than what RLS alone permits.
 */
export async function updateStudent(input: UpdateStudentInput): Promise<void> {
  const actor = await requireRole("admin");

  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Enter a name.");

  if (input.dobDay != null && (input.dobDay < 1 || input.dobDay > 31)) {
    throw new Error("Birthday day must be between 1 and 31.");
  }
  if (input.dobMonth != null && (input.dobMonth < 1 || input.dobMonth > 12)) {
    throw new Error("Birthday month must be between 1 and 12.");
  }
  if ((input.dobDay == null) !== (input.dobMonth == null)) {
    throw new Error("Enter both a birthday day and month, or leave both blank.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.enrolledAt)) {
    throw new Error("Enter a valid enrollment date.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("student")
    .update({
      full_name: fullName,
      email: input.email?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      country: input.country?.trim() || null,
      dob_day: input.dobDay,
      dob_month: input.dobMonth,
      enrolled_at: `${input.enrolledAt}T00:00:00Z`,
    })
    .eq("id", input.studentId)
    .eq("cohort_id", input.cohortId);
  if (error) throw error;

  // The facilitator/teacher who actually works with this student day to
  // day otherwise has no way to know their record changed underneath
  // them — an admin edit here is exactly the kind of "something changed
  // that I share access to" event worth surfacing, not a routine save.
  const cohort = await getCohort(supabase, input.cohortId);
  const cohortSlug = cohort?.slug ?? input.cohortId;
  await notify(
    { type: "cohort_operational", cohortId: input.cohortId },
    () => ({
      kind: "student_updated",
      title: `${fullName}'s details were updated`,
      body: "An admin updated their profile.",
      href: `/c/${cohortSlug}/students/${input.studentId}`,
      // The same values saved again is the same update — no second notice.
      dedupeKey: `student_updated:${input.studentId}:${createHash("sha1").update(JSON.stringify(input)).digest("hex").slice(0, 16)}`,
    }),
    { exclude: [actor.id] }
  );

  const base = `/c/${cohortSlug}`;
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/students/${input.studentId}`);
  revalidatePath(`${base}/followup`);
}

/**
 * "I reached out, now waiting to hear back" — the one piece of Follow Up
 * tracking that didn't exist before the WhatsApp deep-link was the only
 * option. Facilitator/admin only, same as recordOutcome (the action that
 * closes this back to null again once a real decision is made).
 */
export async function markStudentContacted(input: { studentId: string; cohortId: string }): Promise<void> {
  const actor = await requireCapability("manage_followups", await cohortTarget(input.cohortId));
  const supabase = await createClient();

  const { error } = await supabase
    .from("student_follow_up")
    .upsert(
      { student_id: input.studentId, cohort_id: input.cohortId, contacted_at: new Date().toISOString(), contacted_by: actor.id, updated_at: new Date().toISOString() },
      { onConflict: "student_id" }
    );
  if (error) throw new Error("Couldn't mark this student as contacted. Please try again.");

  const cohort = await getCohort(supabase, input.cohortId);
  const base = `/c/${cohort?.slug ?? input.cohortId}`;
  revalidatePath(`${base}/followup`);
  revalidatePath(`${base}/students/${input.studentId}`);
}

/**
 * The follow-up plan for a struggling student: who follows up, and when to
 * check on them again. Past that date while they still need attention, the
 * follow-up shows as overdue here and on the levels above. Facilitator/
 * admin only; RLS (student_update) confirms they can write to this cohort.
 */
export async function setFollowUpPlan(input: {
  studentId: string;
  cohortId: string;
  assigneeId: string | null;
  nextOn: string | null;
}): Promise<void> {
  await requireCapability("manage_followups", await cohortTarget(input.cohortId));
  if (input.nextOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextOn)) throw new Error("Pick a valid date.");
  const supabase = await createClient();
  const { data: student } = await supabase.from("student").select("id").eq("id", input.studentId).eq("cohort_id", input.cohortId).maybeSingle();
  if (!student) throw new Error("This student does not belong to that cohort.");
  const { data, error } = await supabase
    .from("student_follow_up")
    .upsert(
      { student_id: input.studentId, cohort_id: input.cohortId, assignee: input.assigneeId, next_on: input.nextOn, updated_at: new Date().toISOString() },
      { onConflict: "student_id" }
    )
    .select("student_id");
  if (error) throw new Error("Couldn't save the follow-up plan. Please try again.");
  if (!data?.length) throw new Error("You can't change this student's follow-up.");

  const cohort = await getCohort(supabase, input.cohortId);
  const base = `/c/${cohort?.slug ?? input.cohortId}`;
  revalidatePath(`${base}/followup`);
  revalidatePath(`${base}/catchup`);
  revalidatePath(`${base}/students/${input.studentId}`);
}
