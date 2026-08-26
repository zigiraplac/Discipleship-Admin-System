"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface UpdateStudentInput {
  studentId: string;
  cohortId: string;
  fullName: string;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  dobDay: number | null;
  dobMonth: number | null;
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
  await requireRole("admin");

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
  const { error } = await supabase
    .from("student")
    .update({
      full_name: fullName,
      email: input.email?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      country: input.country?.trim() || null,
      dob_day: input.dobDay,
      dob_month: input.dobMonth,
    })
    .eq("id", input.studentId)
    .eq("cohort_id", input.cohortId);
  if (error) throw error;

  const base = `/c/${input.cohortId}`;
  revalidatePath(`${base}/students`);
  revalidatePath(`${base}/students/${input.studentId}`);
  revalidatePath(`${base}/attention`);
}
