"use client";

import { useState } from "react";

export interface GrowthPoint {
  /** Short axis label, e.g. "Oct". */
  label: string;
  /** Full label for the tooltip, e.g. "October 2026". */
  title: string;
  value: number;
}

function niceMax(n: number): number {
  if (n <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= n) return f * p;
  return 10 * p;
}

const W = 600;

/**
 * Active students month by month — "are we growing?". Drawn like the
 * Dashboard's Attendance card (same tokens, dashed grid, dark tooltip chip),
 * as a single-series line so there's no legend to read.
 */
export function GrowthChart({ points, height = 150 }: { points: GrowthPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const ticks = [1, 0.5, 0].map((f) => Math.round(max * f));
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => height - (v / max) * height;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const last = points[points.length - 1];
  const shown = hover ?? points.length - 1;

  return (
    <div className="flex gap-2">
      <div className="flex flex-none flex-col justify-between text-right text-[9px] text-ink-faint tabular" style={{ height }}>
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }}>
          {ticks.map((_, i) => (
            <div key={i} className="border-t border-dashed border-divider" />
          ))}
        </div>
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="relative block w-full overflow-visible"
          style={{ height }}
          role="img"
          aria-label={`Active students: ${points.map((p) => `${p.title} ${p.value}`).join(", ")}`}
        >
          <path d={area} fill="var(--color-ink-faint)" fillOpacity={0.12} />
          <path d={line} fill="none" stroke="var(--color-ink-secondary)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {/* Dot + hover targets as HTML so they stay round at any width. */}
        <div className="absolute inset-x-0 top-0 flex" style={{ height }}>
          {points.map((p, i) => (
            <div
              key={p.title}
              className="relative h-full flex-1"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </div>
        <span
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-accent"
          style={{ left: `${(x(shown) / W) * 100}%`, top: y(points[shown].value) }}
        />
        {hover != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1b1f24] px-2.5 py-1.5 text-[10px] font-bold text-white shadow-lg"
            style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%`, top: Math.max(0, y(points[hover].value) - 40) }}
          >
            {points[hover].title}
            <div className="mt-0.5 font-semibold">{points[hover].value} active students</div>
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[9px] text-ink-faint">
          {points.map((p, i) => (
            <span key={p.title} className={i % 2 && i !== points.length - 1 ? "invisible" : ""}>
              {p.label}
            </span>
          ))}
        </div>
        <div className="sr-only">Latest: {last.value} active students in {last.title}.</div>
      </div>
    </div>
  );
}
