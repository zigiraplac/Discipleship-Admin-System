import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getCrusadeEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { ensureBirthdayNotifications, ensureAttentionEscalation, ensureCrusadeReminders } from "@/lib/data/notifications";
import { aggregateCohort } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";

/**
 * Runs once a day (see vercel.json) rather than depending on someone
 * happening to load a page — the opportunistic checks in Shell only ever
 * cover whichever cohort's dashboard the current viewer is looking at, at
 * whatever time they happen to look. This sweeps every running cohort at
 * a fixed time instead:
 *   - birthdays: same `ensureBirthdayNotifications`, so the dedupe key
 *     guarantees it's still safe even though this may run alongside the
 *     opportunistic check too.
 *   - attention escalation: a cohort with students flagged for attendance
 *     who've *never* had an outcome recorded gets one summary
 *     notification (not one per student) to that cohort's own members
 *     plus every admin/leadership user, re-firing weekly if unresolved.
 *   - crusade reminders: a cohort's next crusade weekend, once it's
 *     within 7 days, gets one notification to that cohort's own members
 *     plus every admin/leadership user — the only way this fires reliably
 *     regardless of whether anyone happens to load that cohort's pages.
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

  const [{ data: cohorts, error: cohortErr }, { data: broadUsers, error: userErr }, bands] = await Promise.all([
    admin.from("cohort").select("id, name").eq("status", "running"),
    admin.from("app_user").select("id").in("role", ["admin", "leadership"]),
    getBands(admin),
  ]);
  if (cohortErr) throw cohortErr;
  if (userErr) throw userErr;

  const broadRecipientIds = (broadUsers ?? []).map((u) => u.id);

  let cohortsSwept = 0;
  let escalationsSent = 0;
  const failedCohortIds: string[] = [];

  // Each cohort's own try/catch — one cohort throwing (a bad row, a
  // transient query error) used to abort the whole loop, silently
  // skipping every cohort after it in the list with no record of which
  // ones were missed. Now a single failure is isolated and reported.
  for (const cohort of cohorts ?? []) {
    try {
      const [{ data: members, error: membersErr }, students, lessonEvents, outcomes, crusadeEvents] = await Promise.all([
        admin.from("cohort_member").select("user_id").eq("cohort_id", cohort.id),
        getStudents(admin, cohort.id),
        getLessonEvents(admin, cohort.id),
        getOutcomesForCohort(admin, cohort.id),
        getCrusadeEvents(admin, cohort.id),
      ]);
      if (membersErr) throw membersErr;

      const recipientIds = [...new Set([...(members ?? []).map((m) => m.user_id), ...broadRecipientIds])];
      if (!recipientIds.length) {
        cohortsSwept++;
        continue;
      }

      const activeStudents = students.filter((s) => !s.leftAt);
      for (const userId of recipientIds) {
        await ensureBirthdayNotifications(admin, userId, activeStudents, today);
      }

      const agg = aggregateCohort(activeStudents, lessonEvents, bands, today);
      const latest = latestByStudent(outcomes);
      const neverContacted = agg.roster.filter((s) => s.status !== "On track" && !latest.has(s.id)).length;
      if (neverContacted > 0) {
        await ensureAttentionEscalation(admin, {
          cohortId: cohort.id,
          cohortName: cohort.name,
          neverContactedCount: neverContacted,
          recipientIds,
          todayISO: today,
        });
        escalationsSent++;
      }

      await ensureCrusadeReminders(admin, {
        cohortId: cohort.id,
        crusadeEvents: crusadeEvents.map((e) => ({ afterClass: e.afterClass, date: e.date })),
        recipientIds,
        todayISO: today,
      });

      cohortsSwept++;
    } catch (e) {
      console.error(`Cron sweep failed for cohort ${cohort.id}:`, e);
      failedCohortIds.push(cohort.id);
    }
  }

  return NextResponse.json({
    ok: failedCohortIds.length === 0,
    cohortsSwept,
    escalationsSent,
    failedCohortIds,
  });
}
