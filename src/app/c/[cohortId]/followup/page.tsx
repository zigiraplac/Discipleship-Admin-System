import { cohortCapabilities } from "@/lib/authz";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCohortPeople } from "@/lib/data/people";
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
  await requireUser();

  const supabase = await createClient();
  const [cohort, bands] = await getCohortWithBands(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_followups")) notFound();

  // The cohort lookup above went through RLS, so this viewer has access to the
  // cohort; the people list itself needs the service role because
  // facilitators can't list each other.
  const [allStudents, lessonEvents, outcomes, people] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
    getOutcomesForCohort(supabase, cohortId),
    getCohortPeople(createAdminClient(), cohortId),
  ]);

  const agg = aggregateCohort(allStudents, lessonEvents, bands, todayISO());
  const latest = latestByStudent(outcomes);
  const canRecord = caps.has("manage_followups");

  // A "resolved" outcome that still leaves someone below the band (rare —
  // only possible if the plan didn't actually fix things, or a manual
  // override) falls back into Follow Up rather than vanishing: the
  // decision was closed, but they still need a fresh one. Anyone with a
  // live "catchup" outcome belongs on the Catch ups page instead.
  const isToContact = (s: StudentAggregate) => !latest.has(s.id) || latest.get(s.id)?.kind === "resolved";
  // A student who has left is done being tracked here.
  const entries: FollowUpEntry[] = agg.roster
    .filter((s) => !s.leftAt && s.performance !== "On track" && s.performance !== "Not started" && isToContact(s))
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
        people={people}
      />

      <HowFollowUpWorksCard />
    </div>
  );
}
