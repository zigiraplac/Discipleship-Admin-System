"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

export interface ChartBar {
  label: string; // "L28" or "C3"
  title: string; // "C2 · L11 · 79% attended · 12% caught up · 9% absent" — native tooltip
  rate: number; // presentPct + catchupPct — overall attendance rate
  presentPct: number; // attended live
  catchupPct: number; // attended via a catch-up correction
  absentPct: number; // still absent
  presentCount: number; // attended, live + caught-up combined — raw headcount
  absentCount: number; // raw headcount
}

const PRESENT_COLOR = "var(--color-accent)";
const ABSENT_COLOR = "var(--color-accent-2-500)";

// One shared two-segment Present/Absent scheme for both "Lessons" and
// "Classes" — catch-ups fold into "Present" in both (still fully broken
// out in the native tooltip text), so the two views read as the same
// chart in a different grouping, not two different charts.
const ATTENDANCE_LEGEND = [
  { label: "Present", color: PRESENT_COLOR },
  { label: "Absent", color: ABSENT_COLOR },
];

const LESSON_SEGMENTS: { key: "presentCount" | "absentCount"; color: string }[] = [
  { key: "presentCount", color: PRESENT_COLOR },
  { key: "absentCount", color: ABSENT_COLOR },
];

function niceCeil(n: number): number {
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  if (n <= 200) return 200;
  if (n <= 500) return 500;
  return Math.ceil(n / 500) * 500;
}

type ChartMode = "lessons" | "classes";

const MODE_OPTIONS: SegmentedOption<ChartMode>[] = [
  { value: "lessons", label: "Lessons" },
  { value: "classes", label: "Classes" },
];

const PLOT_HEIGHT = 130;

/** One "Attendance" card — a bar chart toggling between per-lesson and
 * per-class views. */
export function AttendanceCard({ lessonBars, classBars }: { lessonBars: ChartBar[]; classBars: ChartBar[] }) {
  const [mode, setMode] = useState<ChartMode>("lessons");
  const [hovered, setHovered] = useState<number | null>(null);
  const isLessons = mode === "lessons";
  const bars = isLessons ? lessonBars : classBars;

  const axisMax = isLessons ? niceCeil(Math.max(1, ...bars.map((b) => b.presentCount + b.absentCount))) : 100;
  const axisTicks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((f) => Math.round(axisMax * f));
  const axisSuffix = isLessons ? "" : "%";

  return (
    <Card className="p-4">
      <div className="text-[15px] font-bold text-ink">Attendance</div>

      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-muted">{isLessons ? `Last ${bars.length} lessons` : "By class"}</div>
        </div>
        <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-ink-muted">
        {ATTENDANCE_LEGEND.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1.5">
            <span className="size-2 flex-none rounded-full" style={{ background: seg.color }} />
            {seg.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <div className="flex flex-none flex-col justify-between text-right text-[9px] text-ink-faint" style={{ height: PLOT_HEIGHT }}>
          {axisTicks.map((t, i) => (
            <span key={i} className="tabular">
              {t}
              {axisSuffix}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0 flex flex-col justify-between" style={{ height: PLOT_HEIGHT }}>
            {axisTicks.map((t, i) => (
              <div key={i} className="border-t border-dashed border-divider" />
            ))}
          </div>

          {isLessons && bars.length > 0 ? (
            <div className="relative flex items-end justify-center gap-3" style={{ height: PLOT_HEIGHT }}>
              {bars.map((b, i) => {
                const total = b.presentCount + b.absentCount;
                const stackHeight = total > 0 ? Math.max(4, (total / axisMax) * PLOT_HEIGHT) : 0;
                return (
                  <div
                    key={i}
                    className="relative flex h-full max-w-[72px] flex-1 flex-col items-center justify-end"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                  >
                    {/* Tooltip chip stays a fixed dark color regardless of
                        theme (like a native tooltip) — `--color-ink` is a
                        text token that inverts to near-white in dark mode,
                        which would've put white text on a white chip. */}
                    {hovered === i && (
                      <div className="pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-lg bg-[#1b1f24] px-2.5 py-1.5 text-[10px] font-bold text-white shadow-lg">
                        <div className="flex items-center gap-1.5">
                          <span className="size-1.5 flex-none rounded-full bg-accent" />
                          {b.presentCount}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="size-1.5 flex-none rounded-full bg-accent-2-500" />
                          {b.absentCount}
                        </div>
                      </div>
                    )}
                    <div
                      className="flex w-4 flex-col-reverse overflow-hidden rounded-t-[3px] rounded-b-[1px]"
                      style={{ height: stackHeight }}
                    >
                      {LESSON_SEGMENTS.map((seg) => (
                        <div
                          key={seg.key}
                          className="w-full"
                          style={{ height: `${total > 0 ? (b[seg.key] / total) * 100 : 0}%`, background: seg.color }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : bars.length > 0 ? (
            <div className="relative flex items-end justify-center gap-2" style={{ height: PLOT_HEIGHT }}>
              {bars.map((b, i) => {
                // Caught up folds into "Present" here too, matching the
                // Lessons view — see ATTENDANCE_LEGEND.
                const presentPct = b.presentPct + b.catchupPct;
                const total = presentPct + b.absentPct;
                const stackHeight = total > 0 ? Math.max(3, (total / 100) * PLOT_HEIGHT) : 0;
                return (
                  <div
                    key={i}
                    className="flex h-full max-w-[40px] flex-1 flex-col items-center justify-end"
                    title={b.title}
                  >
                    <div
                      className="flex w-4 flex-col-reverse overflow-hidden rounded-t-[3px] rounded-b-[1px]"
                      style={{ height: stackHeight }}
                    >
                      <div
                        className="w-full"
                        style={{ height: `${total > 0 ? (presentPct / total) * 100 : 0}%`, background: PRESENT_COLOR }}
                      />
                      <div
                        className="w-full"
                        style={{ height: `${total > 0 ? (b.absentPct / total) * 100 : 0}%`, background: ABSENT_COLOR }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="relative flex items-center justify-center text-xs text-ink-faint" style={{ height: PLOT_HEIGHT }}>
              No registers saved yet.
            </div>
          )}

          <div className={cn("mt-1.5 flex justify-center", isLessons ? "gap-3" : "gap-2")}>
            {bars.map((b, i) => (
              <div
                key={i}
                className={cn("flex-1 text-center text-[9px] text-ink-faint tabular", isLessons ? "max-w-[72px]" : "max-w-[40px]")}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
