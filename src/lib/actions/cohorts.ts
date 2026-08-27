"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/auth";
import {
  parseRegistrationsCsv,
  dedupeRegistrations,
  type DedupeResult,
} from "@/lib/domain/registrations";
import { buildEvents } from "@/lib/domain/generator";
import { ensureCurriculumSeeded } from "@/lib/data/curriculum-admin";
import { getBands } from "@/lib/data/cohorts";
import { getQuickStats, type QuickStats } from "@/lib/data/quick-stats";
import { todayISO } from "@/lib/utils";

/**
 * Powers the cohort switcher's per-cohort "34 students · 82%" line — on
 * demand, the first time someone actually opens the dropdown, rather than
 * eagerly for every cohort on every single page load (which is what Shell
 * used to do; each cohort's number here is the same heavy full-register
 * read getLessonEvents does, so doing it for cohorts nobody's looking at
 * was pure waste). RLS scopes each cohort's own query regardless of which
 * ids are requested, so no extra access check is needed beyond being
 * signed in.
 */
export async function getCohortQuickStats(cohortIds: string[]): Promise<Record<string, QuickStats>> {
  const user = await requireUser();
  const supabase = await createClient();
  const bands = await getBands(supabase);
  const today = todayISO();

  const entries = await Promise.all(
    cohortIds.map(async (id) => [id, await getQuickStats(supabase, id, bands, today, user.role)] as const)
  );
  return Object.fromEntries(entries);
}

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
  /** Lessons covered per study session — the target pace (1-5). */
  lessonsPerSession: number;
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
 * The cohort + students + schedule themselves are written by a single
 * `create_cohort_with_schedule` RPC call (0006_cohort_transaction.sql) —
 * one Postgres function invocation is one implicit transaction, so a
 * failure partway through (e.g. the event batch) rolls back the whole
 * thing instead of leaving a cohort with students but no schedule.
 * Curriculum provisioning and the lesson-id lookup stay outside it: that
 * reference data is shared and idempotent, not part of *this* cohort's
 * atomicity.
 */
export async function createCohort(input: CreateCohortInput): Promise<CreateCohortResult> {
  const user = await requireRole("admin");
  if (!input.name.trim()) {
    throw new Error("Name the cohort.");
  }
  if (!input.teachingDays.length) {
    throw new Error("Pick at least one teaching day.");
  }
  if (input.lessonsPerSession < 1 || input.lessonsPerSession > 5) {
    throw new Error("Lessons per session must be between 1 and 5.");
  }

  const { registrants } = dedupeRegistrations(parseRegistrationsCsv(input.csvText));
  const included = new Set(input.includedRegistrantIds);
  const enrol = registrants.filter((r) => included.has(r.id));

  const events = buildEvents(input.startDate, input.teachingDays, input.lessonsPerSession);
  const admin = createAdminClient();

  await ensureCurriculumSeeded(admin);

  const { data: lessonRows, error: lessonErr } = await admin
    .from("lesson")
    .select("id, global_index");
  if (lessonErr) throw lessonErr;
  const lessonIdByIndex = new Map((lessonRows ?? []).map((l) => [l.global_index, l.id]));

  const studentPayload = enrol.map((r) => ({
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
  }));

  const eventPayload = events.map((e) =>
    e.kind === "lesson"
      ? {
          kind: "lesson",
          event_date: e.date,
          lesson_id: lessonIdByIndex.get(e.globalIndex) ?? null,
          after_class: null,
          crusade_day: null,
        }
      : {
          kind: "crusade",
          event_date: e.date,
          lesson_id: null,
          after_class: e.afterClass,
          crusade_day: e.crusadeDay,
        }
  );

  const { data: cohortId, error: rpcErr } = await admin.rpc("create_cohort_with_schedule", {
    p_name: input.name,
    p_city: input.city,
    p_start_date: input.startDate,
    p_teaching_days: input.teachingDays,
    p_lessons_per_session: input.lessonsPerSession,
    p_students: studentPayload,
    p_events: eventPayload,
  });
  if (rpcErr) throw rpcErr;

  await admin.from("audit_log").insert({
    actor_id: user.id,
    entity: "cohort",
    entity_id: cohortId,
    action: "create",
    after: { name: input.name, students: enrol.length, events: eventPayload.length },
  });

  revalidatePath("/cohorts");
  return { cohortId, studentsCount: enrol.length, eventsCount: eventPayload.length };
}
