import { PageHead } from "@/components/shell/page-head";
import { LevelHeader } from "@/components/network/level-header";
import { StaffTable, type BoxOption, type StaffRow } from "@/components/network/staff-table";
import { getAllUnits, getAppointablePeople, getBranchStaff, getCohortStaff, getUnitLeaderContacts } from "@/lib/data/org";
import { listCohortsInUnits } from "@/lib/data/cohorts";
import { createAdminClient } from "@/lib/supabase/admin";
import { CohortStaffManager, type CohortStaffGroup } from "@/components/network/cohort-staff-manager";
import { cohortStewardOf, stewardOf } from "@/lib/domain/responsibility";
import { loadLevelPage } from "@/lib/data/org-view";
import { ancestryOf, descendantsOf, LEVELS, levelRank } from "@/lib/domain/levels";
import { AppointmentsDialog, StaffDirectory, type DirectoryRow, type StaffAssignment } from "@/components/network/staff-directory";
import type { OrgUnitType } from "@/lib/domain/types";

/** The people below this level:
 *  - the page: everyone serving inside it (level leaders and viewers,
 *    cohort facilitators and teachers), split by direct child, with what
 *    each is responsible for. Never this level's own staff or anyone above.
 *  - Appointments (a popup from the header): the staff this level itself
 *    appoints — its direct children's leaders and viewers (and any
 *    unstaffed level below it manages), and the cohort staff it is
 *    responsible for. */
export default async function LevelStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ unit: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { unit: slug } = await params;
  const { unit, role } = await loadLevelPage(slug, searchParams);
  const isLeader = role === "leader";
  const [units, branchStaff, people_, leaders] = await Promise.all([
    getAllUnits(),
    getBranchStaff(unit),
    isLeader ? getAppointablePeople() : Promise.resolve([]),
    getUnitLeaderContacts(),
  ]);

  const byId = new Map(units.map((u) => [u.id, u]));
  const hasLeader = (id: string) => (leaders.get(id)?.length ?? 0) > 0;
  // A level staffs the levels it oversees (stewardOf): its direct children,
  // and further down wherever nobody is appointed in between. Its own staff
  // are decided by the level above.
  const inScope = (id: string) => {
    const u = byId.get(id);
    return !!u && stewardOf(u, byId, hasLeader) === unit.id;
  };
  const staff = branchStaff.filter((s) => inScope(s.unitId));
  const depth = unit.path.split(".").length;
  const pathBetween = (id: string) =>
    ancestryOf(byId.get(id)!, units)
      .slice(depth, -1)
      .map((u) => u.name)
      .join(" › ");

  const rows: StaffRow[] = staff
    .map((s) => {
      const box = byId.get(s.unitId)!;
      return { ...s, unitName: box.name, levelLabel: LEVELS[box.type].label, path: pathBetween(s.unitId) };
    })
    .sort(
      (a, b) =>
        levelRank(byId.get(a.unitId)!.type) - levelRank(byId.get(b.unitId)!.type) ||
        a.unitName.localeCompare(b.unitName) ||
        a.name.localeCompare(b.name)
    );

  const boxes: BoxOption[] = descendantsOf(unit, units)
    .filter((u) => inScope(u.id))
    .sort((a, b) => levelRank(a.type) - levelRank(b.type) || a.name.localeCompare(b.name))
    .map((u) => ({ id: u.id, label: [pathBetween(u.id), u.name].filter(Boolean).join(" › "), levelLabel: LEVELS[u.type].label }));

  // Cohort staff: the cohorts whose facilitators and teachers this level
  // assigns — its own (promotion), or, as a fallback, those whose promotion
  // and church (…) have no leader. Said on screen when it's a fallback.
  const cohorts = await listCohortsInUnits(createAdminClient(), [unit.id, ...descendantsOf(unit, units).map((u) => u.id)]);
  const stewarded = cohorts
    .map((c) => ({ c, s: c.orgUnitId ? cohortStewardOf(c.orgUnitId, byId, hasLeader) : null }))
    .filter((x) => x.s?.stewardId === unit.id);
  // Every cohort below this level, for the directory; the stewarded ones also for appointments.
  const cohortStaff = await getCohortStaff(cohorts.map((c) => c.id));
  const groups: CohortStaffGroup[] = stewarded.map(({ c, s }) => {
    const home = c.orgUnitId ? byId.get(c.orgUnitId) : undefined;
    const gap = s!.skipped.filter((u) => u.id !== unit.id).map((u) => u.name);
    return {
      id: c.id,
      name: c.name.trim(),
      where: home ? [pathBetween(home.id), home.id === unit.id ? "" : home.name].filter(Boolean).join(" › ") || unit.name : unit.name,
      managedBecause: gap.length
        ? `managed here because ${gap.length > 1 ? `${gap.slice(0, -1).join(", ")} and ${gap.at(-1)}` : gap[0]} ${gap.length === 1 ? "has" : "have"} no leader`
        : null,
      staff: (cohortStaff.get(c.id) ?? []).sort((a, b) => a.capacity.localeCompare(b.capacity) || a.name.localeCompare(b.name)),
    };
  });
  const canManageCohortStaff = isLeader;
  const cohortPeople = canManageCohortStaff ? people_ : [];

  // ── All staff: everyone below this level, split by direct child ──
  const unitByIdChild = (id: string) => ancestryOf(byId.get(id)!, units)[depth];
  const whereOf = (u: { id: string; type: keyof typeof LEVELS }, child: { id: string }) =>
    [LEVELS[u.type].label, u.id === child.id ? "" : pathBelow(u.id, child.id)].filter(Boolean).join(" · ");
  const pathBelow = (id: string, childId: string) => {
    const chain = ancestryOf(byId.get(id)!, units);
    return chain.slice(chain.findIndex((u) => u.id === childId), -1).map((u) => u.name).join(" › ");
  };
  const people = new Map<string, DirectoryRow>();
  const addTo = (key: { userId: string; name: string; email: string; state: DirectoryRow["state"] }, group: { id: string; name: string }, a: StaffAssignment) => {
    const k = `${group.id}:${key.userId}`;
    const row = people.get(k) ?? { ...key, groupId: group.id, groupName: group.name, assignments: [] };
    row.assignments.push(a);
    people.set(k, row);
  };
  for (const s of branchStaff) {
    const box = byId.get(s.unitId);
    const child = box && unitByIdChild(box.id);
    if (!box || !child) continue;
    addTo(s, child, { role: s.role === "leader" ? "Leader" : "Viewer", place: box.name, where: whereOf(box, child) });
  }
  for (const c of cohorts) {
    const home = c.orgUnitId ? byId.get(c.orgUnitId) : undefined;
    if (!home) continue;
    // A promotion's cohorts are its direct children; deeper ones fall under the child that holds them.
    const group = home.id === unit.id ? { id: c.id, name: c.name.trim() } : unitByIdChild(home.id);
    const where = home.id === unit.id ? "Cohort" : ["Cohort", [pathBelow(home.id, group.id), home.id === group.id ? "" : home.name].filter(Boolean).join(" › ")].filter(Boolean).join(" · ");
    for (const m of cohortStaff.get(c.id) ?? []) {
      addTo(m, group, { role: m.capacity === "facilitator" ? "Facilitator" : "Teacher", place: c.name.trim(), where });
    }
  }
  const directory = [...people.values()];
  // Every direct child — a promotion's cohorts, otherwise the levels just
  // below — so a place with nobody serving still shows as a gap.
  const places =
    unit.type === "promotion"
      ? cohorts.filter((c) => c.orgUnitId === unit.id).map((c) => ({ id: c.id, name: c.name.trim() }))
      : units.filter((u) => u.parentId === unit.id).map((u) => ({ id: u.id, name: u.name }));
  const groupLabel = unit.type === "promotion" ? "Cohort" : LEVELS[NEXT[unit.type]].label;

  const gaps = boxes.filter((b) => !rows.some((r) => r.unitId === b.id)).length + groups.filter((g) => !g.staff.length).length;
  const appointments =
    rows.length > 0 || boxes.length > 0 || groups.length > 0 ? (
      <div className="flex flex-col gap-[18px]">
        {(rows.length > 0 || boxes.length > 0) && <StaffTable rows={rows} boxes={boxes} people={people_} canManage={isLeader} />}
        {groups.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-ink">Cohort staff</h2>
              <p className="text-[12px] text-ink-muted">
                {groups.length} {groups.length === 1 ? "cohort" : "cohorts"}
                {groups.some((g) => !g.staff.length) ? <span className="text-yellow-ink"> · {groups.filter((g) => !g.staff.length).length} without staff</span> : null}
              </p>
            </div>
            <CohortStaffManager groups={groups} people={cohortPeople} canManage={canManageCohortStaff} />
          </section>
        )}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Staff" subtitle={unit.name} />
      <LevelHeader
        levelLabel={LEVELS[unit.type].label}
        actions={
          appointments && (
            <AppointmentsDialog gaps={gaps} levelLabel={LEVELS[unit.type].label}>
              {appointments}
            </AppointmentsDialog>
          )
        }
      />
      <StaffDirectory rows={directory} groupLabel={groupLabel} places={places} />
    </div>
  );
}

const NEXT: Record<OrgUnitType, OrgUnitType> = { hq: "continent", continent: "country", country: "region", region: "site", site: "promotion", promotion: "promotion" };
