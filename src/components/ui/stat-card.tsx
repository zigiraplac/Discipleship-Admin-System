import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import type { PillTone } from "./pill";

const ICON_TONE_CLASSES: Record<PillTone, string> = {
  cyan: "bg-accent-100 text-accent-800",
  yellow: "bg-yellow-100 text-yellow-ink",
  magenta: "bg-accent-2-100 text-accent-2-700",
  grey: "bg-page text-ink-tertiary",
  violet: "bg-violet-100 text-violet-700",
  teal: "bg-teal-100 text-teal-700",
  sky: "bg-sky-100 text-sky-700",
  amber: "bg-amber-100 text-amber-800",
};

/** The simpler KPI card used on Lessons, Attention, Reports. `icon`/`tone`
 * are optional — most stats are plain numbers, but where the number's
 * severity actually matters (an outstanding count, an overdue count) a
 * colored badge gives that a visual weight the label text alone doesn't. */
export function StatCard({
  label,
  value,
  sub,
  icon: IconEl,
  tone = "cyan",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: Icon;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <Card className={cn("p-3.5 px-4", className)}>
      <div className="flex items-center gap-2">
        {IconEl && (
          <span className={cn("grid size-6 flex-none place-items-center rounded-[7px]", ICON_TONE_CLASSES[tone])}>
            <IconEl size={14} />
          </span>
        )}
        <div className="text-xs font-semibold text-ink-tertiary">{label}</div>
      </div>
      <div className="mt-2 text-[26px] font-bold leading-none text-ink tabular">{value}</div>
      {sub && <div className="mt-[5px] text-xs text-ink-muted">{sub}</div>}
    </Card>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("grid gap-3.5", className)}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}
    >
      {children}
    </div>
  );
}
