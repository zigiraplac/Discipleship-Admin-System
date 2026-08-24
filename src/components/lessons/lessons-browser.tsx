"use client";

import { useMemo, useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { buttonVariants } from "@/components/ui/button";
import { ProgressBar, type BarTone } from "@/components/ui/progress-bar";
import { Pill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { CURRICULUM } from "@/lib/domain/curriculum";
import { formatShortDate } from "@/lib/utils";
import type { Role } from "@/lib/domain/types";
import Link from "next/link";

export type LessonRowStatus = "recorded" | "missing" | "upcoming";

export interface LessonRow {
  eventId: string;
  date: string;
  globalIndex: number;
  classNumber: number;
  lessonRef: string;
  lessonTitle: string;
  hasQuiz: boolean;
  status: LessonRowStatus;
  presentText: string; // "29/34" or "—"
  ratePct: number | null;
  tone: BarTone;
  quizText: string; // "82", "quiz", or "—"
}

const FILTER_OPTIONS: SegmentedOption<"all" | LessonRowStatus>[] = [
  { value: "all", label: "All" },
  { value: "recorded", label: "Recorded" },
  { value: "missing", label: "Missing" },
  { value: "upcoming", label: "Upcoming" },
];

function findCurrentPositionId(rows: LessonRow[]): string | null {
  const missing = rows
    .filter((r) => r.status === "missing")
    .sort((a, b) => a.globalIndex - b.globalIndex)[0];
  if (missing) return missing.eventId;
  const upcoming = rows
    .filter((r) => r.status === "upcoming")
    .sort((a, b) => a.globalIndex - b.globalIndex)[0];
  return upcoming?.eventId ?? null;
}

/** Compact summary for a (collapsed or expanded) class header, given the active status filter. */
function summaryText(classRows: LessonRow[], filter: "all" | LessonRowStatus): string {
  const total = classRows.length;
  if (filter === "all") {
    const recorded = classRows.filter((r) => r.status === "recorded").length;
    return `${recorded}/${total} recorded`;
  }
  const count = classRows.filter((r) => r.status === filter).length;
  return `${count} ${filter}`;
}

export function LessonsBrowser({
  cohortId,
  role,
  rows,
}: {
  cohortId: string;
  role: Role;
  rows: LessonRow[];
}) {
  const [filter, setFilter] = useState<"all" | LessonRowStatus>("all");
  const canOpenRegister = role === "facilitator" || role === "admin";

  const rowsByClass = useMemo(() => {
    const map = new Map<number, LessonRow[]>();
    for (const row of rows) {
      const list = map.get(row.classNumber);
      if (list) list.push(row);
      else map.set(row.classNumber, [row]);
    }
    return map;
  }, [rows]);

  // Initialized once from the "current position" lesson (first missing, else first
  // upcoming) — that class starts expanded, every other class starts collapsed.
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(() => {
    const currentPositionId = findCurrentPositionId(rows);
    const current = rows.find((r) => r.eventId === currentPositionId);
    return new Set(current ? [current.classNumber] : []);
  });

  function toggleClass(n: number) {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
      </div>

      <div className="flex flex-col gap-2.5">
        {CURRICULUM.map((cls) => {
          const classRows = rowsByClass.get(cls.n) ?? [];
          const filteredRows = classRows.filter((r) => filter === "all" || r.status === filter);
          const missingCount = classRows.filter((r) => r.status === "missing").length;
          const needsAttention = missingCount > 0;
          const isOpen = expandedClasses.has(cls.n);

          return (
            <Card key={cls.n} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleClass(cls.n)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-[18px] py-4 text-left hover:bg-hover"
              >
                {isOpen ? (
                  <CaretDown size={16} weight="bold" className="flex-none text-ink-faint" />
                ) : (
                  <CaretRight size={16} weight="bold" className="flex-none text-ink-faint" />
                )}
                <span className="flex flex-1 flex-col">
                  <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
                    Class {cls.n} · {cls.title}
                    {needsAttention && (
                      <span
                        aria-label={`${missingCount} missing register${missingCount === 1 ? "" : "s"} in this class`}
                        className="size-[7px] flex-none rounded-full bg-accent-2-500"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 text-xs text-ink-muted">{cls.parts}</span>
                </span>
                <span className="flex flex-none items-center gap-2.5">
                  {needsAttention && <Pill tone="magenta">{missingCount} missing</Pill>}
                  <span className="text-xs font-semibold tabular text-ink-tertiary">
                    {summaryText(classRows, filter)}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-divider">
                  <Table>
                    <THead>
                      <TH>Lesson</TH>
                      <TH>Date</TH>
                      <TH align="right">Present</TH>
                      <TH>Attendance</TH>
                      <TH align="right">Quiz</TH>
                      <TH align="right" />
                    </THead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <TR key={row.eventId}>
                          <TD>
                            <div className="text-[13px] font-semibold text-ink">{row.lessonTitle}</div>
                            <div className="mt-0.5 text-[11px] text-ink-muted">{row.lessonRef}</div>
                          </TD>
                          <TD className="tabular">{formatShortDate(row.date)}</TD>
                          <TD align="right" className="tabular">
                            {row.presentText}
                          </TD>
                          <TD>
                            <span className="flex items-center gap-2.5">
                              <ProgressBar pct={row.ratePct} tone={row.tone} className="w-[62px]" />
                              <span className="text-[12px] font-semibold tabular">
                                {row.ratePct !== null ? `${row.ratePct}%` : "—"}
                              </span>
                            </span>
                          </TD>
                          <TD
                            align="right"
                            className={row.quizText === "quiz" ? "text-ink-faint tabular" : "tabular"}
                          >
                            {row.quizText}
                          </TD>
                          <TD align="right">
                            <RowAction cohortId={cohortId} row={row} canOpenRegister={canOpenRegister} />
                          </TD>
                        </TR>
                      ))}
                      {filteredRows.length === 0 && (
                        <TR>
                          <TD colSpan={6} className="py-6 text-center text-ink-faint">
                            0 lessons match this filter.
                          </TD>
                        </TR>
                      )}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function RowAction({
  cohortId,
  row,
  canOpenRegister,
}: {
  cohortId: string;
  row: LessonRow;
  canOpenRegister: boolean;
}) {
  const label =
    row.status === "missing" ? "Take register" : row.status === "recorded" ? "View" : "Open";
  const variant = row.status === "missing" ? "primary" : "outlineAccent";
  const href = `/c/${cohortId}/lessons/${row.eventId}`;

  if (!canOpenRegister) {
    return (
      <button type="button" disabled className={buttonVariants({ variant: "inert", size: "row" })}>
        {label}
      </button>
    );
  }

  return (
    <Link href={href} className={buttonVariants({ variant, size: "row" })}>
      {label}
    </Link>
  );
}
