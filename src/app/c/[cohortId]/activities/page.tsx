import { cohortCapabilities } from "@/lib/authz";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCohort } from "@/lib/data/cohorts";
import { getCrusadeEvents } from "@/lib/data/lessons";
import { getCrusadeReports } from "@/lib/data/crusades";
import { getActivities } from "@/lib/data/activities";
import { getAuditLogForCohort } from "@/lib/data/audit";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { CrusadesTable } from "@/components/crusades/crusades-table";
import { ActivitiesView } from "@/components/activities/activities-view";
import { WhatsChangedCard } from "@/components/shared/whats-changed-card";

/**
 * Everything a cohort does besides lessons: its crusade weekends (dated by
 * the schedule) and its occasional activities — agape, fellowship, or any
 * kind it adds — each dated by hand.
 */
export default async function ActivitiesPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  await requireUser();

  const supabase = await createClient();
  const cohort = await getCohort(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_cohort")) notFound();

  const [crusadeEvents, reportsByAfterClass, activities, majorChanges] = await Promise.all([
    getCrusadeEvents(supabase, cohortId),
    getCrusadeReports(supabase, cohortId),
    getActivities(supabase, cohortId),
    getAuditLogForCohort(createAdminClient(), cohortId),
  ]);
  const crusadeChanges = majorChanges.filter((c) => c.changeKind === "crusade");

  const canEdit = caps.has("record_crusade");
  const today = todayISO();

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Activities" subtitle={cohort.name} />
      <ActivitiesView
        cohortId={cohortId}
        activities={activities}
        canEdit={canEdit}
        today={today}
        crusades={
          <>
            <CrusadesTable
              cohortId={cohortId}
              crusadeEvents={crusadeEvents}
              reportsByAfterClass={reportsByAfterClass}
              canRecord={canEdit}
              today={today}
            />
            <WhatsChangedCard
              changes={crusadeChanges}
              title="Postponement history"
              subtitle="Crusade weekends that were pushed back, and why"
              emptyLabel="No crusade weekend has been postponed here."
            />
          </>
        }
      />
    </div>
  );
}
