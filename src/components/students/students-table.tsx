"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Pill, StatusPill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { outcomeShortLabel } from "@/components/outcome/outcome-copy";
import { cn } from "@/lib/utils";
import type { Bands, OutcomeKind, StudentAggregate } from "@/lib/domain/types";

type Filter = "all" | "On track" | "Needs help" | "At risk";

const FILTER_OPTIONS: SegmentedOption<Filter>[] = [
  { value: "all", label: "All" },
  { value: "On track", label: "On track" },
  { value: "Needs help", label: "Needs help" },
  { value: "At risk", label: "At risk" },
];

export function StudentsTable({
  cohortId,
  roster,
  outcomesByStudent,
  bands,
}: {
  cohortId: string;
  roster: StudentAggregate[];
  outcomesByStudent: Record<string, OutcomeKind>;
  bands: Bands;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (q && !s.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roster, filter, query]);

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
          <TH>Student</TH>
          <TH>Attended</TH>
          <TH>Attendance</TH>
          <TH>Status</TH>
          <TH>Last outcome</TH>
          <TH align="right" />
        </THead>
        <tbody>
          {rows.map((s) => {
            const outcome = outcomesByStudent[s.id];
            const pct = s.expected === 0 ? null : s.rate;
            const left = s.leftAt != null;
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
                <TD className="tabular">
                  {s.attended} / {s.expected}
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
                <TD>{left ? <Pill tone="grey">No longer with us</Pill> : <StatusPill status={s.status} />}</TD>
                <TD className="text-[13px] text-ink-secondary">{outcome ? outcomeShortLabel(outcome) : "—"}</TD>
                <TD align="right">
                  <Link
                    href={`/c/${cohortId}/students/${s.id}`}
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
