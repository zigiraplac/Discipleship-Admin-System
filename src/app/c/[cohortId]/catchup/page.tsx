import { cohortCapabilities } from "@/lib/authz";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { aggregateCohort, attendanceSince } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { CatchupBoard } from "@/components/catchup/catchup-board";
import { HowCatchupWorksCard } from "@/components/catchup/how-it-works-card";
import type { CatchupEntry } from "@/components/catchup/catchup-list";

export default async function CatchupPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  await requireUser();

  const supabase = await createClient();
  const [cohort, bands] = await getCohortWithBands(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_followups")) notFound();

  const [allStudents, lessonEvents, outcomes] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
  ]);

  const today = todayISO();
  const agg = aggregateCohort(allStudents, lessonEvents, bands, today);
  const latest = latestByStudent(outcomes);
  const canRecord = caps.has("manage_followups");

  // Everyone with a live "catchup" decision on record — regardless of
  // current status, since "every missed lesson made up" (Ready to update)
  // typically also means their rate has recovered to "On track".
  const entries: CatchupEntry[] = agg.roster
    .filter((s) => !s.leftAt && latest.get(s.id)?.kind === "catchup")
    .sort((a, b) => a.rate - b.rate)
    .map((student) => {
      const outcome = latest.get(student.id)!;
      return { student, outcome, sinceProgress: attendanceSince(student, lessonEvents, outcome.recordedAt, today) };
    });

  const onCatchup = entries.filter((e) => e.student.missed > 0);
  const readyToUpdate = entries.filter((e) => e.student.missed === 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Catch ups" subtitle={`${cohort.name} · ${entries.length} on a catch-up plan`} />

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
