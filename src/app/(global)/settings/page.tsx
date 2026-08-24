import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople, getCohortScopesByUser } from "@/lib/data/people";
import { getBands, listCohorts } from "@/lib/data/cohorts";
import { PageHead } from "@/components/shell/page-head";
import { PeopleTable } from "@/components/settings/people-table";
import { BandsForm } from "@/components/settings/bands-form";
import { AddPersonDialog } from "@/components/settings/add-person-dialog";

/** Admin-only. `requireRole` throws a plain Error for the wrong role, which
 * would surface as a raw error page — so we read the user ourselves and
 * render Next's real 404 instead. */
export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();

  const supabase = await createClient();
  const [people, scopesByUser, bands, cohorts] = await Promise.all([
    getPeople(supabase),
    getCohortScopesByUser(supabase),
    getBands(supabase),
    listCohorts(supabase),
  ]);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Settings" subtitle="Roles and thresholds" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PeopleTable
          people={people}
          scopesByUser={scopesByUser}
          headerAction={<AddPersonDialog cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))} />}
        />
        <BandsForm bands={bands} />
      </div>
    </div>
  );
}
