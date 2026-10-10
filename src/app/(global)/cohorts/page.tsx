import { notFound } from "next/navigation";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohortWithBands, getPolicy } from "@/lib/data/org";
import { listCohorts, getScheduleSegments } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { aggregateCohort, computePace } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { CohortsBoard } from "@/components/cohorts/cohorts-board";

/**
 * The cohort directory: switch between the cohorts you work with, start a
 * new one, or remove one. Executive summaries live on the HQ dashboard
 * (/u/global-hq) — one place for that, not two. `NAV_BY_ROLE` lacks
 * "cohorts" only for teacher, so that's the one role blocked here.
 */
export default async function CohortsPage() {
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("cohorts")) notFound();

  const supabase = await createClient();
  const [cohorts, { bands }] = await Promise.all([listCohorts(supabase), getPolicy()]);
  // Statuses now: today's policy for running cohorts, each finished cohort's own (below).
  const today = todayISO();

  // Cohort counts are tiny (2-3 cohorts) — a couple of extra queries per
  // card to get the real at-risk count (`.atRisk`) via the same aggregate
  // used everywhere else, rather than a partial figure from getQuickStats.
  const cards = await Promise.all(
    cohorts.map(async (cohort) => {
      const [allStudents, lessonEvents, scheduleSegments, own] = await Promise.all([
        getStudents(supabase, cohort.id),
        getLessonEvents(supabase, cohort.id),
        getScheduleSegments(supabase, cohort.id),
        getCohortWithBands(supabase, cohort.id),
      ]);
      const agg = aggregateCohort(allStudents, lessonEvents, own[1], today);
      const pace = computePace(cohort, scheduleSegments, agg.recordedCount, today);
      return { cohort, agg, pace };
    })
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Cohorts" subtitle="Your cohorts — open one, or start a new one." />
      <CohortsBoard rows={cards} bands={bands} canCreateCohort={user.role === "admin"} canDeleteCohort={user.role === "admin"} />
    </div>
  );
}
