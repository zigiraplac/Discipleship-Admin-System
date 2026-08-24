import { Card } from "@/components/ui/card";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { CURRICULUM } from "@/lib/domain/curriculum";
import type { Bands } from "@/lib/domain/types";
import { classRateFrom, type ReportLesson } from "./report-utils";

/** Whole-cohort curriculum progress — deliberately not period-filtered
 * (per spec: "taught" here means recorded-ever, not recorded-in-period). */
export function ByClassCard({
  lessons,
  enrolled,
  bands,
}: {
  lessons: ReportLesson[];
  enrolled: number;
  bands: Bands;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-[18px] pt-4 pb-3.5 text-[15px] font-bold text-ink">By class</div>
      <div className="flex flex-col">
        {CURRICULUM.map((cls, classIndex) => {
          const taught = lessons.filter((l) => l.classIndex === classIndex && l.recorded).length;
          const total = cls.lessons.length;
          const rate = classRateFrom(lessons, classIndex, enrolled);
          const tone = rate != null ? toneForRate(rate, bands.activeThreshold, bands.helpThreshold) : "grey";

          return (
            <div
              key={cls.n}
              className="flex items-center gap-3 border-t border-divider px-[18px] py-2.5 first:border-t-0"
            >
              <div className="w-4 flex-none text-[12px] font-semibold text-ink-tertiary">{cls.n}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{cls.title}</div>
                <div className="text-[11px] text-ink-muted">
                  {taught}/{total}
                </div>
              </div>
              <ProgressBar pct={rate} tone={tone} className="w-[130px] flex-none" />
              <div className="w-10 flex-none text-right text-[13px] font-semibold text-ink tabular">
                {rate != null ? `${rate}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
