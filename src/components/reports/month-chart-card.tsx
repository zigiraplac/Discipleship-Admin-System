import { Card } from "@/components/ui/card";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import type { Bands } from "@/lib/domain/types";
import { monthLabel, monthlyRatesFrom, type ReportLesson } from "./report-utils";

/** Every month the cohort has run — whole-cohort, independent of the
 * Month/Quarter/All selector. */
export function MonthChartCard({
  lessons,
  enrolled,
  bands,
}: {
  lessons: ReportLesson[];
  enrolled: number;
  bands: Bands;
}) {
  const monthly = monthlyRatesFrom(lessons, enrolled);

  return (
    <Card className="p-[18px]">
      <div className="text-[15px] font-bold text-ink">Month over month</div>
      <div className="mt-3.5 flex flex-col gap-2.5">
        {monthly.map((m) => (
          <div key={m.month} className="flex items-center gap-2.5">
            <div className="w-8 flex-none text-[11px] text-ink-tertiary">{monthLabel(m.month)}</div>
            <ProgressBar
              pct={m.rate}
              height={7}
              tone={toneForRate(m.rate, bands.activeThreshold, bands.helpThreshold)}
              className="flex-1"
            />
            <div className="w-9 flex-none text-right text-[12px] font-semibold text-ink tabular">{m.rate}%</div>
          </div>
        ))}
        {monthly.length === 0 && (
          <div className="text-xs text-ink-faint">No registers saved yet.</div>
        )}
      </div>
    </Card>
  );
}
