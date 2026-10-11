import { cn } from "@/lib/utils";
import type { MetricView } from "@/lib/data/org-view";

/**
 * Visual language for the level dashboards. The number comes first; the
 * small visual explains it, never replaces it. Colour carries meaning only:
 * neutral for ordinary data, green = healthy or improving, amber = needs
 * attention, red = critical, accent = something you can click.
 * These components know nothing about attendance or delivery — they render
 * whatever view-model the data layer hands them.
 */

const PILL = {
  good: "bg-emerald-100 text-emerald-700",
  bad: "bg-accent-2-100 text-accent-2-700",
  neutral: "bg-subtle text-ink-muted",
} as const;

/** One question, one card: label → strong number → change pill and context. */
export function MetricCard({ m }: { m: MetricView }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-card border border-border bg-card px-4 py-3.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">{m.label}</div>
      <span className="text-[28px] font-bold leading-none tabular text-ink">{m.value}</span>
      <div className="flex flex-wrap items-center gap-2">
        {m.change && m.change.tone !== "neutral" && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tabular", PILL[m.change.tone])}>{m.change.text}</span>
        )}
        <span className="min-w-0 text-[11px] leading-snug text-ink-muted">{m.context}</span>
      </div>
    </div>
  );
}

export function MetricRow({ metrics }: { metrics: MetricView[] }) {
  // Four or five across on wide screens, two on narrow ones.
  return (
    <div className={cn("grid grid-cols-2 gap-3", metrics.length === 5 ? "lg:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-4")}>
      {metrics.map((m) => (
        <MetricCard key={m.key} m={m} />
      ))}
    </div>
  );
}
