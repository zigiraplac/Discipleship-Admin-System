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
import { lessonAt, TOTAL_LESSONS } from "@/lib/domain/curriculum";
import { cn } from "@/lib/utils";
import { LIFECYCLE_LABELS, studentIntervention, studentLifecycle, studentPerformance } from "@/lib/domain/student-state";
import type { Bands, OutcomeKind, Status, StudentAggregate } from "@/lib/domain/types";

export type Filter = "all" | "On track" | "Needs help" | "At risk";
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
  inactiveIds = [],
  bands,
  cohortFinished = false,
  graduatedIds = [],
  showIntervention = true,
  initialFilter = "all",
  today,
  headerAction,
}: {
  cohortId: string;
  cohortSlug: string;
  roster: StudentAggregate[];
  outcomesByStudent: Record<string, OutcomeKind>;
  /** Still enrolled, but absent at their last few recorded lessons in a row. */
  inactiveIds?: string[];
  bands: Bands;
  /** Everyone still enrolled has completed. */
  cohortFinished?: boolean;
  /** Of those, who meets the graduation rule (computed server-side). */
  graduatedIds?: string[];
  /** Follow-up/catch-up state is pastoral — only for those who may see it. */
  showIntervention?: boolean;
  initialFilter?: Filter;
  today: string;
  headerAction?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const inactive = useMemo(() => new Set(inactiveIds), [inactiveIds]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = roster.filter((s) => {
      // Performance filters only ever match students still in the programme.
      if (filter !== "all" && (s.leftAt != null || s.performance !== filter)) return false;
      if (q && !s.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return dir * a.fullName.localeCompare(b.fullName);
      if (sort.key === "attended") return dir * (a.attended - b.attended);
      if (sort.key === "attendance") return dir * (a.rate - b.rate);
      // Left students always last — they're off the performance scale.
      if ((a.leftAt != null) !== (b.leftAt != null)) return a.leftAt ? 1 : -1;
      return dir * (STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    });
  }, [roster, filter, query, sort]);

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
          <TH>Lifecycle</TH>
          <SortableTH label="Performance" sortKey="status" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          {showIntervention && <TH>Intervention</TH>}
          <SortableTH label="Attendance" sortKey="attendance" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <SortableTH label="Progress" sortKey="attended" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <TH align="right" />
        </THead>
        <tbody>
          {rows.map((s) => {
            const outcome = outcomesByStudent[s.id] ?? null;
            const lifecycle = studentLifecycle(s, cohortFinished, graduatedIds.includes(s.id));
            const performance = studentPerformance(s, lifecycle);
            const intervention = studentIntervention(s, outcome, today);
            const pct = s.expected === 0 ? null : s.rate;
            return (
              <TR key={s.id} className={cn(lifecycle === "left" && "opacity-60")}>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={s.fullName} />
                    <span>
                      <span className="block text-[13px] font-semibold text-ink">{s.fullName}</span>
                      <span className="block text-[11px] text-ink-muted">{s.country ?? "—"}</span>
                    </span>
                  </span>
                </TD>
                <TD>
                  <span className="flex flex-wrap items-center gap-1">
                    <Pill tone={lifecycle === "left" || lifecycle === "registered" ? "grey" : lifecycle === "graduated" ? "green" : lifecycle === "completed" ? "teal" : "cyan"}>
                      {LIFECYCLE_LABELS[lifecycle]}
                    </Pill>
                    {lifecycle === "active" && inactive.has(s.id) && (
                      <span title="Absent at their last few recorded lessons in a row">
                        <Pill tone="magenta">Inactive</Pill>
                      </span>
                    )}
                  </span>
                </TD>
                <TD>
                  {performance === null ? (
                    <span className="text-[12px] text-ink-faint">—</span>
                  ) : performance === "Not started" ? (
                    <Pill tone="grey">Not started</Pill>
                  ) : (
                    <StatusPill status={performance} />
                  )}
                </TD>
                {showIntervention && (
                  <TD>
                    {intervention.kind === "catch-up" ? (
                      intervention.complete ? (
                        <span className="flex flex-col items-start gap-1">
                          <Pill tone="green">Catch-up done</Pill>
                          <MarkOnTrackButton studentId={s.id} cohortId={cohortId} studentName={s.fullName} size="row" />
                        </span>
                      ) : (
                        <Pill tone="amber">
                          Catch-up {intervention.recovered}/{intervention.toRecover}
                        </Pill>
                      )
                    ) : intervention.kind === "follow-up" ? (
                      <Pill tone={intervention.overdue ? "magenta" : "yellow"}>
                        {intervention.overdue ? "Follow-up overdue" : intervention.contacted ? "Contacted" : "Follow-up"}
                      </Pill>
                    ) : outcome === "resolved" && lifecycle !== "left" ? (
                      <span className="text-[12px] text-ink-muted">Resolved</span>
                    ) : (
                      <span className="text-[12px] text-ink-faint">—</span>
                    )}
                  </TD>
                )}
                <TD>
                  <span className="flex items-center gap-2.5">
                    <ProgressBar
                      pct={pct}
                      tone={toneForRate(s.rate, bands.activeThreshold, bands.helpThreshold)}
                      className="w-[68px]"
                    />
                    <span className="text-[12px] font-semibold tabular">{pct === null ? "—" : `${pct}%`}</span>
                  </span>
                  {s.recovered > 0 && (
                    <span className="mt-0.5 block text-[11px] text-ink-muted" title="Counting lessons made up through catch-up">
                      {s.effectiveRate}% with {s.recovered} caught up
                    </span>
                  )}
                </TD>
                <TD className="text-[12px] text-ink-muted" title={`${s.attended} of ${s.expected} recorded lessons attended`}>
                  {s.lastAttendedGlobalIndex == null ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    <>
                      <span className="block font-semibold tabular text-ink-secondary">
                        {s.attended} / {TOTAL_LESSONS}
                      </span>
                      <span className="block">Through {lessonAt(s.lastAttendedGlobalIndex).ref}</span>
                    </>
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
              <TD colSpan={showIntervention ? 7 : 6} className="py-6 text-center text-ink-faint">
                No students match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
