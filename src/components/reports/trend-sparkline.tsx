import { cn } from "@/lib/utils";
import { toneForRate, type BarTone } from "@/components/ui/progress-bar";
import type { Bands } from "@/lib/domain/types";
import { monthlyRatesFrom, monthLabel, type ReportLesson } from "./report-utils";

const FILL_CLASSES: Record<BarTone, string> = {
  cyan: "bg-accent",
  yellow: "bg-yellow",
  magenta: "bg-accent-2-500",
  grey: "bg-neutral-border",
};

const HEIGHT = 22;

/** A compact month-by-month trend strip for the Attendance stat card —
 * deliberately not full-history detail (that's `MonthChartCard`, further
 * down the page); this is a glance-only "is it heading the right way,"
 * always the full history regardless of the Month/Quarter/All toggle
 * above it (same scope `MonthChartCard` already uses). */
export function TrendSparkline({
  lessons,
  enrolled,
  bands,
}: {
  lessons: ReportLesson[];
  enrolled: number;
  bands: Bands;
}) {
  const months = monthlyRatesFrom(lessons, enrolled);
  if (months.length < 2) return null;

  return (
    <div className="flex items-end gap-[3px]" style={{ height: HEIGHT }} title="Attendance by month">
      {months.map((m) => (
        <div
          key={m.month}
          className={cn("w-[5px] flex-none rounded-[1.5px]", FILL_CLASSES[toneForRate(m.rate, bands.activeThreshold, bands.helpThreshold)])}
          style={{ height: Math.max(2, (m.rate / 100) * HEIGHT) }}
          title={`${monthLabel(m.month)}: ${m.rate}%`}
        />
      ))}
    </div>
  );
}
