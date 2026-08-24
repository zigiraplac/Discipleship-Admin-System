import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { HealthPill, Pill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { CURRICULUM, lessonAt, TOTAL_LESSONS } from "@/lib/domain/curriculum";
import { cn } from "@/lib/utils";
import type { Cohort, Bands } from "@/lib/domain/types";
import type { CohortAggregate, MonthlyRate, PaceStatus } from "@/lib/domain/metrics";

export interface CohortOverviewRow {
  cohort: Cohort;
  agg: CohortAggregate;
  monthly: MonthlyRate[];
  pace: PaceStatus;
}

/** Cross-cohort "executive" summary — sits above the Cohorts card grid so
 * admin/leadership/facilitator can compare cohorts without clicking into
 * each one. Only worth showing when there's more than one cohort visible:
 * a single-cohort "comparison" is noise, so the caller skips rendering
 * this entirely in that case (see cohorts/page.tsx). */
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

      <Card className="overflow-hidden">
        <div className="px-[18px] pt-4 pb-3.5 text-[15px] font-bold text-ink">By cohort</div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px] flex flex-col">
            {rows.map(({ cohort, agg, monthly, pace }) => (
              <CohortRow key={cohort.id} cohort={cohort} agg={agg} monthly={monthly} pace={pace} bands={bands} />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function CohortRow({
  cohort,
  agg,
  monthly,
  pace,
  bands,
}: {
  cohort: Cohort;
  agg: CohortAggregate;
  monthly: MonthlyRate[];
  pace: PaceStatus;
  bands: Bands;
}) {
  const tone = toneForRate(agg.rate, bands.activeThreshold, bands.helpThreshold);
  const recent = monthly.slice(-4);
  const delta =
    monthly.length >= 2 ? monthly[monthly.length - 1].rate - monthly[monthly.length - 2].rate : null;
  const current = agg.recordedCount < TOTAL_LESSONS ? lessonAt(agg.recordedCount) : null;

  return (
    <div className="flex items-center gap-4 border-t border-divider px-[18px] py-3 first:border-t-0">
      <div className="min-w-0 flex-[1.4]">
        <Link href={`/c/${cohort.id}`} className="truncate text-[13px] font-semibold text-ink hover:underline">
          {cohort.name}
        </Link>
        <div className="truncate text-[11px] text-ink-muted">{cohort.city ?? "—"}</div>
      </div>

      <HealthPill health={agg.health} className="flex-none" />

      <div className="w-[110px] flex-none">
        <div className="mb-1 text-[13px] font-semibold text-ink tabular">{agg.rate}%</div>
        <ProgressBar pct={agg.recordedCount ? agg.rate : null} tone={tone} />
      </div>

      <div className="w-[110px] flex-none">
        <div className="text-[12px] text-ink-muted">
          {current ? current.ref : `Class ${agg.classIndex + 1} of ${CURRICULUM.length}`}
        </div>
        <Pill tone={pace.gap > 0 ? "magenta" : "cyan"} className="mt-1">
          {pace.gap > 0 ? `${pace.gap} behind` : "On pace"}
        </Pill>
      </div>

      <div className="w-[130px] flex-none">
        <div className="flex h-6 items-end gap-[3px]">
          {recent.map((m) => (
            <div
              key={m.month}
              className="flex-1 rounded-t-[2px]"
              style={{ height: `${Math.max(8, m.rate)}%`, background: "var(--color-accent-300)" }}
              title={`${m.month}: ${m.rate}%`}
            />
          ))}
          {recent.length === 0 && <div className="text-[11px] text-ink-faint">No data</div>}
        </div>
        <div
          className={cn(
            "mt-1 text-[11px] tabular",
            delta == null ? "text-ink-faint" : delta >= 0 ? "text-accent-700" : "text-accent-2-700"
          )}
        >
          {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta}% vs last month`}
        </div>
      </div>
    </div>
  );
}
