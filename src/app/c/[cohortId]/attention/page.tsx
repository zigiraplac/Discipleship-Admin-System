import { notFound } from "next/navigation";
import { WarningCircle, ArrowUUpLeft, SignOut } from "@phosphor-icons/react/dist/ssr";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { aggregateCohort } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { AttentionCard } from "@/components/attention/attention-card";
import { HowThisWorksCard } from "@/components/attention/how-it-works-card";

export default async function AttentionPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("attention")) notFound();

  const supabase = await createClient();
  const [cohort, bands, students, lessonEvents, outcomes] = await Promise.all([
    getCohort(supabase, cohortId),
    getBands(supabase),
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
  ]);
  if (!cohort) notFound();

  const agg = aggregateCohort(students, lessonEvents, bands, todayISO());
  const latest = latestByStudent(outcomes);

  const flagged = agg.roster
    .filter((s) => s.status !== "On track")
    .sort((a, b) => a.rate - b.rate);

  const toContact = flagged.filter((s) => !latest.has(s.id)).length;
  const onCatchup = [...latest.values()].filter((o) => o.kind === "catchup").length;
  const leftCohort = [...latest.values()].filter((o) => o.kind === "left").length;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Attention" subtitle={`${cohort.name} · ${flagged.length} below the band`} />

      <StatGrid>
        <StatCard
          label="To contact"
          value={toContact}
          icon={toContact > 0 ? WarningCircle : undefined}
          tone="yellow"
        />
        <StatCard label="On catch-up" value={onCatchup} icon={onCatchup > 0 ? ArrowUUpLeft : undefined} tone="cyan" />
        <StatCard label="Left cohort" value={leftCohort} icon={leftCohort > 0 ? SignOut : undefined} tone="grey" />
      </StatGrid>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {flagged.map((student) => (
          <AttentionCard key={student.id} cohortId={cohortId} student={student} outcome={latest.get(student.id) ?? null} />
        ))}
      </div>

      <HowThisWorksCard />
    </div>
  );
}
