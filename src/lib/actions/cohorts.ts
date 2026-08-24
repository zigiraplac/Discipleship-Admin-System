"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import {
  parseRegistrationsCsv,
  dedupeRegistrations,
  type DedupeResult,
} from "@/lib/domain/registrations";
import { buildEvents } from "@/lib/domain/generator";
import { ensureCurriculumSeeded } from "@/lib/data/curriculum-admin";

/**
 * Wizard step 2: the admin uploads their own registration CSV in the
 * browser (read client-side via `FileReader`) and its text content is
 * passed in here — nothing is read from disk. Re-parsed fresh on every
 * call rather than cached, and re-parsed *again* inside `createCohort`
 * from the same text, so the preview and the eventual write are provably
 * looking at the same data.
 */
export async function getRegistrationPreview(csvText: string): Promise<DedupeResult> {
  await requireRole("admin");
  return dedupeRegistrations(parseRegistrationsCsv(csvText));
}

export interface CreateCohortInput {
  name: string;
  city: string;
  startDate: string; // YYYY-MM-DD
  teachingDays: number[];
  csvText: string;
  includedRegistrantIds: string[];
}

export interface CreateCohortResult {
  cohortId: string;
  studentsCount: number;
  eventsCount: number;
}

/**
 * The one transaction that matters (08-backend-notes.md). Uses the
 * service-role client because this genuinely needs to write a cohort plus
 * students plus 101+ events in one shot — RLS already grants an admin
 * every one of these individually, this just skips the round-trip policy
 * checks. Also the one place the fixed curriculum reference data gets
 * provisioned, lazily and idempotently — there's no separate seed step.
 *
 * Not yet wrapped in a real Postgres transaction: a failure partway
 * through (e.g. the event batch) can leave a cohort with students but no
 * schedule. Acceptable for a first pass; harden with a single plpgsql
 * function if this becomes a real risk.
 */
export async function createCohort(input: CreateCohortInput): Promise<CreateCohortResult> {
  const user = await requireRole("admin");
  if (!input.name.trim()) {
    throw new Error("Name the cohort.");
  }
  if (!input.teachingDays.length) {
    throw new Error("Pick at least one teaching day.");
  }

  const { registrants } = dedupeRegistrations(parseRegistrationsCsv(input.csvText));
  const included = new Set(input.includedRegistrantIds);
  const enrol = registrants.filter((r) => included.has(r.id));

  const events = buildEvents(input.startDate, input.teachingDays);
  const admin = createAdminClient();

  await ensureCurriculumSeeded(admin);

  const { data: lessonRows, error: lessonErr } = await admin
    .from("lesson")
    .select("id, global_index");
  if (lessonErr) throw lessonErr;
  const lessonIdByIndex = new Map((lessonRows ?? []).map((l) => [l.global_index, l.id]));

  const { data: cohortRow, error: cohortErr } = await admin
    .from("cohort")
    .insert({
      name: input.name,
      city: input.city,
      start_date: input.startDate,
      teaching_days: input.teachingDays,
      status: "running",
    })
    .select("id")
    .single();
  if (cohortErr) throw cohortErr;
  const cohortId = cohortRow.id as string;

  if (enrol.length) {
    const { error: studentErr } = await admin.from("student").insert(
      enrol.map((r) => ({
        cohort_id: cohortId,
        full_name: r.fullName,
        full_name_raw: r.fullNameRaw,
        email: r.email,
        email_verified: r.emailVerified,
        whatsapp: r.whatsapp,
        country: r.country,
        country_raw: r.countryRaw,
        dob_day: r.dobDay,
        dob_month: r.dobMonth,
        registered_at: r.registeredAt,
      }))
    );
    if (studentErr) throw studentErr;
  }

  const eventRows = events.map((e) =>
    e.kind === "lesson"
      ? {
          cohort_id: cohortId,
          kind: "lesson" as const,
          event_date: e.date,
          lesson_id: lessonIdByIndex.get(e.globalIndex) ?? null,
        }
      : {
          cohort_id: cohortId,
          kind: "crusade" as const,
          event_date: e.date,
          after_class: e.afterClass,
          crusade_day: e.crusadeDay,
        }
  );
  const { error: eventErr } = await admin.from("event").insert(eventRows);
  if (eventErr) throw eventErr;

  await admin.from("audit_log").insert({
    actor_id: user.id,
    entity: "cohort",
    entity_id: cohortId,
    action: "create",
    after: { name: input.name, students: enrol.length, events: eventRows.length },
  });

  revalidatePath("/cohorts");
  return { cohortId, studentsCount: enrol.length, eventsCount: eventRows.length };
}
