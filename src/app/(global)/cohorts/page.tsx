import { notFound } from "next/navigation";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCohorts, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { aggregateCohort, monthlyRates } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { CohortCard } from "@/components/cohorts/cohort-card";
import { NewCohortTile } from "@/components/cohorts/new-cohort-tile";
import { ExecutiveOverview } from "@/components/cohorts/executive-overview";

/**
 * Switch between cohorts, or start a new one. `NAV_BY_ROLE` lacks
 * "cohorts" only for teacher, so that's the one role blocked here.
 */
export default async function CohortsPage() {
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("cohorts")) notFound();

  const supabase = await createClient();
  const [cohorts, bands] = await Promise.all([listCohorts(supabase), getBands(supabase)]);
  const today = todayISO();

  // Cohort counts are tiny (2-3 cohorts) — a couple of extra queries per
  // card to get the real at-risk count (`.atRisk`) via the same aggregate
  // used everywhere else, rather than a partial figure from getQuickStats.
  const cards = await Promise.all(
    cohorts.map(async (cohort) => {
      const [students, lessonEvents] = await Promise.all([
        getStudents(supabase, cohort.id),
        getLessonEvents(supabase, cohort.id),
      ]);
      const agg = aggregateCohort(students, lessonEvents, bands, today);
      const monthly = monthlyRates(lessonEvents, agg.enrolled);
      return { cohort, agg, monthly };
    })
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Cohorts" subtitle="Switch between cohorts, or start a new one." />
      <ExecutiveOverview rows={cards} bands={bands} />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
      >
        {cards.map(({ cohort, agg }) => (
          <CohortCard key={cohort.id} cohort={cohort} agg={agg} />
        ))}
        {user.role === "admin" && <NewCohortTile />}
      </div>
    </div>
  );
}
