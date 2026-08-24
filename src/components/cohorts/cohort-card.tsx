import Link from "next/link";
import { Card } from "@/components/ui/card";
import { HealthPill, Pill } from "@/components/ui/pill";
import { CompletionRing } from "@/components/ui/completion-ring";
import { buttonVariants } from "@/components/ui/button";
import { lessonAt, TOTAL_LESSONS } from "@/lib/domain/curriculum";
import { cn } from "@/lib/utils";
import type { Cohort } from "@/lib/domain/types";
import type { CohortAggregate } from "@/lib/domain/metrics";

/** One tile in the Cohorts grid. `agg` is `aggregateCohort(...)` run
 * against that cohort's own students + lesson events — it already carries
 * enrolled/rate/atRisk/health/classIndex/recordedCount in one shape.
 * `paceGap` is `computePace(...)`'s gap: positive = behind, 0/negative =
 * on or ahead of this cohort's own ideal plan. */
export function CohortCard({
  cohort,
  agg,
  paceGap,
}: {
  cohort: Cohort;
  agg: CohortAggregate;
  paceGap: number;
}) {
  const pct = (agg.recordedCount / TOTAL_LESSONS) * 100;
  const current = agg.recordedCount < TOTAL_LESSONS ? lessonAt(agg.recordedCount) : null;

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

      <div className="flex items-center justify-between gap-2 rounded-[9px] bg-subtle px-3 py-2">
        <span className="min-w-0 truncate text-xs text-ink-secondary">
          {current ? (
            <>
              Now at <span className="font-semibold text-ink tabular">{current.ref}</span>
            </>
          ) : (
            <span className="font-semibold text-ink">Curriculum complete</span>
          )}
        </span>
        <Pill tone={paceGap > 0 ? "magenta" : "cyan"} className="flex-none">
          {paceGap > 0 ? `${paceGap} behind` : "On pace"}
        </Pill>
      </div>

      <div className="flex items-center gap-3">
        <CompletionRing pct={pct} tone="cyan" size={56} strokeWidth={5}>
          <span className="text-[12px] font-bold text-ink tabular">{Math.round(pct)}%</span>
        </CompletionRing>
        <div className="min-w-0">
          <div className="text-xs text-ink-muted">Class {agg.classIndex + 1} of 7</div>
          <div className="text-[13px] font-semibold text-ink tabular">
            {agg.recordedCount}/{TOTAL_LESSONS} lessons
          </div>
        </div>
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
