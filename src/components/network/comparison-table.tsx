"use client";

import { useRouter } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/utils";
import type { Bands } from "@/lib/domain/types";
import type { ComparisonRow } from "@/lib/data/org-view";
import { STATUS_COLORS } from "./status-split";
import { Change } from "./change";
import { useOverviewPanel } from "./overview-panel";

function Mix({ r }: { r: ComparisonRow }) {
  const total = r.onTrack + r.needsHelp + r.atRisk;
  if (!total) return null;
  return (
    <span className="mt-1 flex h-1.5 w-20 overflow-hidden rounded-full bg-subtle" aria-hidden>
      {(["onTrack", "needsHelp", "atRisk"] as const).map((k) =>
        r[k] ? <span key={k} style={{ flex: r[k], background: STATUS_COLORS[k] }} /> : null
      )}
    </span>
  );
}

function rateTone(rate: number | null, bands: Bands): string {
  if (rate == null) return "text-ink-faint";
  if (rate >= bands.activeThreshold) return "text-ink";
  if (rate >= bands.helpThreshold) return "text-yellow-ink";
  return "text-accent-2-700";
}

const scheduleTone = { behind: "yellow", on: "cyan", ahead: "cyan", upcoming: "grey", finished: "grey" } as const;

/**
 * A level's children side by side — organizational, not student-level.
 * Each row opens that level (or cohort). `variant="cohorts"` adds the
 * schedule position a promotion compares its cohorts by.
 */
export function ComparisonTable({
  rows,
  bands,
  firstColumn,
  variant = "org",
}: {
  rows: ComparisonRow[];
  bands: Bands;
  firstColumn: string;
  variant?: "org" | "cohorts";
}) {
  const router = useRouter();
  const openSummary = useOverviewPanel();
  // A cohort the viewer doesn't work in opens as a summary, not its pages.
  const go = (r: ComparisonRow) => (r.href ? router.push(r.href) : openSummary({ kind: r.kind, id: r.id }));
  if (!rows.length) return <p className="px-4 py-8 text-center text-[13px] text-ink-muted">Nothing inside yet.</p>;
  const sorted = [...rows].sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.issues - a.issues || b.students - a.students);

  return (
    <Table>
      <THead>
        <TH>{firstColumn}</TH>
        <TH align="right">Students</TH>
        <TH align="right">Attendance</TH>
        <TH align="right">At risk</TH>
        <TH align="right">Needs help</TH>
        <TH>{variant === "cohorts" ? "Progress" : "Avg progress"}</TH>
        {variant === "cohorts" ? <TH>Schedule</TH> : <TH align="right">Behind</TH>}
        <TH align="right">Registers</TH>
        <TH align="right">Follow-ups</TH>
        <TH />
      </THead>
      <tbody>
        {sorted.map((r) => (
          <TR
            key={r.id}
            className="cursor-pointer hover:bg-hover"
            onClick={() => go(r)}
            onKeyDown={(e) => e.key === "Enter" && go(r)}
            tabIndex={0}
            aria-label={`Open ${r.name}`}
          >
            <TD>
              <div className="flex items-center gap-2">
                {r.urgent && <span className="size-2 flex-none rounded-full bg-accent-2-500" aria-label="Needs attention" />}
                <span className="truncate text-[13px] font-semibold text-ink">{r.name}</span>
              </div>
              {variant === "org" && <div className="text-[11px] text-ink-muted">{r.levelLabel}</div>}
            </TD>
            <TD align="right">
              <div className="flex flex-col items-end">
                <span className="text-[13px] font-semibold tabular text-ink">{r.students}</span>
                <Mix r={r} />
              </div>
            </TD>
            <TD align="right">
              <div className="flex flex-col items-end leading-tight">
                <span className={cn("text-[13px] font-bold tabular", rateTone(r.attendance, bands))}>
                  {r.attendance != null ? `${r.attendance}%` : "—"}
                </span>
                <Change now={r.attendance} before={r.attendancePrev} />
              </div>
            </TD>
            <TD align="right" className={cn("tabular text-[13px]", r.atRisk ? "font-bold text-accent-2-700" : "text-ink-faint")}>{r.atRisk}</TD>
            <TD align="right" className={cn("tabular text-[13px]", r.needsHelp ? "font-semibold text-yellow-ink" : "text-ink-faint")}>{r.needsHelp}</TD>
            <TD>
              {r.progress != null ? (
                <div className="flex items-center gap-2">
                  <ProgressBar pct={r.progress} tone="cyan" className="w-14" />
                  <span className="whitespace-nowrap text-[12px] tabular text-ink-secondary">{r.lessonText ?? `${r.progress}%`}</span>
                </div>
              ) : (
                <span className="text-[12px] text-ink-faint">—</span>
              )}
            </TD>
            {variant === "cohorts" ? (
              <TD>
                {r.schedule && (
                  <Pill tone={scheduleTone[r.schedule]}>
                    {r.schedule === "behind" && r.lessonsBehind ? `${r.lessonsBehind} behind` : r.schedule === "on" ? "On schedule" : r.schedule[0].toUpperCase() + r.schedule.slice(1)}
                  </Pill>
                )}
              </TD>
            ) : (
              <TD align="right" className={cn("tabular text-[13px]", r.cohortsBehind ? "font-semibold text-yellow-ink" : "text-ink-faint")}>
                {r.cohortsBehind}
              </TD>
            )}
            <TD align="right">
              <span className={cn("text-[13px] tabular", r.registersMissing ? "font-semibold text-yellow-ink" : "text-ink-secondary")}>
                {r.registerCompletion != null ? `${r.registerCompletion}%` : "—"}
              </span>
              {r.registersMissing > 0 && <div className="text-[11px] text-ink-muted">{r.registersMissing} missing</div>}
            </TD>
            <TD align="right">
              <span className={cn("text-[13px] tabular", r.followUps ? "font-semibold text-ink" : "text-ink-faint")}>{r.followUps}</span>
              {r.overdue > 0 && <div className="text-[11px] font-semibold text-accent-2-700">{r.overdue} overdue</div>}
            </TD>
            <TD align="right">
              <CaretRight size={12} className="text-ink-faint" />
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
