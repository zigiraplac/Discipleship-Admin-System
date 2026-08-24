"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretDown, CaretRight, Check } from "@phosphor-icons/react";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { ProgressBar, type BarTone } from "@/components/ui/progress-bar";
import { Pill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { CURRICULUM } from "@/lib/domain/curriculum";
import { cn, formatShortDate } from "@/lib/utils";
import { postponeLesson } from "@/lib/actions/schedule";
import type { Role } from "@/lib/domain/types";

export type LessonRowStatus = "recorded" | "missing" | "upcoming";

export interface LessonRow {
  eventId: string;
  date: string;
  globalIndex: number;
  classNumber: number;
  lessonRef: string;
  lessonTitle: string;
  status: LessonRowStatus;
  presentText: string; // "29/34" or "—"
  ratePct: number | null;
  tone: BarTone;
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

  // "Current position" (first missing, else first upcoming) doubles as the
  // one visual highlight in the whole list — its class badge and its own
  // row get the accent treatment; everything else stays neutral.
  const currentPositionId = useMemo(() => findCurrentPositionId(rows), [rows]);
  const currentClassNumber = useMemo(
    () => rows.find((r) => r.eventId === currentPositionId)?.classNumber ?? null,
    [rows, currentPositionId]
  );

  // Initialized once from the current-position lesson's class — that class
  // starts expanded, every other class starts collapsed.
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(
    () => new Set(currentClassNumber != null ? [currentClassNumber] : [])
  );

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
          const isCurrentClass = cls.n === currentClassNumber;
          const isCompletedClass = classRows.length > 0 && classRows.every((r) => r.status === "recorded");

          return (
            <Card
              key={cls.n}
              className={cn("overflow-hidden", isCurrentClass && "border-emerald-300")}
            >
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
                <span
                  className={cn(
                    "grid size-8 flex-none place-items-center rounded-full text-[13px] font-bold tabular",
                    isCurrentClass
                      ? "bg-emerald-500 text-white"
                      : isCompletedClass
                        ? "bg-accent text-white"
                        : "bg-divider text-ink-secondary"
                  )}
                >
                  {cls.n}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
                    {cls.title}
                    {isCurrentClass && <Pill tone="green">In progress</Pill>}
                    {isCompletedClass && <Pill tone="cyan">Completed</Pill>}
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
                      <TH align="right" />
                    </THead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <TR key={row.eventId}>
                          <TD>
                            <span className="flex items-center gap-2.5">
                              <StatusDot status={row.status} isCurrent={row.eventId === currentPositionId} />
                              <span>
                                <div className="text-[13px] font-semibold text-ink">{row.lessonTitle}</div>
                                <div className="mt-0.5 text-[11px] text-ink-muted">{row.lessonRef}</div>
                              </span>
                            </span>
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
                          <TD align="right">
                            <span className="flex items-center justify-end gap-2">
                              {row.status === "missing" && canOpenRegister && (
                                <PostponeButton cohortId={cohortId} eventId={row.eventId} lessonRef={row.lessonRef} />
                              )}
                              <RowAction cohortId={cohortId} row={row} canOpenRegister={canOpenRegister} />
                            </span>
                          </TD>
                        </TR>
                      ))}
                      {filteredRows.length === 0 && (
                        <TR>
                          <TD colSpan={5} className="py-6 text-center text-ink-faint">
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

/** A quick "where am I" read down the left of each lesson row, using the
 * standard status palette: blue for a saved register (done), green for
 * whichever one is next up (on track — nothing's wrong yet), red for
 * backlog that's overdue (critical), grey for anything further out (not
 * started). */
function StatusDot({ status, isCurrent }: { status: LessonRowStatus; isCurrent: boolean }) {
  if (status === "recorded") {
    return (
      <span className="grid size-5 flex-none place-items-center rounded-full bg-accent text-white">
        <Check size={11} weight="bold" />
      </span>
    );
  }
  if (isCurrent) {
    return <span className="size-5 flex-none rounded-full border-2 border-emerald-500" />;
  }
  if (status === "missing") {
    return <span className="size-5 flex-none rounded-full border-2 border-accent-2-400" />;
  }
  return <span className="size-5 flex-none rounded-full border-2 border-border" />;
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

/**
 * "We didn't get to this today" — explicit and manual, never inferred
 * from a date just passing, per the product decision: a facilitator
 * might simply not have entered the register yet, and auto-shifting on
 * that assumption would reshuffle the calendar under them.
 */
function PostponeButton({
  cohortId,
  eventId,
  lessonRef,
}: {
  cohortId: string;
  eventId: string;
  lessonRef: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await postponeLesson({ cohortId, eventId });
      setOpen(false);
      show(
        result.shiftedCount > 1
          ? `${lessonRef} postponed — ${result.shiftedCount} lessons and crusade days shifted forward.`
          : `${lessonRef} postponed to the next study day.`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't postpone this lesson. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "secondary", size: "row" })}>
        Postpone
      </DialogTrigger>
      <DialogPopup width={380}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Postpone {lessonRef}?</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            This pushes it, and every lesson and crusade day after it that hasn&rsquo;t been
            taught yet, forward by one study day. Already-recorded lessons are never touched.
          </DialogDescription>
        </div>
        {error && (
          <div className="px-5 pb-1 pt-3 text-xs font-medium text-accent-2-700">{error}</div>
        )}
        <div className="mt-3 flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={pending} onClick={handleConfirm}>
            {pending && <Spinner />}
            {pending ? "Postponing…" : "Postpone"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
