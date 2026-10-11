import { PageHead } from "@/components/shell/page-head";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { LevelHeader } from "@/components/network/level-header";
import { ChildComparison } from "@/components/network/child-comparison";
import { GrowthLines } from "@/components/network/growth-lines";
import { MetricRow } from "@/components/network/metric-card";
import { ChildrenTable } from "@/components/network/level-tables";
import { UnitStatusBadge } from "@/components/network/status-ui";
import { UpcomingEventsCard } from "@/components/shared/upcoming-events";
import { childrenLabelFor, unitHref } from "@/components/shell/org-nav";
import { childComparison, childGrowth, crusadesThisMonth, levelMetrics, loadChildRows, loadLevelPage, promotionMetrics } from "@/lib/data/org-view";
import { LEVELS } from "@/lib/domain/levels";
import { managementStatus, statusLabel } from "@/lib/domain/status";
import type { OrgUnitType } from "@/lib/domain/types";

/**
 * A management view of the leader's own scope, the same at every level
 * (HQ → promotion): how many students we reach, how many are active, how
 * many graduated, who serves them — how the direct children compare in
 * size, and how the level has grown (a promotion shows its cohorts' crusades
 * this month in place of growth). How each child is doing, and who answers for it, is the
 * children menu (Continents, Countries, … Cohorts). Operational measures
 * (attendance, registers, at-risk students) live on the cohort dashboard.
 */
export default async function LevelOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ unit: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { unit: slug } = await params;
  const { unit, report, period, totals: t, user } = await loadLevelPage(slug, searchParams);
  const { rows, bands, staffCounts } = await loadChildRows(report, user);
  const own = managementStatus(report.facts, report.today, bands);
  const childWord = unit.type === "promotion" ? "cohort" : LEVELS[NEXT[unit.type]].label.toLowerCase();
  // A promotion shows what's coming up in its cohorts instead of the growth chart.
  const crusades = unit.type === "promotion" ? await crusadesThisMonth(report, user) : null;
  const monthName = new Date(`${report.today.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

  const card = (title: React.ReactNode, body: React.ReactNode, action?: React.ReactNode) => (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex-1">{title}</CardTitle>
        {action}
      </CardHeader>
      <div className="px-[18px] py-3.5">{body}</div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title={unit.name} subtitle={`${LEVELS[unit.type].label} overview`} />
      <LevelHeader
        levelLabel={LEVELS[unit.type].label}
        period={period}
        actions={<UnitStatusBadge status={own.status} label={statusLabel(own.status, t.active)} />}
      />

      {/* Reach, current activity, outcomes and capacity. */}
      <MetricRow
        metrics={
          crusades
            ? promotionMetrics(report, period, staffCounts.get(unit.id) ?? 0, crusades.upcoming, monthName)
            : levelMetrics(report, period, staffCounts.get(unit.id) ?? 0)
        }
      />

      {/* How do the direct children compare now, and are we growing? How are the people serving spread? */}
      {/* Side by side on wide screens, stacked on narrow ones. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {card(`Students By ${childWord}`, <ChildComparison items={childComparison(report)} />, <span className="text-[11px] text-ink-muted">Active students now</span>)}
        {crusades ? (
          <UpcomingEventsCard
            title="Upcoming events"
            subtitle={`Crusades in this promotion's cohorts · ${monthName}`}
            rows={crusades.rows}
            emptyLabel={`No more crusades in ${monthName}.`}
          />
        ) : (
          card(`Student Growth By ${childWord}`, <GrowthLines {...childGrowth(report)} />, <span className="text-[11px] text-ink-muted">Month by month</span>)
        )}
      </div>
      {/* The children most in need of attention; the rest are one click away.
          A promotion's cohorts are in its Cohorts menu instead. */}
      {unit.type !== "promotion" && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex-1">{childrenLabelFor(unit.type)}</CardTitle>
            <span className="text-[11px] text-ink-muted">Most in need of attention first</span>
          </CardHeader>
          <ChildrenTable
            rows={rows}
            childLabel={LEVELS[NEXT[unit.type]].label}
            childPlural={childrenLabelFor(unit.type)}
            limit={5}
            viewAllHref={unitHref(unit.slug, "children")}
          />
        </Card>
      )}
    </div>
  );
}

const NEXT: Record<OrgUnitType, OrgUnitType> = { hq: "continent", continent: "country", country: "region", region: "site", site: "promotion", promotion: "promotion" };
