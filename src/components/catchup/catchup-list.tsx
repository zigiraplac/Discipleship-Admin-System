"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { buttonVariants } from "@/components/ui/button";
import { OutcomeModal } from "@/components/outcome/outcome-modal";
import { outcomeShortLabel, outcomeTone } from "@/components/outcome/outcome-copy";
import { MarkOnTrackButton } from "@/components/outcome/mark-on-track-button";
import type { AttendanceSince } from "@/lib/domain/metrics";
import type { Bands, Outcome, StudentAggregate } from "@/lib/domain/types";

export interface CatchupEntry {
  student: StudentAggregate;
  outcome: Outcome;
  sinceProgress: AttendanceSince | null;
}

type Filter = "all" | "onCatchup" | "readyToUpdate";
type SortKey = "name" | "missed" | "since";

const FILTER_OPTIONS: SegmentedOption<Filter>[] = [
  { value: "all", label: "All" },
  { value: "onCatchup", label: "On catch-up" },
  { value: "readyToUpdate", label: "Ready to update" },
];

/** Same layout as StudentsTable — a filter + search in the table's own
 * header, one continuous sortable table — instead of separate tab panels
 * per group. */
export function CatchupList({
  entries,
  cohortId,
  cohortSlug,
  bands,
  canRecord,
}: {
  entries: CatchupEntry[];
  cohortId: string;
  cohortSlug: string;
  bands: Bands;
  canRecord: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      const readyToUpdate = e.student.missed === 0;
      if (filter === "onCatchup" && readyToUpdate) return false;
      if (filter === "readyToUpdate" && !readyToUpdate) return false;
      if (q && !e.student.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return dir * a.student.fullName.localeCompare(b.student.fullName);
      if (sort.key === "missed") return dir * (a.student.missed - b.student.missed);
      const aRate = a.sinceProgress?.rate ?? -1;
      const bRate = b.sinceProgress?.rate ?? -1;
      return dir * (aRate - bRate);
    });
  }, [entries, filter, query, sort]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a name"
          className="ml-auto"
          style={{ width: 190 }}
        />
      </div>
      <Table>
        <THead>
          <SortableTH label="Student" sortKey="name" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <TH>Status</TH>
          <SortableTH label="Missed" sortKey="missed" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <SortableTH
            label="Since decision"
            sortKey="since"
            sort={sort}
            onSort={(k) => setSort((s) => nextSort(s, k))}
          />
          <TH align="right" />
        </THead>
        <tbody>
          {rows.map(({ student, outcome, sinceProgress }) => {
            const readyToUpdate = student.missed === 0;
            return (
              <TR key={student.id}>
                <TD>
                  <Link
                    href={`/c/${cohortSlug}/students/${student.id}`}
                    className="flex items-center gap-2.5 hover:underline"
                  >
                    <Avatar name={student.fullName} />
                    <span className="text-[13px] font-semibold text-ink">{student.fullName}</span>
                  </Link>
                </TD>
                <TD>
                  {readyToUpdate ? (
                    <Pill tone="yellow">Ready to update</Pill>
                  ) : (
                    <Pill tone={outcomeTone(outcome.kind)}>{outcomeShortLabel(outcome.kind)}</Pill>
                  )}
                </TD>
                <TD className="tabular">{student.missed}</TD>
                <TD>
                  {sinceProgress?.rate == null ? (
                    <span className="text-xs text-ink-faint">Nothing recorded yet</span>
                  ) : (
                    <span className="flex items-center gap-2.5">
                      <ProgressBar
                        pct={sinceProgress.rate}
                        tone={toneForRate(sinceProgress.rate, bands.activeThreshold, bands.helpThreshold)}
                        className="w-[60px]"
                      />
                      <span className="text-[12px] font-semibold tabular">{sinceProgress.rate}%</span>
                    </span>
                  )}
                </TD>
                <TD align="right">
                  <span className="flex items-center justify-end gap-2">
                    {readyToUpdate && canRecord && (
                      <MarkOnTrackButton studentId={student.id} cohortId={cohortId} studentName={student.fullName} size="row" />
                    )}
                    {canRecord ? (
                      <OutcomeModal
                        studentId={student.id}
                        cohortId={cohortId}
                        studentName={student.fullName}
                        missedCount={student.missed}
                        currentOutcome={outcome.kind}
                        triggerClassName={buttonVariants({ variant: "secondary", size: "row" })}
                      >
                        Change
                      </OutcomeModal>
                    ) : (
                      <Link
                        href={`/c/${cohortSlug}/students/${student.id}`}
                        className={buttonVariants({ variant: "secondary", size: "row" })}
                      >
                        Open
                      </Link>
                    )}
                  </span>
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                No students match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
