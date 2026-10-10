import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCohortWithBands } from "@/lib/data/org";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getCrusadeEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { sendAttentionEscalation, sendBirthdayDigest, sendCrusadeReminders } from "@/lib/notify/cohort-alerts";
import { runStatusAlerts } from "@/lib/notify/status-alerts";
import { aggregateCohort } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";

/**
 * Runs once a day (see vercel.json) rather than depending on someone
 * happening to load a page — the opportunistic checks in Shell only ever
 * cover whichever cohort's dashboard the current viewer is looking at, at
 * whatever time they happen to look. This sweeps every running cohort at
 * a fixed time instead:
 *   - birthdays: one digest per cohort with birthdays today, to its
 *     facilitators (sendBirthdayDigest); keyed by cohort + date, so a
 *     re-run never repeats it.
 *   - attention escalation: a cohort with students flagged for attendance
 *     who've *never* had an outcome recorded gets one summary
 *     notification (not one per student), re-firing weekly if unresolved.
 *   - crusade reminders: a cohort's next crusade weekend, once it's
 *     within 7 days, gets one notification.
 *   - status alerts: each level and cohort's alert status; a confirmed
 *     change for the worse goes one level up (lib/notify/status-alerts).
 *
 * Who gets what — decided by the central router (lib/notify), from the
 * same responsibility rules as access and staffing:
 *   - birthday digests → the cohort's facilitators only (and only from this job);
 *   - escalations and crusade reminders → the cohort's team, plus the
 *     leader responsible for the cohort (promotion → church → nearest
 *     staffed level). Never "every admin" as a fallback.
 *
 * `CRON_SECRET` is the standard Vercel Cron pattern: set it as an env var
 * and Vercel automatically sends it as a bearer token on the scheduled
 * request, so this route can't be triggered by anyone else.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayISO();

  const { data: cohorts, error: cohortErr } = await admin.from("cohort").select("id, slug, name, org_unit_id").eq("status", "running");
  if (cohortErr) throw cohortErr;

  let cohortsSwept = 0;
  let escalationsSent = 0;
  const failedCohortIds: string[] = [];

  // Each cohort's own try/catch — one cohort throwing (a bad row, a
  // transient query error) used to abort the whole loop, silently
  // skipping every cohort after it in the list with no record of which
  // ones were missed. Now a single failure is isolated and reported.
  for (const cohort of cohorts ?? []) {
    try {
      const [students, lessonEvents, outcomes, crusadeEvents] = await Promise.all([
        getStudents(admin, cohort.id),
        getLessonEvents(admin, cohort.id),
        getOutcomesForCohort(admin, cohort.id),
        getCrusadeEvents(admin, cohort.id),
      ]);
      // Birthdays: one digest for today, to the facilitators.
      await sendBirthdayDigest({
        cohortId: cohort.id,
        cohortSlug: cohort.slug,
        cohortName: cohort.name,
        students: students.filter((s) => !s.leftAt),
        todayISO: today,
      });

      // Escalations and crusade reminders: team + the responsible leader.
      const [, bands] = await getCohortWithBands(admin, cohort.id);
      const agg = aggregateCohort(students, lessonEvents, bands, today);
      const latest = latestByStudent(outcomes);
      const neverContacted = agg.roster.filter(
        (s) => !s.leftAt && (s.performance === "Needs help" || s.performance === "At risk") && !latest.has(s.id) && !s.contactedAt
      ).length;
      if (await sendAttentionEscalation({ cohortId: cohort.id, cohortSlug: cohort.slug, cohortName: cohort.name, neverContactedCount: neverContacted, todayISO: today })) {
        escalationsSent++;
      }
      await sendCrusadeReminders({
        cohortId: cohort.id,
        cohortSlug: cohort.slug,
        cohortName: cohort.name,
        crusadeEvents: crusadeEvents.map((e) => ({ afterClass: e.afterClass, date: e.date })),
        todayISO: today,
      });

      cohortsSwept++;
    } catch (e) {
      console.error(`Cron sweep failed for cohort ${cohort.id}:`, e);
      failedCohortIds.push(cohort.id);
    }
  }

  // One-level-up status alerts: each level's and cohort's alert status vs.
  // yesterday's; a confirmed worsening (or Critical → Needs attention) tells
  // its parent's leaders. Isolated so a failure here never hides the above.
  let statusAlerts: { checked: number; alerts: number } | { error: string };
  try {
    statusAlerts = await runStatusAlerts(today);
  } catch (e) {
    console.error("Status alerts failed:", e);
    statusAlerts = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({
    ok: failedCohortIds.length === 0 && !("error" in statusAlerts),
    statusAlerts,
    cohortsSwept,
    escalationsSent,
    failedCohortIds,
  });
}
