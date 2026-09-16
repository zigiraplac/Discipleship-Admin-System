import { notFound } from "next/navigation";
import { requireUser, NAV_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCohort } from "@/lib/data/cohorts";
import { getCrusadeEvents } from "@/lib/data/lessons";
import { getCrusadeReports } from "@/lib/data/crusades";
import { getAuditLogForCohort } from "@/lib/data/audit";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { CrusadesTable } from "@/components/crusades/crusades-table";
import { WhatsChangedCard } from "@/components/shared/whats-changed-card";

/**
 * Crusade weekends used to only surface inside Reports, nested alongside
 * unrelated attendance charts — this is their own home: see every weekend
 * at a glance, mark one done (a report) or postponed, from one place.
 */
export default async function CrusadesPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("crusades")) notFound();

  const supabase = await createClient();
  const cohort = await getCohort(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;

  const [crusadeEvents, reportsByAfterClass, majorChanges] = await Promise.all([
    getCrusadeEvents(supabase, cohortId),
    getCrusadeReports(supabase, cohortId),
    getAuditLogForCohort(createAdminClient(), cohortId),
  ]);
  const crusadeChanges = majorChanges.filter((c) => c.changeKind === "crusade");

  const canRecord = user.role === "facilitator" || user.role === "admin";
  const today = todayISO();

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Crusades" subtitle={`${cohort.name} · weekend outreach after each class`} />
      <CrusadesTable
        cohortId={cohortId}
        crusadeEvents={crusadeEvents}
        reportsByAfterClass={reportsByAfterClass}
        canRecord={canRecord}
        today={today}
      />
      <WhatsChangedCard
        changes={crusadeChanges}
        title="Postponement history"
        subtitle="Crusade weekends that were pushed back, and why"
        emptyLabel="No crusade weekend has been postponed here."
      />
    </div>
  );
}
