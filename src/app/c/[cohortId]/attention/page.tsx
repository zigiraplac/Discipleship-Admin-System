import { notFound } from "next/navigation";
import { WarningCircle, ArrowUUpLeft, ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { aggregateCohort, attendanceSince } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { Card } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { AttentionCard } from "@/components/attention/attention-card";
import { AttentionTabs, type AttentionTab } from "@/components/attention/attention-tabs";
import { HowThisWorksCard } from "@/components/attention/how-it-works-card";
import type { Bands, LessonEventView, Outcome, StudentAggregate } from "@/lib/domain/types";

export default async function AttentionPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("attention")) notFound();

  const supabase = await createClient();
  const cohort = await getCohort(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;

  const [bands, allStudents, lessonEvents, outcomes] = await Promise.all([
    getBands(supabase),
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
  ]);

  // A student marked "left" is done being tracked here — Attention exists
  // to flag an open problem, and once someone's gone there's nothing left
  // to act on. They're still visible (vividly marked) on Students, and
  // counted on the Dashboard's "Left the program" KPI.
  const students = allStudents.filter((s) => !s.leftAt);
  const agg = aggregateCohort(students, lessonEvents, bands, todayISO());
  const latest = latestByStudent(outcomes);
  const canRecord = user.role === "facilitator" || user.role === "admin";

  // `s.missed` is how many recorded lessons they weren't present for — a
  // catch-up student stays visible here for as long as their outcome says
  // "catchup", even after every lesson is resolved and their rate has
  // recovered. That's deliberate: once they hit 0 missed, they move into
  // "Ready to update" instead of just disappearing — the outcome record
  // itself is still stale until someone actually changes it to On track.
  const flagged = agg.roster
    .filter((s) => s.status !== "On track" || latest.get(s.id)?.kind === "catchup")
    .sort((a, b) => a.rate - b.rate);

  // A "resolved" outcome that still leaves someone below the band (rare —
  // only possible if the plan didn't actually fix things, or a manual
  // override) falls back into "To contact" rather than vanishing from
  // every group: the decision was closed, but they still need a fresh one.
  const isToContact = (s: StudentAggregate) => !latest.has(s.id) || latest.get(s.id)?.kind === "resolved";

  const toContact = flagged.filter(isToContact).length;
  const onCatchup = flagged.filter((s) => latest.get(s.id)?.kind === "catchup" && s.missed > 0).length;
  const readyToUpdate = flagged.filter((s) => latest.get(s.id)?.kind === "catchup" && s.missed === 0).length;

  const groups: { key: string; title: string; roster: StudentAggregate[] }[] = [
    { key: "contact", title: "To contact", roster: flagged.filter(isToContact) },
    {
      key: "catchup",
      title: "On catch-up",
      roster: flagged.filter((s) => latest.get(s.id)?.kind === "catchup" && s.missed > 0),
    },
    {
      key: "ready",
      title: "Ready to update",
      roster: flagged.filter((s) => latest.get(s.id)?.kind === "catchup" && s.missed === 0),
    },
  ];

  const cardGrid = (roster: StudentAggregate[]) => (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
      {roster.map((student) => (
        <StudentCard
          key={student.id}
          student={student}
          cohortId={cohortId}
          cohortSlug={cohort.slug}
          lessonEvents={lessonEvents}
          latest={latest}
          bands={bands}
          canRecord={canRecord}
        />
      ))}
      {roster.length === 0 && (
        <Card className="col-span-full px-6 py-10 text-center text-sm text-ink-muted">Nobody in this group.</Card>
      )}
    </div>
  );

  const tabs: AttentionTab[] = [
    {
      key: "all",
      label: "All",
      count: flagged.length,
      content: (
        <div className="flex flex-col gap-5">
          {groups
            .filter((g) => g.roster.length > 0)
            .map((g) => (
              <div key={g.key} className="flex flex-col gap-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[15px] font-bold text-ink">{g.title}</h2>
                  <span className="text-xs font-semibold text-ink-muted tabular">{g.roster.length}</span>
                </div>
                {cardGrid(g.roster)}
              </div>
            ))}
          {flagged.length === 0 && (
            <Card className="px-6 py-10 text-center text-sm text-ink-muted">Nobody is below the band right now.</Card>
          )}
        </div>
      ),
    },
    ...groups.map((g) => ({ key: g.key, label: g.title, count: g.roster.length, content: cardGrid(g.roster) })),
  ];

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
        <StatCard
          label="Ready to update"
          value={readyToUpdate}
          icon={readyToUpdate > 0 ? ArrowsClockwise : undefined}
          tone="yellow"
        />
      </StatGrid>

      <AttentionTabs tabs={tabs} />

      <HowThisWorksCard />
    </div>
  );
}

function StudentCard({
  student,
  cohortId,
  cohortSlug,
  lessonEvents,
  latest,
  bands,
  canRecord,
}: {
  student: StudentAggregate;
  cohortId: string;
  cohortSlug: string;
  lessonEvents: LessonEventView[];
  latest: Map<string, Outcome>;
  bands: Bands;
  canRecord: boolean;
}) {
  const outcome = latest.get(student.id) ?? null;
  const sinceProgress = outcome?.kind === "catchup" ? attendanceSince(student.id, lessonEvents, outcome.recordedAt) : null;

  return (
    <AttentionCard
      cohortId={cohortId}
      cohortSlug={cohortSlug}
      student={student}
      outcome={outcome}
      sinceProgress={sinceProgress}
      bands={bands}
      lessonEvents={lessonEvents}
      canRecord={canRecord}
    />
  );
}
