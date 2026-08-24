import { cn } from "@/lib/utils";
import type { BarTone } from "./progress-bar";

const TONE_STROKE: Record<BarTone, string> = {
  cyan: "var(--color-accent)",
  yellow: "var(--color-yellow)",
  magenta: "var(--color-accent-2-500)",
  grey: "var(--color-neutral-border)",
};

/**
 * A round "how far along" read — same data a linear ProgressBar would
 * show, just easier to grasp at a glance for a single overall figure
 * (e.g. lessons recorded out of 80) than a thin bar. Deliberately just
 * this one spot, not a blanket replacement — see the note on Dashboard's
 * "no charts for the sake of charts" principle.
 */
export function CompletionRing({
  pct,
  size = 64,
  strokeWidth = 6,
  tone = "cyan",
  children,
  className,
}: {
  /** 0–100. */
  pct: number;
  size?: number;
  strokeWidth?: number;
  tone?: BarTone;
  /** Centered content — typically the percentage or "28/80". */
  children?: React.ReactNode;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={cn("relative grid flex-none place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-divider)"
          strokeWidth={strokeWidth}
        />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={TONE_STROKE[tone]}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}
