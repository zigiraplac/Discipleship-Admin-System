import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { AtRiskPoint } from "@/lib/domain/metrics";

const WIDTH = 600;
const HEIGHT = 148;
const PAD_Y = 10;

/**
 * A real trend, not a decoration — see `atRiskTrend` for how it's derived
 * from data already recorded, no snapshot table required. Hand-rolled SVG
 * since nothing in this codebase pulls in a charting library yet.
 */
export function AtRiskTrendCard({
  points,
  enrolled,
  current,
  attentionHref,
}: {
  points: AtRiskPoint[];
  enrolled: number;
  current: number;
  attentionHref: string;
}) {
  const shown = points.slice(-16);
  const ceiling = Math.max(1, enrolled);

  function y(v: number): number {
    const usable = HEIGHT - PAD_Y * 2;
    return PAD_Y + usable - (v / ceiling) * usable;
  }
  function x(i: number): number {
    if (shown.length <= 1) return WIDTH / 2;
    return (i / (shown.length - 1)) * WIDTH;
  }

  const linePath = shown.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.atRiskCount)}`).join(" ");
  const areaPath =
    shown.length > 0
      ? `${linePath} L${x(shown.length - 1)},${HEIGHT} L${x(0)},${HEIGHT} Z`
      : "";

  return (
    <Card className="p-[18px]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">Needs attention</div>
          <div className="mt-0.5 text-xs text-ink-muted">Trend across the last {shown.length} lessons</div>
        </div>
        <div>
          <div className="text-xl font-bold leading-none text-accent-2-700 tabular">{current}</div>
          <div className="text-[11px] text-ink-muted">right now</div>
        </div>
      </div>

      <div className="mt-[18px]">
        {shown.length > 1 ? (
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-[148px] w-full">
            <path d={areaPath} fill="var(--color-accent-2-100)" />
            <path d={linePath} fill="none" stroke="var(--color-accent-2-500)" strokeWidth={2} />
            {shown.map((p, i) => (
              <circle key={p.globalIndex} cx={x(i)} cy={y(p.atRiskCount)} r={3} fill="var(--color-accent-2-500)" />
            ))}
          </svg>
        ) : (
          <div className="flex h-[148px] items-center justify-center text-xs text-ink-faint">
            Not enough recorded lessons yet for a trend.
          </div>
        )}
      </div>

      <Link
        href={attentionHref}
        className="mt-1 inline-flex items-center text-[13px] font-semibold text-accent-700 hover:underline"
      >
        View who needs attention →
      </Link>
    </Card>
  );
}
