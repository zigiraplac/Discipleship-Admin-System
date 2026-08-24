import { cn } from "@/lib/utils";

export type BarTone = "cyan" | "yellow" | "magenta" | "grey";

const FILL_CLASSES: Record<BarTone, string> = {
  cyan: "bg-accent",
  yellow: "bg-yellow",
  magenta: "bg-accent-2-500",
  grey: "bg-neutral-border",
};

/** `0` and `—` are not interchangeable (04-interactions-and-state.md) — pass
 * `pct={null}` for "not yet measured", which renders as an empty grey track. */
export function ProgressBar({
  pct,
  tone = "cyan",
  height = 6,
  className,
}: {
  pct: number | null;
  tone?: BarTone;
  height?: number;
  className?: string;
}) {
  const width = pct === null ? 0 : Math.max(2, Math.min(100, pct));
  return (
    <span
      className={cn("block overflow-hidden rounded-[4px] bg-divider", className)}
      style={{ height }}
    >
      <span
        className={cn("block h-full rounded-[3px]", FILL_CLASSES[pct === null ? "grey" : tone])}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

export function toneForRate(rate: number, active: number, help: number): BarTone {
  if (rate >= active) return "cyan";
  if (rate >= help) return "yellow";
  return "magenta";
}
