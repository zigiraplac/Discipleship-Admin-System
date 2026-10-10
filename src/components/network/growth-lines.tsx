"use client";

import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import type { GrowthSeries } from "@/lib/data/org-view";
import { compact, lineColours } from "./identity-colours";

type Metric = "active" | "enrolled";
const MAX_LINES = 5;
const W = 600;

function niceMax(n: number): number {
  if (n <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= n) return f * p;
  return 10 * p;
}

const latest = (v: (number | null)[]) => [...v].reverse().find((x) => x != null) ?? null;

/**
 * "Is each of my direct children growing, declining or stable — and how
 * does it compare with its siblings?" One line per direct child, month by
 * month, from dated enrolment history: Active students by default, or
 * Total enrolments (including those who later left).
 *
 * Months before a child had any student are left blank — no line — rather
 * than drawn as zero; a zero after that is real. Past five children, the
 * five largest are drawn and the legend lets you swap others in.
 */
export function GrowthLines({ months, series, height = 200 }: { months: { label: string; title: string }[]; series: GrowthSeries[]; height?: number }) {
  const [metric, setMetric] = useState<Metric>("active");
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const colours = useMemo(() => lineColours(series.map((s) => ({ id: s.id, name: s.name, value: latest(s.active) ?? 0 }))), [series]);
  const ranked = useMemo(() => [...series].sort((a, b) => (latest(b.active) ?? 0) - (latest(a.active) ?? 0) || a.name.localeCompare(b.name)), [series]);
  const [shown, setShown] = useState<Set<string>>(() => new Set(ranked.slice(0, MAX_LINES).map((s) => s.id)));

  if (!months.length || !series.length) return <p className="py-10 text-center text-[13px] text-ink-muted">No student history yet.</p>;

  const lines = ranked.filter((s) => shown.has(s.id)).map((s) => ({ ...s, values: s[metric] }));
  const max = niceMax(Math.max(1, ...lines.flatMap((l) => l.values.filter((v): v is number => v != null))));
  const ticks = [1, 0.5, 0].map((f) => Math.round(max * f));
  const n = months.length;
  // Each month is a column; its point sits in the middle, over its label.
  const x = (i: number) => ((i + 0.5) / n) * W;
  const y = (v: number) => height - (v / max) * height;
  // A gap (no history) breaks the line instead of dropping it to zero.
  const path = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const toggle = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else if (next.size < MAX_LINES) next.add(id);
      return next;
    });
  const label = metric === "active" ? "active students" : "students enrolled";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        {/* Legend: each child's latest value — tap to show or hide its line. */}
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {ranked.map((s) => {
            const on = shown.has(s.id);
            const c = colours.get(s.id)!;
            const value = latest(s[metric]);
            const full = !on && shown.size >= MAX_LINES;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                onMouseEnter={() => on && setFocus(s.id)}
                onMouseLeave={() => setFocus(null)}
                disabled={full}
                aria-pressed={on}
                title={full ? `Up to ${MAX_LINES} lines at a time — hide one to show ${s.name}` : on ? `Hide ${s.name}` : `Show ${s.name}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[12px] transition-colors",
                  on ? "border-border bg-card text-ink-secondary hover:bg-hover" : "border-dashed border-[var(--color-dashed)] text-ink-faint hover:text-ink-secondary",
                  full && "cursor-not-allowed opacity-60 hover:text-ink-faint"
                )}
              >
                <span className={cn("size-2.5 flex-none rounded-full", on ? c.dot : "border border-ink-faint")} />
                <span className="max-w-[140px] truncate">{s.name}</span>
                <span className={cn("font-bold tabular", on ? "text-ink" : "text-ink-faint")}>{value ?? "—"}</span>
              </button>
            );
          })}
        </div>
        <Segmented
          options={[
            { value: "active", label: "Active" },
            { value: "enrolled", label: "Total enrolments" },
          ]}
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
        />
      </div>
      {series.length > MAX_LINES && (
        <p className="-mt-1 text-[11px] text-ink-muted">
          Showing {shown.size} of {series.length} — tap a name to compare others.
        </p>
      )}

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

          <svg
            viewBox={`0 0 ${W} ${height}`}
            preserveAspectRatio="none"
            className="relative block w-full overflow-visible"
            style={{ height }}
            role="img"
            aria-label={lines.map((l) => `${l.name}: ${latest(l.values) ?? "no history"} ${label}`).join("; ")}
          >
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke="var(--color-divider)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            {lines.map((l) => (
              <path
                key={l.id}
                d={path(l.values)}
                fill="none"
                stroke={colours.get(l.id)!.stroke}
                strokeWidth={focus === l.id ? 3 : 2}
                strokeOpacity={focus && focus !== l.id ? 0.25 : 1}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="transition-[stroke-opacity] duration-150"
              />
            ))}
          </svg>

          {/* Points as HTML so they stay round at any width: at the hovered month,
              and wherever a value has no neighbour to join (a lone month). */}
          {lines.flatMap((l) =>
            l.values.map((v, i) => {
              const lone = v != null && l.values[i - 1] == null && l.values[i + 1] == null;
              if (v == null || (!lone && hover !== i)) return null;
              return (
                <span
                  key={`${l.id}-${i}`}
                  className={cn("pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card", colours.get(l.id)!.dot)}
                  style={{ left: `${(x(i) / W) * 100}%`, top: y(v), opacity: focus && focus !== l.id ? 0.3 : 1 }}
                />
              );
            })
          )}

          <div className="absolute inset-x-0 top-0 flex" style={{ height }}>
            {months.map((m, i) => (
              <div key={m.title} className="h-full flex-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))} />
            ))}
          </div>

          {hover != null && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1b1f24] px-2.5 py-1.5 text-[11px] text-white shadow-lg"
              style={{ left: `${Math.min(82, Math.max(18, (x(hover) / W) * 100))}%` }}
            >
              <div className="font-bold">{months[hover].title}</div>
              {lines.map((l) => {
                const v = l.values[hover];
                const prev = hover > 0 ? l.values[hover - 1] : null;
                const d = v != null && prev != null ? v - prev : null;
                return (
                  <div key={l.id} className="mt-0.5 flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", colours.get(l.id)!.dot)} />
                    <span className="flex-1 pr-3">{l.name}</span>
                    <span className="font-bold tabular">{v ?? "—"}</span>
                    <span className="w-10 text-right tabular text-white/70">
                      {v == null ? "" : d == null ? "" : d === 0 ? "±0" : `${d > 0 ? "▲" : "▼"}${Math.abs(d)}`}
                    </span>
                  </div>
                );
              })}
              <div className="mt-1 border-t border-white/20 pt-1 text-white/60">
                {metric === "active" ? "Active at month end" : "Enrolled by month end"} · change on previous month
              </div>
            </div>
          )}

          <div className="mt-1.5 flex">
            {months.map((m, i) => (
              <span
                key={m.title}
                className={cn(
                  "flex-1 text-center text-[10px]",
                  i === n - 1 ? "font-bold text-ink-secondary" : "text-ink-faint",
                  n > 8 && i % 2 === 1 && i !== n - 1 && "invisible"
                )}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
