import { Pill } from "@/components/ui/pill";
import { PeriodPicker } from "./period-picker";

/** The row under the page title on every level page: the level, the
 * period picker and any actions. */
export function LevelHeader({
  levelLabel,
  partOf,
  period,
  actions,
}: {
  levelLabel: string;
  /** "Africa › Rwanda" */
  partOf?: string;
  /** Omit for pages that don't depend on a time window. */
  period?: number;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Pill tone="cyan">{levelLabel}</Pill>
      {/* Where the level sits is shown by the breadcrumbs above the page. */}
      <span className="min-w-0 flex-1" data-part-of={partOf} />
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {period != null && <PeriodPicker value={period} />}
      </div>
    </div>
  );
}
