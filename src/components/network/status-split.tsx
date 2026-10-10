import { cn } from "@/lib/utils";

/** The app's status colours: On track = accent, Needs help = yellow,
 * At risk = accent-2 (same as StatusPill and the Attendance card). */
export const STATUS_COLORS = {
  onTrack: "var(--color-accent)",
  needsHelp: "var(--color-yellow)",
  atRisk: "var(--color-accent-2-500)",
} as const;

/** One bar split into On track / Needs help / At risk — always adds up to
 * the active students it's given. */
export function StatusSplit({
  onTrack,
  needsHelp,
  atRisk,
  height = 12,
  className,
}: {
  onTrack: number;
  needsHelp: number;
  atRisk: number;
  height?: number;
  className?: string;
}) {
  const total = onTrack + needsHelp + atRisk;
  if (!total) return null;
  const parts = [
    { key: "onTrack", value: onTrack },
    { key: "needsHelp", value: needsHelp },
    { key: "atRisk", value: atRisk },
  ].filter((p) => p.value > 0) as { key: keyof typeof STATUS_COLORS; value: number }[];
  return (
    <span
      className={cn("flex w-full gap-[2px] overflow-hidden rounded-[4px]", className)}
      style={{ height }}
      role="img"
      aria-label={`${onTrack} on track, ${needsHelp} need help, ${atRisk} at risk`}
    >
      {parts.map((p) => (
        <span key={p.key} className="block h-full" style={{ flex: p.value, background: STATUS_COLORS[p.key] }} />
      ))}
    </span>
  );
}

export function StatusLegend({
  onTrack,
  needsHelp,
  atRisk,
  bands,
}: {
  onTrack?: number;
  needsHelp?: number;
  atRisk?: number;
  /** When given, shows the rule behind each group (e.g. "85%+"). */
  bands?: { activeThreshold: number; helpThreshold: number };
}) {
  const items = [
    { label: "On track", color: STATUS_COLORS.onTrack, n: onTrack, rule: bands && `${bands.activeThreshold}%+` },
    { label: "Needs help", color: STATUS_COLORS.needsHelp, n: needsHelp, rule: bands && `${bands.helpThreshold}–${bands.activeThreshold - 1}%` },
    { label: "At risk", color: STATUS_COLORS.atRisk, n: atRisk, rule: bands && `under ${bands.helpThreshold}%` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2 flex-none rounded-full" style={{ background: i.color }} />
          {i.label}
          {i.n != null && <span className="text-ink tabular">{i.n}</span>}
          {i.rule && <span className="font-medium text-ink-faint">({i.rule})</span>}
        </span>
      ))}
    </div>
  );
}
