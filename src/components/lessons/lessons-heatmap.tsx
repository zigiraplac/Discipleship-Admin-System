"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { findCurrentPositionId, type LessonRow } from "./lessons-browser";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function toUTC(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86_400_000;

interface HeatCell {
  weekIndex: number;
  weekdayIndex: number; // 0 = Monday .. 6 = Sunday
  row: LessonRow | null;
}

/**
 * The whole 80-lesson journey at a glance, GitHub-contribution-style — one
 * square per real calendar day the curriculum touches. A postponed lesson
 * keeps its real, current (rescheduled) date, so it just shows up on
 * whichever day it's actually now scheduled for — no separate "moved"
 * marker needed for that, only the color itself. Three solid states,
 * deliberately simpler than the rate-tiered coloring used elsewhere in
 * this app: given (green), postponed or overdue (yellow), not yet taken
 * (grey). Exact attendance for a given lesson is one click away on the
 * Lessons table instead.
 */
export function LessonsHeatmap({
  cohortSlug,
  rows,
  canOpenRegister,
  compact = false,
}: {
  cohortSlug: string;
  rows: LessonRow[];
  canOpenRegister: boolean;
  /** Drops the legend and shortens the header for the narrow dashboard
   * placement, where the card sits beside/under Upcoming birthdays. */
  compact?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const currentPositionId = useMemo(() => findCurrentPositionId(rows), [rows]);

  const { cells, weekCount, monthMarks } = useMemo(() => {
    if (rows.length === 0) return { cells: [] as HeatCell[], weekCount: 0, monthMarks: [] as { week: number; label: string }[] };

    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const firstMs = toUTC(sorted[0].date);
    const lastMs = toUTC(sorted[sorted.length - 1].date);
    const firstWeekday = (new Date(firstMs).getUTCDay() + 6) % 7; // 0 = Mon
    const gridStartMs = firstMs - firstWeekday * DAY_MS;
    const totalDays = Math.round((lastMs - gridStartMs) / DAY_MS) + 1;
    const weeks = Math.ceil(totalDays / 7);

    const byDay = new Map<number, LessonRow>();
    for (const r of sorted) byDay.set(Math.round((toUTC(r.date) - gridStartMs) / DAY_MS), r);

    const cellList: HeatCell[] = [];
    let lastMonth = -1;
    const marks: { week: number; label: string }[] = [];
    for (let day = 0; day < weeks * 7; day++) {
      const weekIndex = Math.floor(day / 7);
      const weekdayIndex = day % 7;
      const row = byDay.get(day) ?? null;
      cellList.push({ weekIndex, weekdayIndex, row });

      const month = new Date(gridStartMs + day * DAY_MS).getUTCMonth();
      if (weekdayIndex === 0 && month !== lastMonth) {
        marks.push({ week: weekIndex, label: MONTH_SHORT[month] });
        lastMonth = month;
      }
    }

    return { cells: cellList, weekCount: weeks, monthMarks: marks };
  }, [rows]);

  if (rows.length === 0) return null;

  const cellSize = 11;
  const gap = 3;

  function cellTitle(row: LessonRow): string {
    const base = `${row.lessonRef} · ${row.lessonTitle} · ${row.date}`;
    if (row.status === "upcoming") return `${base} · not yet taught`;
    if (row.status === "missing") return `${base} · overdue, no register${row.edited ? " · postponed here" : ""}`;
    return `${base} · ${row.presentText}${row.ratePct !== null ? ` · ${row.ratePct}%` : ""}${row.edited ? " · postponed here" : ""}`;
  }

  // A postponed lesson only turns yellow once it's actually overdue —
  // being rescheduled to a later date isn't a problem by itself, so a
  // postponed lesson that's still genuinely upcoming looks exactly like
  // any other not-yet-taken lesson (grey) until it's either given
  // (green) or its new date passes without a register (yellow).
  function cellTone(row: LessonRow): string {
    if (row.status === "recorded") return "bg-emerald-500";
    if (row.status === "missing") return "bg-yellow";
    return "bg-divider";
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3.5">
        <div>
          <div className="text-[15px] font-bold text-ink">Whole journey</div>
          {!compact && (
            <div className="mt-0.5 text-xs text-ink-muted">
              Every lesson, by the day it&rsquo;s actually scheduled — hover a square for details.
            </div>
          )}
        </div>
        {!compact && <Legend />}
      </div>
      <div className="overflow-x-auto px-[18px] pb-4">
        <div style={{ width: weekCount * (cellSize + gap) }}>
          <div className="relative" style={{ height: 14 }}>
            {monthMarks.map((m) => (
              <div
                key={m.week}
                className="absolute top-0 text-[10px] text-ink-faint"
                style={{ left: m.week * (cellSize + gap) }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${weekCount}, ${cellSize}px)`,
              gridTemplateRows: `repeat(7, ${cellSize}px)`,
              gap,
            }}
          >
            {cells.map((cell, i) => {
              const style: React.CSSProperties = {
                gridColumn: cell.weekIndex + 1,
                gridRow: cell.weekdayIndex + 1,
              };
              if (!cell.row) {
                return <div key={i} className="rounded-[2px] bg-page" style={style} />;
              }
              const row = cell.row;
              const isCurrent = row.eventId === currentPositionId;
              const isHovered = hovered === row.eventId;
              const className = cn(
                "rounded-[2px] transition-transform",
                cellTone(row),
                isCurrent && "ring-2 ring-accent ring-offset-1",
                isHovered && "scale-125"
              );
              const title = cellTitle(row);

              if (canOpenRegister) {
                return (
                  <Link
                    key={i}
                    href={`/c/${cohortSlug}/lessons/${row.eventId}`}
                    title={title}
                    style={style}
                    className={className}
                    onMouseEnter={() => setHovered(row.eventId)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              }
              return (
                <div
                  key={i}
                  title={title}
                  style={style}
                  className={className}
                  onMouseEnter={() => setHovered(row.eventId)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 sm:flex">
      <div className="flex items-center gap-1.5">
        <span className="size-[9px] rounded-[2px] bg-emerald-500" />
        <span className="text-[10px] text-ink-faint">Given</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-[9px] rounded-[2px] bg-yellow" />
        <span className="text-[10px] text-ink-faint">Overdue</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-[9px] rounded-[2px] bg-divider" />
        <span className="text-[10px] text-ink-faint">Not taken</span>
      </div>
    </div>
  );
}
