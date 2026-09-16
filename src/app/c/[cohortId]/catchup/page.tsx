import { notFound } from "next/navigation";
import { ArrowUUpLeft, ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { aggregateCohort, attendanceSince } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { CatchupBoard } from "@/components/catchup/catchup-board";
import { HowCatchupWorksCard } from "@/components/catchup/how-it-works-card";
import type { CatchupEntry } from "@/components/catchup/catchup-list";

export default async function CatchupPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("catchup")) notFound();

  const supabase = await createClient();
  const [cohort, bands] = await Promise.all([getCohort(supabase, routeParam), getBands(supabase)]);
  if (!cohort) notFound();
  const cohortId = cohort.id;

  const [allStudents, lessonEvents, outcomes] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
  ]);

  const students = allStudents.filter((s) => !s.leftAt);
  const agg = aggregateCohort(students, lessonEvents, bands, todayISO());
  const latest = latestByStudent(outcomes);
  const canRecord = user.role === "facilitator" || user.role === "admin";

  // Everyone with a live "catchup" decision on record — regardless of
  // current status, since "every missed lesson made up" (Ready to update)
  // typically also means their rate has recovered to "On track".
  const entries: CatchupEntry[] = agg.roster
    .filter((s) => latest.get(s.id)?.kind === "catchup")
    .sort((a, b) => a.rate - b.rate)
    .map((student) => {
      const outcome = latest.get(student.id)!;
      return { student, outcome, sinceProgress: attendanceSince(student.id, lessonEvents, outcome.recordedAt) };
    });

  const onCatchup = entries.filter((e) => e.student.missed > 0);
  const readyToUpdate = entries.filter((e) => e.student.missed === 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Catch ups" subtitle={`${cohort.name} · ${entries.length} on a catch-up plan`} />

      <StatGrid>
        <StatCard label="On catch-up" value={onCatchup.length} icon={onCatchup.length > 0 ? ArrowUUpLeft : undefined} tone="cyan" />
        <StatCard
          label="Ready to update"
          value={readyToUpdate.length}
          icon={readyToUpdate.length > 0 ? ArrowsClockwise : undefined}
          tone="yellow"
        />
      </StatGrid>

      <CatchupBoard
        entries={entries}
        onCatchup={onCatchup}
        readyToUpdate={readyToUpdate}
        cohortId={cohortId}
        cohortSlug={cohort.slug}
        lessonEvents={lessonEvents}
        bands={bands}
        canRecord={canRecord}
      />

      <HowCatchupWorksCard />
    </div>
  );
}
