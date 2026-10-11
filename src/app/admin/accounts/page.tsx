import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/shell/page-head";
import { AddPersonDialog } from "@/components/settings/add-person-dialog";
import { AccountsConsole } from "@/components/admin/accounts-console";
import type { LevelRole } from "@/components/settings/level-roles";
import { loadConsole } from "@/lib/data/admin-console";
import { LEVELS } from "@/lib/domain/levels";

/** Every account in the world, by continent and country. Creating, editing
 * and removing accounts keep their own checks (lib/actions/people).
 * TODO(permissions): the page itself is open to every signed-in user for now. */
export default async function ConsoleAccountsPage() {
  const user = await requireUser();
  const { people, scopesByUser, unitMembers, byId, facts, placesByUser } = await loadConsole();

  const levelRolesByUser = new Map<string, LevelRole[]>();
  for (const [unitId, members] of unitMembers) {
    const unit = byId.get(unitId);
    if (!unit) continue;
    for (const m of members) {
      levelRolesByUser.set(m.userId, [
        ...(levelRolesByUser.get(m.userId) ?? []),
        { unitId, unitName: unit.name, levelLabel: LEVELS[unit.type].label, role: m.role },
      ]);
    }
  }
  const cohorts = facts.map((f) => ({ id: f.cohortId, name: f.name.trim() })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Accounts" subtitle="Everyone who can sign in, worldwide" />
      <AccountsConsole
        people={people}
        placesByUser={Object.fromEntries(placesByUser)}
        scopesByUser={scopesByUser}
        cohorts={cohorts}
        currentUserId={user.id}
        levelRolesByUser={Object.fromEntries(levelRolesByUser)}
        headerAction={<AddPersonDialog cohorts={cohorts} />}
      />
    </div>
  );
}
