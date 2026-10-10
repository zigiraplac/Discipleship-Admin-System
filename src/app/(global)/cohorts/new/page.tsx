import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/shell/page-head";
import { NewCohortWizard } from "@/components/wizard/new-cohort-wizard";
import { getAllUnits, getMyUnitRoles } from "@/lib/data/org";

/**
 * Creating a cohort: admin anywhere, or a promotion's manager / its church
 * leader inside that promotion (createCohort re-checks this on the server).
 * Everyone else gets a 404, as before. `?unit=<promotion slug>` pre-selects
 * the promotion when arriving from its "Add cohort" button.
 */
export default async function NewCohortPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [units, myUnits, sp] = await Promise.all([getAllUnits(), getMyUnitRoles(user), searchParams]);
  const byId = new Map(units.map((u) => [u.id, u]));
  const isAdmin = user.role === "admin";

  const led = new Set(myUnits.filter((r) => r.role === "leader").map((r) => r.unit.id));
  const promotions = units.filter(
    (u) => u.type === "promotion" && (isAdmin || led.has(u.id) || (u.parentId != null && led.has(u.parentId)))
  );
  if (!isAdmin && !promotions.length) notFound();

  const placements = promotions
    .map((p) => ({ id: p.id, label: `${p.parentId ? `${byId.get(p.parentId)?.name} › ` : ""}${p.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const wanted = Array.isArray(sp.unit) ? sp.unit[0] : sp.unit;
  const initial = promotions.find((p) => p.slug === wanted)?.id ?? (placements.length === 1 ? placements[0].id : null);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="New cohort" subtitle="Import students, set the days, generate the schedule." />
      <NewCohortWizard placements={placements} initialPlacementId={initial} requirePlacement={!isAdmin} />
    </div>
  );
}
