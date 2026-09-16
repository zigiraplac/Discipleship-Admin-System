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
import { Label, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { CURRICULUM, partDisplayLabel, partSpans, partsSummary } from "@/lib/domain/curriculum";
import { cn, formatShortDate } from "@/lib/utils";
import { postponeLesson } from "@/lib/actions/schedule";
import { ViewToggle, type ViewMode } from "@/components/shared/view-toggle";
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
  /** Ever postponed — always false for teacher (the public view doesn't
   * carry it), a documented gap consistent with that role's lighter data. */
  edited: boolean;
}

const FILTER_OPTIONS: SegmentedOption<"all" | LessonRowStatus>[] = [
  { value: "all", label: "All" },
  { value: "recorded", label: "Recorded" },
  { value: "missing", label: "Missing" },
  { value: "upcoming", label: "Upcoming" },
];

export function findCurrentPositionId(rows: LessonRow[]): string | null {
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
  cohortSlug,
  role,
  rows,
}: {
  cohortId: string;
  cohortSlug: string;
  role: Role;
  rows: LessonRow[];
}) {
  const [filter, setFilter] = useState<"all" | LessonRowStatus>("all");
  const [view, setView] = useState<ViewMode>("list");
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
        <ViewToggle value={view} onChange={setView} className="ml-auto" />
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

          // A class like 3 or 4 with a real Part A/Part B split (per
          // curriculum.ts) groups its lessons under a labeled sub-header for
          // each part instead of one flat list — a class with only one part
          // (most of them) renders exactly as before.
          const partIndexByEventId = new Map<string, number>();
          if (cls.parts.length > 1) {
            const spans = partSpans(cls);
            classRows.forEach((row, i) => {
              const pi = spans.findIndex(([a, b]) => i >= a && i <= b);
              partIndexByEventId.set(row.eventId, pi < 0 ? spans.length - 1 : pi);
            });
          }

          return (
            <Card
              key={cls.n}
              className={cn("overflow-hidden", isCurrentClass && "border-accent-300")}
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
                      ? "bg-accent text-white"
                      : isCompletedClass
                        ? "bg-emerald-500 text-white"
                        : "bg-divider text-ink-secondary"
                  )}
                >
                  {cls.n}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
                    {cls.title}
                    {isCurrentClass && <Pill tone="cyan">In progress</Pill>}
                    {isCompletedClass && <Pill tone="green">Completed</Pill>}
                    {needsAttention && (
                      <span
                        aria-label={`${missingCount} missing register${missingCount === 1 ? "" : "s"} in this class`}
                        className="size-[7px] flex-none rounded-full bg-accent-2-500"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 text-xs text-ink-muted">{partsSummary(cls)}</span>
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
                  {cls.parts.length <= 1 ? (
                    <LessonRowsView
                      rows={filteredRows}
                      view={view}
                      currentPositionId={currentPositionId}
                      cohortId={cohortId}
                      cohortSlug={cohortSlug}
                      canOpenRegister={canOpenRegister}
                    />
                  ) : (
                    <>
                      {cls.parts.map((part, pi) => {
                        const partRows = filteredRows.filter((row) => partIndexByEventId.get(row.eventId) === pi);
                        if (partRows.length === 0) return null;
                        return (
                          <div key={pi}>
                            <div className="border-t border-divider bg-subtle px-[18px] py-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted first:border-t-0">
                              {partDisplayLabel(part, pi, cls.parts.length)} · {part.count} lessons
                            </div>
                            <LessonRowsView
                              rows={partRows}
                              view={view}
                              currentPositionId={currentPositionId}
                              cohortId={cohortId}
                              cohortSlug={cohortSlug}
                              canOpenRegister={canOpenRegister}
                            />
                          </div>
                        );
                      })}
                      {filteredRows.length === 0 && (
                        <div className="py-6 text-center text-sm text-ink-faint">0 lessons match this filter.</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Switches a set of rows (a whole class, or one part of a Part A/B split)
 * between the dense list (a table) and a scannable card grid. */
function LessonRowsView({
  rows,
  view,
  currentPositionId,
  cohortId,
  cohortSlug,
  canOpenRegister,
}: {
  rows: LessonRow[];
  view: ViewMode;
  currentPositionId: string | null;
  cohortId: string;
  cohortSlug: string;
  canOpenRegister: boolean;
}) {
  if (view === "cards") {
    return (
      <div
        className="grid gap-3 p-[14px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
      >
        {rows.map((row) => (
          <LessonCard
            key={row.eventId}
            row={row}
            isCurrent={row.eventId === currentPositionId}
            cohortId={cohortId}
            cohortSlug={cohortSlug}
            canOpenRegister={canOpenRegister}
          />
        ))}
        {rows.length === 0 && (
          <div className="col-span-full py-6 text-center text-sm text-ink-faint">0 lessons match this filter.</div>
        )}
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <TH>Lesson</TH>
        <TH>Date</TH>
        <TH>Attendance</TH>
        <TH align="right" />
      </THead>
      <tbody>
        {rows.map((row) => (
          <LessonTR
            key={row.eventId}
            row={row}
            isCurrent={row.eventId === currentPositionId}
            cohortId={cohortId}
            cohortSlug={cohortSlug}
            canOpenRegister={canOpenRegister}
          />
        ))}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={4} className="py-6 text-center text-ink-faint">
              0 lessons match this filter.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}

/** A single lesson, as a compact tile — the Cards view's equivalent of
 * `LessonTR`, same information and actions, laid out to be scanned as a
 * grid instead of read down a table. */
function LessonCard({
  row,
  isCurrent,
  cohortId,
  cohortSlug,
  canOpenRegister,
}: {
  row: LessonRow;
  isCurrent: boolean;
  cohortId: string;
  cohortSlug: string;
  canOpenRegister: boolean;
}) {
  return (
    <Card className={cn("flex flex-col gap-2.5 p-3.5", isCurrent && "border-accent-300")}>
      <div className="flex items-start gap-2">
        <StatusDot status={row.status} isCurrent={isCurrent} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{row.lessonTitle}</div>
          <div className="text-[11px] text-ink-muted">{row.lessonRef}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>{formatShortDate(row.date)}</span>
        {row.edited && <Pill tone="amber">Postponed</Pill>}
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar pct={row.ratePct} tone={row.tone} className="flex-1" />
        <span className="flex-none text-[12px] font-semibold tabular text-ink-secondary">
          {row.presentText}
          {row.ratePct !== null ? ` · ${row.ratePct}%` : ""}
        </span>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-1">
        {row.status === "missing" && canOpenRegister && (
          <PostponeButton cohortId={cohortId} eventId={row.eventId} lessonRef={row.lessonRef} />
        )}
        <span className="flex-1">
          <RowAction cohortSlug={cohortSlug} row={row} canOpenRegister={canOpenRegister} />
        </span>
      </div>
    </Card>
  );
}

/** One lesson row — shared between the single-table (most classes) and the
 * per-part sub-tables (classes with a real Part A/Part B split). */
function LessonTR({
  row,
  isCurrent,
  cohortId,
  cohortSlug,
  canOpenRegister,
}: {
  row: LessonRow;
  isCurrent: boolean;
  cohortId: string;
  cohortSlug: string;
  canOpenRegister: boolean;
}) {
  return (
    <TR>
      <TD>
        <span className="flex items-center gap-2.5">
          <StatusDot status={row.status} isCurrent={isCurrent} />
          <span>
            <div className="text-[13px] font-semibold text-ink">{row.lessonTitle}</div>
            <div className="mt-0.5 text-[11px] text-ink-muted">{row.lessonRef}</div>
          </span>
        </span>
      </TD>
      <TD className="tabular">{formatShortDate(row.date)}</TD>
      <TD>
        <span className="flex items-center gap-2.5">
          <ProgressBar pct={row.ratePct} tone={row.tone} className="w-[54px]" />
          <span className="text-[12px] font-semibold tabular">
            {row.presentText}
            {row.ratePct !== null ? ` · ${row.ratePct}%` : ""}
          </span>
        </span>
      </TD>
      <TD align="right">
        <span className="flex items-center justify-end gap-2">
          {row.status === "missing" && canOpenRegister && (
            <PostponeButton cohortId={cohortId} eventId={row.eventId} lessonRef={row.lessonRef} />
          )}
          <RowAction cohortSlug={cohortSlug} row={row} canOpenRegister={canOpenRegister} />
        </span>
      </TD>
    </TR>
  );
}

/** A quick "where am I" read down the left of each lesson row, using the
 * standard status palette: green for a saved register (done), this app's
 * accent blue for whichever one is next up (in progress), red for
 * backlog that's overdue (critical), grey for anything further out (not
 * started). */
function StatusDot({ status, isCurrent }: { status: LessonRowStatus; isCurrent: boolean }) {
  if (status === "recorded") {
    return (
      <span className="grid size-5 flex-none place-items-center rounded-full bg-emerald-500 text-white">
        <Check size={11} weight="bold" />
      </span>
    );
  }
  if (isCurrent) {
    return <span className="size-5 flex-none rounded-full border-2 border-accent" />;
  }
  if (status === "missing") {
    return <span className="size-5 flex-none rounded-full border-2 border-accent-2-400" />;
  }
  return <span className="size-5 flex-none rounded-full border-2 border-border" />;
}

function RowAction({
  cohortSlug,
  row,
  canOpenRegister,
}: {
  cohortSlug: string;
  row: LessonRow;
  canOpenRegister: boolean;
}) {
  const label =
    row.status === "missing" ? "Take register" : row.status === "recorded" ? "View" : "Open";
  const variant = row.status === "missing" ? "primary" : "outlineAccent";
  const href = `/c/${cohortSlug}/lessons/${row.eventId}`;

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
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await postponeLesson({ cohortId, eventId, reason: reason.trim() || undefined });
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
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
        <div className="px-5 pt-3">
          <Label htmlFor="postpone-reason">Reason (optional)</Label>
          <Textarea
            id="postpone-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Venue unavailable, low turnout expected…"
          />
          <p className="mt-1 text-[11px] text-ink-faint">Shown on Reports&rsquo; What changed timeline.</p>
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
