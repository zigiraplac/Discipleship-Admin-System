import { notFound } from "next/navigation";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { aggregateCohort } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { FollowUpBoard } from "@/components/followup/followup-board";
import { HowFollowUpWorksCard } from "@/components/followup/how-it-works-card";
import type { FollowUpEntry } from "@/components/followup/followup-list";
import type { StudentAggregate } from "@/lib/domain/types";

export default async function FollowUpPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("followup")) notFound();

  const supabase = await createClient();
  const [cohort, bands] = await Promise.all([getCohort(supabase, routeParam), getBands(supabase)]);
  if (!cohort) notFound();
  const cohortId = cohort.id;

  const [allStudents, lessonEvents, outcomes] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
  ]);

  // A student marked "left" is done being tracked here — same as before.
  const students = allStudents.filter((s) => !s.leftAt);
  const agg = aggregateCohort(students, lessonEvents, bands, todayISO());
  const latest = latestByStudent(outcomes);
  const canRecord = user.role === "facilitator" || user.role === "admin";

  // A "resolved" outcome that still leaves someone below the band (rare —
  // only possible if the plan didn't actually fix things, or a manual
  // override) falls back into Follow Up rather than vanishing: the
  // decision was closed, but they still need a fresh one. Anyone with a
  // live "catchup" outcome belongs on the Catch ups page instead.
  const isToContact = (s: StudentAggregate) => !latest.has(s.id) || latest.get(s.id)?.kind === "resolved";
  const entries: FollowUpEntry[] = agg.roster
    .filter((s) => s.status !== "On track" && isToContact(s))
    .sort((a, b) => a.rate - b.rate)
    .map((student) => ({ student, currentOutcomeKind: latest.get(student.id)?.kind ?? null }));

  const needsContact = entries.filter((e) => !e.student.contactedAt);
  const contactedAwaiting = entries.filter((e) => e.student.contactedAt);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Follow Up" subtitle={`${cohort.name} · ${entries.length} to follow up`} />

      <FollowUpBoard
        entries={entries}
        needsContact={needsContact}
        contactedAwaiting={contactedAwaiting}
        cohortId={cohortId}
        cohortSlug={cohort.slug}
        lessonEvents={lessonEvents}
        canRecord={canRecord}
      />

      <HowFollowUpWorksCard />
    </div>
  );
}
