import Link from "next/link";
import { Card } from "@/components/ui/card";
import { HealthPill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Cohort } from "@/lib/domain/types";
import type { CohortAggregate } from "@/lib/domain/metrics";

/** One tile in the Cohorts grid. `agg` is `aggregateCohort(...)` run
 * against that cohort's own students + lesson events — it already carries
 * enrolled/rate/atRisk/health/classIndex/recordedCount in one shape. */
export function CohortCard({ cohort, agg }: { cohort: Cohort; agg: CohortAggregate }) {
  const pct = (agg.recordedCount / 80) * 100;

  return (
    <Card className="flex flex-col gap-4 p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold text-ink">{cohort.name}</div>
          <div className="mt-0.5 truncate text-xs text-ink-muted">
            {cohort.city ?? "—"} · {cohort.facilitatorName ?? "Unassigned"}
          </div>
        </div>
        <HealthPill health={agg.health} className="flex-none" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Figure value={agg.enrolled} caption="Students" />
        <Figure value={`${agg.rate}%`} caption="Attendance" />
        <Figure value={agg.atRisk} caption="Need help" />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
          <span>Class {agg.classIndex + 1} of 7</span>
          <span className="tabular">{agg.recordedCount}/80</span>
        </div>
        <ProgressBar pct={pct} tone="cyan" />
      </div>

      <Link href={`/c/${cohort.id}`} className={cn(buttonVariants({ variant: "outlineAccent" }), "w-full")}>
        Open cohort
      </Link>
    </Card>
  );
}

function Figure({ value, caption }: { value: React.ReactNode; caption: string }) {
  return (
    <div>
      <div className="text-[19px] font-bold leading-none text-ink tabular">{value}</div>
      <div className="mt-1 text-[11px] text-ink-muted">{caption}</div>
    </div>
  );
}
