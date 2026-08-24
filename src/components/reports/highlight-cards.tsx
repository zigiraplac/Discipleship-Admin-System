import { Card } from "@/components/ui/card";
import type { ReportLesson } from "./report-utils";

function HighlightCard({
  kicker,
  lesson,
  enrolled,
}: {
  kicker: string;
  lesson: ReportLesson | null;
  enrolled: number;
}) {
  return (
    <Card className="p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{kicker}</div>
      {lesson ? (
        <>
          <div className="mt-1.5 truncate text-[14px] font-semibold text-ink">{lesson.lessonTitle}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[24px] font-bold leading-none text-ink tabular">{lesson.rate}%</span>
            <span className="text-xs text-ink-muted tabular">
              {lesson.present}/{enrolled}
            </span>
          </div>
        </>
      ) : (
        <div className="mt-2 text-xs text-ink-faint">Nothing recorded this period.</div>
      )}
    </Card>
  );
}

/** Best- and lowest-attended recorded lesson within the current period. */
export function HighlightCards({
  recordedInPeriod,
  enrolled,
}: {
  recordedInPeriod: ReportLesson[];
  enrolled: number;
}) {
  const rankable = recordedInPeriod.filter((l) => l.rate != null);
  const best = rankable.length
    ? rankable.reduce((a, b) => ((b.rate ?? 0) > (a.rate ?? 0) ? b : a))
    : null;
  const lowest = rankable.length
    ? rankable.reduce((a, b) => ((b.rate ?? 0) < (a.rate ?? 0) ? b : a))
    : null;

  return (
    <div className="grid grid-cols-2 gap-3.5">
      <HighlightCard kicker="Best attended" lesson={best} enrolled={enrolled} />
      <HighlightCard kicker="Lowest" lesson={lowest} enrolled={enrolled} />
    </div>
  );
}
