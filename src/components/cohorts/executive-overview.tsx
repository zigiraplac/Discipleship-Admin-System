import { StatCard, StatGrid } from "@/components/ui/stat-card";
import type { Bands, Cohort } from "@/lib/domain/types";
import type { CohortAggregate, PaceStatus } from "@/lib/domain/metrics";

export interface CohortOverviewRow {
  cohort: Cohort;
  agg: CohortAggregate;
  pace: PaceStatus;
}

/** Cross-cohort "executive" summary — sits above the Cohorts card grid so
 * admin/leadership/facilitator can compare cohorts without clicking into
 * each one. Only worth showing when there's more than one cohort visible:
 * a single-cohort "comparison" is noise, so the caller skips rendering
 * this entirely in that case (see cohorts/page.tsx).
 *
 * Used to also render a dense "By cohort" table below these stat cards,
 * repeating the same name/health/attendance/current-class/pace figures the
 * `CohortCard` grid right below this component already shows, just in a
 * different shape — removed as pure duplication, not a loss of detail. */
export function ExecutiveOverview({ rows, bands }: { rows: CohortOverviewRow[]; bands: Bands }) {
  if (rows.length <= 1) return null;

  const totalEnrolled = rows.reduce((a, r) => a + r.agg.enrolled, 0);
  const totalAtRisk = rows.reduce((a, r) => a + r.agg.atRisk, 0);
  const weightedRate = totalEnrolled
    ? Math.round(rows.reduce((a, r) => a + r.agg.rate * r.agg.enrolled, 0) / totalEnrolled)
    : null;

  const healthCounts = { Healthy: 0, Watch: 0, "Needs work": 0 } as Record<
    CohortAggregate["health"],
    number
  >;
  for (const r of rows) healthCounts[r.agg.health]++;
  const healthSub = (["Healthy", "Watch", "Needs work"] as const)
    .filter((h) => h !== "Healthy")
    .map((h) => `${healthCounts[h]} ${h.toLowerCase()}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[15px] font-bold text-ink">Overview</div>
        <div className="mt-0.5 text-xs text-ink-muted">Trends across all {rows.length} cohorts you can see.</div>
      </div>

      <StatGrid>
        <StatCard label="Total students" value={totalEnrolled} sub="across all cohorts" />
        <StatCard
          label="Overall attendance"
          value={weightedRate != null ? `${weightedRate}%` : "—"}
          sub={`target ${bands.activeThreshold}%`}
        />
        <StatCard label="Need attention" value={totalAtRisk} sub="students, all cohorts" />
        <StatCard label="Healthy cohorts" value={`${healthCounts.Healthy} healthy`} sub={healthSub || "—"} />
      </StatGrid>
    </div>
  );
}
