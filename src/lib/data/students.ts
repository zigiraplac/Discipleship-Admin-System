import { cache } from "react";
import type { DB } from "./types";
import type { Student } from "@/lib/domain/types";

interface StudentRow {
  id: string;
  cohort_id: string;
  full_name: string;
  email: string | null;
  email_verified: boolean;
  whatsapp: string | null;
  country: string | null;
  country_raw: string | null;
  dob_day: number | null;
  dob_month: number | null;
  registered_at: string | null;
  enrolled_at: string;
  left_at: string | null;
}

const STUDENT_SELECT =
  "id, cohort_id, full_name, email, email_verified, whatsapp, country, country_raw, dob_day, dob_month, registered_at, enrolled_at, left_at";

function mapStudentRow(row: StudentRow): Student {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    fullName: row.full_name,
    email: row.email,
    emailVerified: row.email_verified,
    whatsapp: row.whatsapp,
    country: row.country,
    countryRaw: row.country_raw,
    dobDay: row.dob_day,
    dobMonth: row.dob_month,
    registeredAt: row.registered_at,
    enrolledAt: row.enrolled_at,
    leftAt: row.left_at,
  };
}

/** Cached per request — Shell fetches the active cohort's roster for its
 * own quick-stats/badges, and the page being rendered fetches it again
 * for the same cohort; without this they're two separate round trips. */
export const getStudents = cache(async function getStudents(db: DB, cohortId: string): Promise<Student[]> {
  const { data, error } = await db
    .from("student")
    .select(STUDENT_SELECT)
    .eq("cohort_id", cohortId)
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map(mapStudentRow);
});

export const getStudent = cache(async function getStudent(db: DB, studentId: string): Promise<Student | null> {
  const { data, error } = await db
    .from("student")
    .select(STUDENT_SELECT)
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapStudentRow(data) : null;
});
