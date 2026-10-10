import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople, getCohortScopesByUser } from "@/lib/data/people";
import { listCohorts } from "@/lib/data/cohorts";
import { PageHead } from "@/components/shell/page-head";
import { PeopleTable } from "@/components/settings/people-table";
import { AddPersonDialog } from "@/components/settings/add-person-dialog";
import type { LevelRole } from "@/components/settings/level-roles";
import { getAllUnits, getUnitMembers } from "@/lib/data/org";
import { LEVELS } from "@/lib/domain/levels";

/** Admin-only. `requireRole` throws a plain Error for the wrong role, which
 * would surface as a raw error page — so we read the user ourselves and
 * render Next's real 404 instead. */
export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();

  const supabase = await createClient();
  const [people, scopesByUser, cohorts, units, unitMembers] = await Promise.all([
    getPeople(supabase),
    getCohortScopesByUser(supabase),
    listCohorts(supabase),
    getAllUnits(),
    getUnitMembers(),
  ]);
  // Where each person sits, shown read-only — staff are appointed and moved
  // on each level's own Staff page, and its rules live on its Settings page.
  const unitById = new Map(units.map((u) => [u.id, u]));
  const levelRolesByUser = new Map<string, LevelRole[]>();
  for (const [unitId, members] of unitMembers) {
    const unit = unitById.get(unitId);
    if (!unit) continue;
    for (const m of members) {
      levelRolesByUser.set(m.userId, [
        ...(levelRolesByUser.get(m.userId) ?? []),
        { unitId, unitName: unit.name, levelLabel: LEVELS[unit.type].label, role: m.role },
      ]);
    }
  }
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Accounts" subtitle="Everyone who can sign in" />
      <PeopleTable
        people={people}
        scopesByUser={scopesByUser}
        cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))}
        currentUserId={user.id}
        levelRolesByUser={Object.fromEntries(levelRolesByUser)}
        headerAction={<AddPersonDialog cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))} />}
      />
    </div>
  );
}
