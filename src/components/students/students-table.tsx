"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Pill, StatusPill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { Button } from "@/components/ui/button";
import { useOpenStudentId, useOpenStudentPanel } from "@/components/students/students-split";
import { MarkOnTrackButton } from "@/components/outcome/mark-on-track-button";
import { lessonAt, TOTAL_LESSONS } from "@/lib/domain/curriculum";
import { cn } from "@/lib/utils";
import { LIFECYCLE_LABELS, studentIntervention, studentLifecycle, studentPerformance } from "@/lib/domain/student-state";
import type { Bands, OutcomeKind, Status, StudentAggregate } from "@/lib/domain/types";

export type Filter = "all" | "On track" | "Needs help" | "At risk";
type SortKey = "name" | "attended" | "attendance" | "status";

const STATUS_RANK: Record<Status, number> = { "On track": 0, "Needs help": 1, "At risk": 2 };
const PAGE_SIZES = [10, 25, 50, 100];
/** Fixed widths for the two columns the open student's drawer leaves
 * visible — it starts right after them (260 + 180 = 440px). */
const NAME_COL = "w-[260px] min-w-[260px] max-w-[260px]";
const LIFECYCLE_COL = "w-[180px] min-w-[180px] max-w-[180px]";

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
  today: string;
  headerAction?: React.ReactNode;
}) {
  // The student open in the drawer (/students/<id>), drawn over every
  // column after Student and Lifecycle, so another name can be picked.
  const selectedId = useOpenStudentId();
  const panel = useOpenStudentPanel();
  const router = useRouter();
  const studentHref = (id: string) => `/c/${cohortSlug}/students/${id}`;
  // ?filter= deep-links a performance filter (e.g. from the dashboard).
  const filterParam = useSearchParams().get("filter");
  const [filter, setFilter] = useState<Filter>(
    filterParam === "On track" || filterParam === "Needs help" || filterParam === "At risk" ? filterParam : "all"
  );
  const inactive = useMemo(() => new Set(inactiveIds), [inactiveIds]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

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

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const first = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(first, first + pageSize);
  const onSort = (k: SortKey) => {
    setSort((s) => nextSort(s, k));
    setPage(1);
  };

  return (
    // The drawer covers the card from its top edge (toolbar included), right of the names.
    <div className={cn("relative", panel && "min-h-[70vh]")}>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setPage(1);
          }}
          className="flex-wrap"
        />
        <div className="ml-auto flex items-center gap-2.5">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Find a name"
            style={{ width: 190 }}
          />
          {headerAction}
        </div>
      </div>
      <div>
        <Table>
          <THead>
            <SortableTH label="Student" sortKey="name" sort={sort} onSort={onSort} className={NAME_COL} />
            <TH className={LIFECYCLE_COL}>Lifecycle</TH>
            <SortableTH label="Performance" sortKey="status" sort={sort} onSort={onSort} />
            {showIntervention && <TH>Intervention</TH>}
            <SortableTH label="Attendance" sortKey="attendance" sort={sort} onSort={onSort} />
            <SortableTH label="Progress" sortKey="attended" sort={sort} onSort={onSort} />
          </THead>
          <tbody>
            {pageRows.map((s) => {
              const outcome = outcomesByStudent[s.id] ?? null;
              const lifecycle = studentLifecycle(s, cohortFinished, graduatedIds.includes(s.id));
              const performance = studentPerformance(s, lifecycle);
              const intervention = studentIntervention(s, outcome, today);
              const pct = s.expected === 0 ? null : s.rate;
              return (
                <TR
                  key={s.id}
                  onClick={(e) => {
                    // Buttons and links inside the row do their own thing.
                    if ((e.target as HTMLElement).closest("a, button")) return;
                    router.push(studentHref(s.id), { scroll: false });
                  }}
                  className={cn(
                    "cursor-pointer hover:bg-hover",
                    lifecycle === "left" && "opacity-60",
                    s.id === selectedId && "bg-accent-100 hover:bg-accent-100"
                  )}
                >
                  <TD className={NAME_COL}>
                    <Link
                      href={studentHref(s.id)}
                      scroll={false}
                      aria-current={s.id === selectedId ? "true" : undefined}
                      className="block truncate text-[13px] font-semibold text-ink hover:text-accent-700 hover:underline"
                    >
                      {s.fullName}
                    </Link>
                    <span className="block truncate text-[11px] text-ink-muted">{s.country ?? "—"}</span>
                  </TD>
                  <TD className={LIFECYCLE_COL}>
                    <span className="flex flex-wrap items-center gap-1">
                      <Pill
                        tone={
                          lifecycle === "left" || lifecycle === "registered"
                            ? "grey"
                            : lifecycle === "graduated"
                              ? "green"
                              : lifecycle === "completed"
                                ? "teal"
                                : "cyan"
                        }
                      >
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
                </TR>
              );
            })}
            {rows.length === 0 && (
              <TR>
                <TD colSpan={showIntervention ? 6 : 5} className="py-6 text-center text-ink-faint">
                  No students match.
                </TD>
              </TR>
            )}
          </tbody>
        </Table>
        {panel && (
          <div className="absolute inset-y-0 right-0 left-0 z-10 border-l border-border bg-page shadow-modal lg:left-[440px]">
            <div className="sticky top-[76px] max-h-[calc(100dvh-88px)] overflow-y-auto p-4">{panel}</div>
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-[18px] py-3 text-xs text-ink-muted">
          <span className="tabular">
            Showing {first + 1}–{first + pageRows.length} of {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="students-page-size">
              Per page
            </label>
            <NativeSelect
              id="students-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <CaretLeft size={14} />
            </Button>
            <span className="tabular">
              {currentPage} / {pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              <CaretRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
