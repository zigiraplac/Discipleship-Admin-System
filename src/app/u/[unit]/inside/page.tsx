import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHead } from "@/components/shell/page-head";
import { buttonVariants } from "@/components/ui/button";
import { LevelHeader } from "@/components/network/level-header";
import { ChildrenTable } from "@/components/network/level-tables";
import { AddChildDialog } from "@/components/network/add-child-dialog";
import { childrenLabelFor } from "@/components/shell/org-nav";
import { getAppointablePeople } from "@/lib/data/org";
import { loadChildRows, loadLevelPage, placeholderRows } from "@/lib/data/org-view";
import { placesNotSetUp } from "@/lib/geo/reference";
import { LEVELS, nextLevel } from "@/lib/domain/levels";

/** The levels (or cohorts) directly inside this one, as one table —
 * status, scale, who answers for it. Clicking a row opens its overview; Tapping a
 * card opens its overview; the leader adds, renames and removes them. */
export default async function LevelChildrenPage({
  params,
  searchParams,
}: {
  params: Promise<{ unit: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { unit: slug } = await params;
  const { unit, role, report, user } = await loadLevelPage(slug, searchParams);
  const isLeader = role === "leader";
  const [{ rows }, people] = await Promise.all([loadChildRows(report, user), isLeader ? getAppointablePeople() : Promise.resolve([])]);

  const label = childrenLabelFor(unit.type);
  const childType = nextLevel(unit.type);
  // Every official place that belongs here (continents, a continent's
  // countries, a country's regions), the ones not set up yet greyed out.
  const notSetUp = placeholderRows(
    placesNotSetUp(unit, report.children.flatMap((c) => (c.kind === "unit" ? [c.unit] : []))),
    childType === "cohort" ? "Cohort" : LEVELS[childType].label
  );
  const action = !isLeader ? null : childType === "cohort" ? (
    <Link href={`/cohorts/new?unit=${unit.slug}`} className={buttonVariants({ size: "sm", className: "gap-1.5" })}>
      <Plus size={15} />
      Add cohort
    </Link>
  ) : (
    <AddChildDialog parentId={unit.id} parentName={unit.name} childType={childType} people={people.map((p) => ({ id: p.id, name: p.name }))} />
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title={label} subtitle={unit.name} />
      <LevelHeader levelLabel={LEVELS[unit.type].label} partOf={report.ancestors.map((a) => a.name).join(" › ")} actions={action} />

      <ChildrenTable rows={[...rows, ...notSetUp]} childLabel={rows[0]?.levelLabel ?? LEVELS[childType === "cohort" ? "promotion" : childType].label} childPlural={label} canManage={isLeader} />
    </div>
  );
}
