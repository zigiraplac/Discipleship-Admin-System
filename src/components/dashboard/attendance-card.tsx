"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { CompletionRing } from "@/components/ui/completion-ring";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { monthLabel, type MonthlyRate } from "@/components/reports/report-utils";
import { cn } from "@/lib/utils";
import { Ring3D } from "./ring-3d";

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

export interface OverallAttendance {
  present: number;
  absent: number;
  rate: number;
}

const SEGMENTS: { key: "presentPct" | "catchupPct" | "absentPct"; label: string; color: string }[] = [
  { key: "presentPct", label: "Attended", color: "var(--color-accent)" },
  { key: "catchupPct", label: "Caught up", color: "var(--color-yellow)" },
  { key: "absentPct", label: "Absent", color: "var(--color-accent-2-400)" },
];

// The simpler two-segment Present/Absent stack used by "Lessons" — catch-ups
// fold into "Present" there (still fully broken out in the native tooltip
// text), since a raw per-lesson headcount reads clearer as two segments than
// three.
const LESSONS_LEGEND = [
  { label: "Present", color: "var(--color-accent)" },
  { label: "Absent", color: "var(--color-accent-2-500)" },
];

const LESSON_SEGMENTS: { key: "presentCount" | "absentCount"; color: string }[] = [
  { key: "presentCount", color: "var(--color-accent)" },
  { key: "absentCount", color: "var(--color-accent-2-500)" },
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

type ChartMode = "lessons" | "classes" | "monthly";

const MODE_OPTIONS: SegmentedOption<ChartMode>[] = [
  { value: "lessons", label: "Lessons" },
  { value: "classes", label: "Classes" },
  { value: "monthly", label: "Monthly" },
];

type OuterView = "cylinders" | "donut";

const OUTER_OPTIONS: SegmentedOption<OuterView>[] = [
  { value: "cylinders", label: "Cylinders" },
  { value: "donut", label: "Donut" },
];

type DonutView = "lesson" | "overall";

const DONUT_OPTIONS: SegmentedOption<DonutView>[] = [
  { value: "lesson", label: "This lesson" },
  { value: "overall", label: "Overall" },
];

const PLOT_HEIGHT = 130;

const CURVE_WIDTH = 600;
// Same "Attended" color the bar modes already use for their present
// segment — this series is one honest attendance-rate line, not a
// pass/fail read, so it stays one consistent color rather than shifting
// per band.
const CURVE_COLOR = "var(--color-accent)";

/** Month-over-month attendance is the one series in this app worth a
 * smooth curve — unlike per-lesson/per-class bars (genuinely discrete
 * categories), consecutive months form a real continuous trend. Simple
 * uniform Catmull-Rom → cubic Bezier conversion, no charting library. */
function smoothLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Evenly spaces `count` points across the curve's width — used for both
 * the Monthly line and the Lessons stacked area below. */
function curvePoint(index: number, count: number, value: number): { x: number; y: number } {
  const x = count > 1 ? (index / (count - 1)) * CURVE_WIDTH : CURVE_WIDTH / 2;
  const y = PLOT_HEIGHT - (value / 100) * PLOT_HEIGHT;
  return { x, y };
}

/**
 * One "Attendance" card, one outer toggle between two whole visual
 * styles — bar-chart-style "Cylinders" (with its own Lessons/Classes/
 * Monthly modes) or the single-value "Donut" (with its own This-lesson/
 * Overall picker) — rather than two separate cards stacked on the page.
 */
export function AttendanceCard({
  lessonBars,
  classBars,
  monthlyRates,
  overall,
}: {
  lessonBars: ChartBar[];
  classBars: ChartBar[];
  monthlyRates: MonthlyRate[];
  overall: OverallAttendance;
}) {
  const [outerView, setOuterView] = useState<OuterView>("cylinders");

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-bold text-ink">Attendance</div>
        <Segmented options={OUTER_OPTIONS} value={outerView} onChange={setOuterView} />
      </div>

      {outerView === "cylinders" ? (
        <CylindersBody lessonBars={lessonBars} classBars={classBars} monthlyRates={monthlyRates} />
      ) : (
        <DonutBody lessonBars={lessonBars} overall={overall} />
      )}
    </Card>
  );
}

function CylindersBody({
  lessonBars,
  classBars,
  monthlyRates,
}: {
  lessonBars: ChartBar[];
  classBars: ChartBar[];
  monthlyRates: MonthlyRate[];
}) {
  const [mode, setMode] = useState<ChartMode>("lessons");
  const [hovered, setHovered] = useState<number | null>(null);
  const isMonthly = mode === "monthly";
  const isLessons = mode === "lessons";
  const bars = mode === "lessons" ? lessonBars : mode === "classes" ? classBars : [];

  const axisMax = isLessons ? niceCeil(Math.max(1, ...bars.map((b) => b.presentCount + b.absentCount))) : 100;
  const axisTicks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((f) => Math.round(axisMax * f));
  const axisSuffix = isLessons ? "" : "%";

  const avg = isMonthly
    ? monthlyRates.length
      ? Math.round(monthlyRates.reduce((a, m) => a + m.rate, 0) / monthlyRates.length)
      : 0
    : bars.length
      ? Math.round(bars.reduce((a, b) => a + b.rate, 0) / bars.length)
      : 0;
  const latest = isMonthly
    ? monthlyRates.length
      ? monthlyRates[monthlyRates.length - 1].rate
      : 0
    : bars.length
      ? bars[bars.length - 1].rate
      : 0;
  const latestLabel = isMonthly
    ? monthlyRates.length
      ? monthLabel(monthlyRates[monthlyRates.length - 1].month)
      : "latest"
    : mode === "lessons"
      ? "latest"
      : bars.length
        ? bars[bars.length - 1].label
        : "latest";

  return (
    <>
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-muted">
            {mode === "lessons" ? `Last ${bars.length} lessons` : mode === "classes" ? "By class" : "By month"}
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
            <div className="text-[11px] text-ink-muted">{latestLabel}</div>
          </div>
        </div>
      </div>

      {!isMonthly && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-ink-muted">
          {(isLessons ? LESSONS_LEGEND : SEGMENTS).map((seg) => (
            <span key={seg.label} className="flex items-center gap-1.5">
              <span className="size-2 flex-none rounded-full" style={{ background: seg.color }} />
              {seg.label}
            </span>
          ))}
        </div>
      )}

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

          {isMonthly ? (
            monthlyRates.length >= 2 ? (
              <div className="relative" style={{ height: PLOT_HEIGHT }}>
                <svg
                  viewBox={`0 0 ${CURVE_WIDTH} ${PLOT_HEIGHT}`}
                  width="100%"
                  height={PLOT_HEIGHT}
                  preserveAspectRatio="none"
                  className="overflow-visible"
                >
                  {(() => {
                    const points = monthlyRates.map((m, i) => curvePoint(i, monthlyRates.length, m.rate));
                    const linePath = smoothLinePath(points);
                    const areaPath = `${linePath} L ${points[points.length - 1].x} ${PLOT_HEIGHT} L ${points[0].x} ${PLOT_HEIGHT} Z`;
                    return (
                      <>
                        <path d={areaPath} fill={CURVE_COLOR} opacity={0.12} stroke="none" />
                        <path d={linePath} fill="none" stroke={CURVE_COLOR} strokeWidth={2.5} />
                        {monthlyRates.map((m, i) => {
                          const p = points[i];
                          return (
                            <g key={m.month}>
                              <text x={p.x} y={p.y - 10} textAnchor="middle" className="fill-ink-muted text-[9px] font-semibold tabular">
                                {m.rate}%
                              </text>
                              <circle cx={p.x} cy={p.y} r={3.5} fill={CURVE_COLOR}>
                                <title>{`${monthLabel(m.month)}: ${m.rate}%`}</title>
                              </circle>
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
            ) : (
              <div className="relative flex items-center justify-center text-xs text-ink-faint" style={{ height: PLOT_HEIGHT }}>
                Not enough monthly history yet.
              </div>
            )
          ) : isLessons && bars.length > 0 ? (
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
                const total = b.presentPct + b.catchupPct + b.absentPct;
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
                      {SEGMENTS.map((seg) => (
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
          ) : (
            <div className="relative flex items-center justify-center text-xs text-ink-faint" style={{ height: PLOT_HEIGHT }}>
              No registers saved yet.
            </div>
          )}

          <div className={cn("mt-1.5 flex justify-center", isLessons ? "gap-3" : "gap-2")}>
            {isMonthly
              ? monthlyRates.length >= 2 &&
                monthlyRates.map((m) => (
                  <div key={m.month} className="max-w-[40px] flex-1 text-center text-[9px] text-ink-faint tabular">
                    {monthLabel(m.month)}
                  </div>
                ))
              : bars.map((b, i) => (
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
    </>
  );
}

function DonutBody({ lessonBars, overall }: { lessonBars: ChartBar[]; overall: OverallAttendance }) {
  const recorded = useMemo(() => [...lessonBars].reverse().filter((b) => b.presentCount > 0 || b.absentCount > 0), [lessonBars]);
  const [view, setView] = useState<DonutView>("lesson");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const selected = recorded.find((b) => b.label === selectedLabel) ?? recorded[0] ?? null;
  const shown = view === "overall" ? overall : selected;

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-ink-muted">
          {view === "overall" ? "Whole cohort, to date" : selected ? `${selected.label} · pick a lesson below` : "No lessons recorded yet"}
        </div>
        <Segmented options={DONUT_OPTIONS} value={view} onChange={setView} />
      </div>

      {view === "lesson" && recorded.length > 0 && (
        <select
          value={selected?.label ?? ""}
          onChange={(e) => setSelectedLabel(e.target.value)}
          className="mt-3 w-full rounded-control border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary"
        >
          {recorded.map((b) => (
            <option key={b.label} value={b.label}>
              {b.label}
            </option>
          ))}
        </select>
      )}

      {shown ? (
        <div className="mt-4 flex items-center gap-6">
          <Ring3D size={96}>
            <CompletionRing pct={shown.rate} size={96} strokeWidth={12} tone="cyan">
              <div className="text-center">
                <div className="text-lg font-bold leading-none text-ink tabular">{shown.rate}%</div>
                <div className="mt-0.5 text-[10px] text-ink-muted">present</div>
              </div>
            </CompletionRing>
          </Ring3D>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="size-2.5 flex-none rounded-full bg-accent" />
              <span className="text-[13px] text-ink-secondary">Present</span>
              <span className="ml-auto text-[13px] font-bold text-ink tabular">
                {"presentCount" in shown ? shown.presentCount : shown.present}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 flex-none rounded-full bg-accent-2-500" />
              <span className="text-[13px] text-ink-secondary">Absent</span>
              <span className="ml-auto text-[13px] font-bold text-ink tabular">
                {"absentCount" in shown ? shown.absentCount : shown.absent}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-center py-6 text-xs text-ink-faint">Nothing recorded yet.</div>
      )}
    </>
  );
}
