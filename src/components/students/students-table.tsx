"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Pill, StatusPill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { buttonVariants } from "@/components/ui/button";
import { MarkOnTrackButton } from "@/components/outcome/mark-on-track-button";
import { outcomeShortLabel, outcomeTone } from "@/components/outcome/outcome-copy";
import { lessonAt, TOTAL_LESSONS } from "@/lib/domain/curriculum";
import { cn } from "@/lib/utils";
import type { Bands, OutcomeKind, Status, StudentAggregate } from "@/lib/domain/types";

type Filter = "all" | "On track" | "Needs help" | "At risk";
type SortKey = "name" | "attended" | "attendance" | "status";

const STATUS_RANK: Record<Status, number> = { "On track": 0, "Needs help": 1, "At risk": 2 };

const FILTER_OPTIONS: SegmentedOption<Filter>[] = [
  { value: "all", label: "All" },
  { value: "On track", label: "On track" },
  { value: "Needs help", label: "Needs help" },
  { value: "At risk", label: "At risk" },
];

export function StudentsTable({
  cohortId,
  cohortSlug,
  roster,
  outcomesByStudent,
  bands,
  headerAction,
}: {
  cohortId: string;
  cohortSlug: string;
  roster: StudentAggregate[];
  outcomesByStudent: Record<string, OutcomeKind>;
  bands: Bands;
  headerAction?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = roster.filter((s) => {
      // A left student always displays "No longer with us" regardless of
      // their frozen status — matching them into a specific On track /
      // Needs help / At risk filter would surface someone whose visible
      // label contradicts the filter that found them.
      const left = s.leftAt != null || outcomesByStudent[s.id] === "left";
      if (filter !== "all" && (left || s.status !== filter)) return false;
      if (q && !s.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return dir * a.fullName.localeCompare(b.fullName);
      if (sort.key === "attended") return dir * (a.attended - b.attended);
      if (sort.key === "attendance") return dir * (a.rate - b.rate);
      // status: left always ranks last regardless of direction — it's not
      // part of the On track/Needs help/At risk severity scale being sorted.
      const aLeft = a.leftAt != null || outcomesByStudent[a.id] === "left";
      const bLeft = b.leftAt != null || outcomesByStudent[b.id] === "left";
      if (aLeft !== bLeft) return aLeft ? 1 : -1;
      return dir * (STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    });
  }, [roster, filter, query, outcomesByStudent, sort]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        <div className="ml-auto flex items-center gap-2.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a name"
            style={{ width: 190 }}
          />
          {headerAction}
        </div>
      </div>
      <Table>
        <THead>
          <SortableTH label="Student" sortKey="name" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <TH>Completed through</TH>
          <SortableTH
            label="Lessons taken"
            sortKey="attended"
            sort={sort}
            onSort={(k) => setSort((s) => nextSort(s, k))}
          />
          <SortableTH label="Attendance" sortKey="attendance" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <SortableTH label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <TH align="right" />
        </THead>
        <tbody>
          {rows.map((s) => {
            const outcome = outcomesByStudent[s.id];
            const pct = s.expected === 0 ? null : s.rate;
            const left = s.leftAt != null || outcome === "left";
            return (
              <TR key={s.id} className={cn(left && "opacity-60")}>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={s.fullName} />
                    <span>
                      <span className="flex items-center gap-1.5">
                        <span className="block text-[13px] font-semibold text-ink">{s.fullName}</span>
                        {left && <Pill tone="grey">Left</Pill>}
                      </span>
                      <span className="block text-[11px] text-ink-muted">{s.country ?? "—"}</span>
                    </span>
                  </span>
                </TD>
                <TD className="text-[12px] text-ink-muted">
                  {left || s.lastAttendedGlobalIndex == null ? (
                    left ? "—" : <span className="text-ink-faint">Not started</span>
                  ) : (
                    (() => {
                      const l = lessonAt(s.lastAttendedGlobalIndex);
                      return `${l.ref} — ${l.title}`;
                    })()
                  )}
                </TD>
                <TD className="tabular" title={`${s.attended} of ${s.expected} recorded lessons so far`}>
                  {s.attended} / {TOTAL_LESSONS}
                </TD>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <ProgressBar
                      pct={pct}
                      tone={toneForRate(s.rate, bands.activeThreshold, bands.helpThreshold)}
                      className="w-[68px]"
                    />
                    <span className="text-[12px] font-semibold tabular">{pct === null ? "—" : `${pct}%`}</span>
                  </span>
                </TD>
                <TD>
                  {left ? (
                    <Pill tone="grey">No longer with us</Pill>
                  ) : outcome === "resolved" && s.status !== "On track" ? (
                    // A "resolved" decision only holds while it's still
                    // true. The moment live attendance disagrees (they've
                    // fallen behind again since being marked back on
                    // track), this record is stale — show the current band
                    // instead of a frozen "Back on track" pill. Matches
                    // followup/page.tsx's existing handling of the same
                    // relapse case.
                    <StatusPill status={s.status} />
                  ) : outcome === "catchup" && s.missed === 0 ? (
                    <span className="flex flex-col items-start gap-1">
                      <Pill tone="yellow">Ready to update</Pill>
                      <MarkOnTrackButton studentId={s.id} cohortId={cohortId} studentName={s.fullName} size="row" />
                    </span>
                  ) : outcome ? (
                    <Pill tone={outcomeTone(outcome)}>{outcomeShortLabel(outcome)}</Pill>
                  ) : s.expected === 0 ? (
                    // `status` defaults to "On track" here purely so a
                    // just-enrolled student isn't flagged "At risk" with
                    // nothing recorded since they joined (metrics.ts) — but
                    // showing that as the same green "On track" pill next to
                    // a real 0/80 reads as a contradiction. This is a
                    // distinct, neutral "hasn't started yet," not a judged
                    // good rate.
                    <Pill tone="grey">Not started</Pill>
                  ) : (
                    <StatusPill status={s.status} />
                  )}
                </TD>
                <TD align="right">
                  <Link
                    href={`/c/${cohortSlug}/students/${s.id}`}
                    className={buttonVariants({ variant: "secondary", size: "row" })}
                  >
                    Open
                  </Link>
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-ink-faint">
                No students match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
