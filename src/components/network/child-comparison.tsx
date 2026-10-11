"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { byActive, compact, MAX_BARS } from "./identity-colours";


function niceMax(n: number): number {
  if (n <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= n) return f * p;
  return 10 * p;
}

/**
 * "How do my direct children compare right now?" — one bar per direct
 * child (continents at HQ, countries in a continent, … cohorts in a
 * promotion), each showing its current active students. Not a time
 * series: how a child changed over time is in its own summary panel.
 *
 * Bars are wide and sized to the number of children (a slot per child,
 * the bar ~60% of it, capped so two children don't become slabs), with
 * the exact value above each bar, all in the one accent blue. Past five
 * children, the smallest fold into "Others".
 */
export function ChildComparison({ items, unit = "students", height = 220 }: { items: { id: string; name: string; value: number }[]; unit?: string; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);

  const sorted = byActive(items);
  const bars: { id: string; name: string; value: number; other?: number }[] = sorted.slice(0, sorted.length > MAX_BARS ? MAX_BARS - 1 : MAX_BARS);
  if (sorted.length > MAX_BARS) {
    const rest = sorted.slice(MAX_BARS - 1);
    bars.push({ id: "others", name: `Others (${rest.length})`, value: rest.reduce((a, r) => a + r.value, 0), other: rest.length });
  }
  if (!bars.length) return <p className="py-10 text-center text-[13px] text-ink-muted">Nothing inside yet.</p>;

  const total = bars.reduce((a, b) => a + b.value, 0);
  const max = niceMax(Math.max(1, ...bars.map((b) => b.value)));
  const ticks = [1, 0.5, 0].map((f) => Math.round(max * f));
  // Fewer children → wider bars, but never a slab.
  const barWidth = bars.length <= 2 ? "min(42%, 120px)" : bars.length <= 3 ? "min(56%, 110px)" : "min(64%, 96px)";

  return (
    <div className="flex gap-2">
      <div className="flex flex-none flex-col justify-between text-right text-[10px] tabular text-ink-faint" style={{ height }}>
        {ticks.map((t, i) => (
          <span key={i}>{compact(t)}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }}>
          {ticks.map((_, i) => (
            <div key={i} className={cn("border-t", i === ticks.length - 1 ? "border-border" : "border-dashed border-divider")} />
          ))}
        </div>

        <div className="relative flex items-end" style={{ height }} role="img" aria-label={bars.map((b) => `${b.name}: ${b.value} ${unit}`).join("; ")}>
          {bars.map((b) => {
            const pct = (b.value / max) * 100;
            const share = total ? Math.round((b.value / total) * 100) : 0;
            return (
              <div
                key={b.id}
                className="relative flex h-full flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setHover(b.id)}
                onMouseLeave={() => setHover((h) => (h === b.id ? null : h))}
              >
                <span className="mb-1.5 text-[15px] font-bold leading-none tabular text-ink" title={b.value.toLocaleString()}>
                  {b.value >= 10_000 ? compact(b.value) : b.value.toLocaleString()}
                </span>
                <div
                  className={cn("rounded-t-[8px] bg-accent transition-[height,opacity] duration-300", hover && hover !== b.id && "opacity-60")}
                  // Scaled within the space left after the value label above it.
                  style={{ width: barWidth, height: `calc((100% - 26px) * ${Math.max(pct, b.value ? 1.5 : 0) / 100})` }}
                />
                {hover === b.id && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-[#1b1f24] px-2.5 py-1.5 text-[11px] text-white shadow-lg">
                    <div className="font-bold">{b.name}</div>
                    <div className="mt-0.5">
                      {b.value.toLocaleString()} {unit} · {share}% of the total
                    </div>
                    {b.other && <div className="mt-0.5 text-white/70">{b.other} smaller ones combined</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex">
          {bars.map((b) => (
            <span key={b.id} className={cn("flex-1 truncate px-1 text-center text-[12px]", hover === b.id ? "font-bold text-ink" : "font-semibold text-ink-secondary")} title={b.name}>
              {b.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
