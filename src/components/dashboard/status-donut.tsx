import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Ring3D } from "./ring-3d";
import type { BarTone } from "@/components/ui/progress-bar";

const TONE_STROKE: Record<BarTone, string> = {
  cyan: "var(--color-accent)",
  yellow: "var(--color-yellow)",
  magenta: "var(--color-accent-2-500)",
  grey: "var(--color-neutral-border)",
};

const TONE_DOT: Record<BarTone, string> = {
  cyan: "bg-accent",
  yellow: "bg-yellow",
  magenta: "bg-accent-2-500",
  grey: "bg-neutral-border",
};

export interface DonutSegment {
  label: string;
  count: number;
  tone: BarTone;
}

// Matches the Attendance card's own donut ring size so both read as one
// consistent pair.
const SIZE = 96;
const STROKE = 12;

/** "Where does the cohort stand right now" in one glance — same stacked-
 * circle technique as `CompletionRing` (src/components/ui/completion-ring.tsx),
 * generalized from one segment to several: each status gets its own
 * `<circle>`, sized to its share of the ring and offset by every segment
 * drawn before it, so the ring reads left-to-right as one continuous band. */
export function StatusDonut({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  // Each segment's arc length plus how far around the ring it starts —
  // built functionally (no running-total variable reassigned during
  // render) since only 4 segments ever exist, the O(n^2) prefix-sum reduce
  // below is trivial in practice.
  const arcs = segments.reduce<{ seg: DonutSegment; arcLength: number; dashoffset: number }[]>((acc, seg) => {
    const startOffset = acc.reduce((sum, a) => sum + a.arcLength, 0);
    const arcLength = total > 0 ? (seg.count / total) * circumference : 0;
    return [...acc, { seg, arcLength, dashoffset: -startOffset }];
  }, []);

  return (
    <Card className="p-4">
      <div className="text-[15px] font-bold text-ink">Cohort status</div>

      <div className="mt-3 flex flex-col items-center gap-3">
        <Ring3D size={SIZE} glossy={false}>
          <div className="relative grid place-items-center" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="-rotate-90">
              <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" stroke="var(--color-divider)" strokeWidth={STROKE} />
              {arcs.map(({ seg, arcLength, dashoffset }) => {
                if (seg.count <= 0 || total <= 0) return null;
                return (
                  <circle
                    key={seg.label}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={radius}
                    fill="none"
                    stroke={TONE_STROKE[seg.tone]}
                    strokeWidth={STROKE}
                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                    strokeDashoffset={dashoffset}
                  >
                    <title>{`${seg.label}: ${seg.count}`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-xl font-bold leading-none text-ink tabular">{total}</div>
                <div className="text-[10px] text-ink-muted">enrolled</div>
              </div>
            </div>
          </div>
        </Ring3D>

        <div className="flex w-full flex-col gap-1.5">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2 text-[12px]">
              <span className={cn("size-2 flex-none rounded-full", TONE_DOT[seg.tone])} />
              <span className="min-w-0 flex-1 truncate text-ink-secondary">{seg.label}</span>
              <span className="font-semibold text-ink tabular">{seg.count}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
