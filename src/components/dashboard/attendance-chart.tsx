"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";

export interface ChartBar {
  label: string; // "L28" or "C3"
  title: string; // "C2 · L11 · 79%" — native tooltip
  rate: number;
}

type ChartMode = "lessons" | "classes";

const MODE_OPTIONS: SegmentedOption<ChartMode>[] = [
  { value: "lessons", label: "Lessons" },
  { value: "classes", label: "Classes" },
];

const PLOT_HEIGHT = 170;
const Y_TICKS = [100, 80, 60, 40, 20, 0];

export function AttendanceChart({
  lessonBars,
  classBars,
}: {
  lessonBars: ChartBar[];
  classBars: ChartBar[];
}) {
  const [mode, setMode] = useState<ChartMode>("lessons");
  const bars = mode === "lessons" ? lessonBars : classBars;

  const avg = bars.length ? Math.round(bars.reduce((a, b) => a + b.rate, 0) / bars.length) : 0;
  const latest = bars.length ? bars[bars.length - 1].rate : 0;

  return (
    <Card className="p-[18px]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">Attendance</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="size-2 flex-none rounded-full bg-accent" />
            {mode === "lessons" ? `Last ${bars.length} lessons` : "By class"}
          </div>
        </div>
        <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <div className="flex gap-[18px]">
          <div>
            <div className="text-xl font-bold leading-none text-ink tabular">{avg}%</div>
            <div className="text-[11px] text-ink-muted">average</div>
          </div>
          <div>
            <div className="text-xl font-bold leading-none text-accent-700 tabular">{latest}%</div>
            <div className="text-[11px] text-ink-muted">
              {mode === "lessons" ? "latest" : bars.length ? bars[bars.length - 1].label : "latest"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[18px] flex gap-2">
        <div className="flex flex-none flex-col justify-between text-right text-[9px] text-ink-faint" style={{ height: PLOT_HEIGHT }}>
          {Y_TICKS.map((t) => (
            <span key={t} className="tabular">
              {t}%
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0 flex flex-col justify-between" style={{ height: PLOT_HEIGHT }}>
            {Y_TICKS.map((t) => (
              <div key={t} className="border-t border-dashed border-divider" />
            ))}
          </div>

          {bars.length > 0 ? (
            <div className="relative flex items-end justify-center gap-2" style={{ height: PLOT_HEIGHT }}>
              {bars.map((b, i) => (
                <div
                  key={i}
                  className="flex h-full max-w-[34px] flex-1 flex-col items-center justify-end"
                  title={b.title}
                >
                  <div
                    className="w-2.5 rounded-t-[3px] rounded-b-[1px]"
                    style={{
                      height: b.rate > 0 ? Math.max(3, (b.rate / 100) * PLOT_HEIGHT) : 0,
                      background: i === bars.length - 1 ? "var(--color-accent)" : "var(--color-accent-300)",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="relative flex items-center justify-center text-xs text-ink-faint" style={{ height: PLOT_HEIGHT }}>
              No registers saved yet.
            </div>
          )}

          <div className="mt-1.5 flex justify-center gap-2">
            {bars.map((b, i) => (
              <div key={i} className="max-w-[34px] flex-1 text-center text-[9px] text-ink-faint tabular">
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
