"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaretRight, X } from "@phosphor-icons/react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Card } from "@/components/ui/card";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { ISSUE_LABELS, type IssueKind } from "@/lib/domain/rollup";
import type { IssueRow, StatusRow } from "@/lib/data/org-view";
import { useOverviewPanel } from "./overview-panel";
import { ChildManageActions } from "./child-manage";
import { ResponsibleCell } from "./child-status";

const TONE: Record<StatusRow["status"], PillTone> = { good: "green", attention: "yellow", critical: "magenta", quiet: "grey" };
const RANK: Record<StatusRow["status"], number> = { critical: 3, attention: 2, good: 1, quiet: 0 };

type ChildSort = "name" | "status" | "students" | "active";

/** Stops a click inside a row (a link, an email, rename) from also opening the row. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * The direct children of a level as one compact table (the same table as
 * a cohort's Students): status with one plain reason, scale, staff and who
 * answers for it. Clicking a row opens that child's overview on the right.
 *
 * `limit` gives the dashboard's short version: the children most in need
 * of attention, no toolbar, and a link to see them all.
 */
export function ChildrenTable({
  rows,
  childLabel,
  childPlural,
  canManage = false,
  limit,
  viewAllHref,
}: {
  rows: StatusRow[];
  /** "Country". */
  childLabel: string;
  /** "Countries". */
  childPlural: string;
  canManage?: boolean;
  limit?: number;
  viewAllHref?: string;
}) {
  const open = useOverviewPanel();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<ChildSort> | null>(null);
  const compact = limit != null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
    const dir = sort?.dir === "desc" ? -1 : 1;
    const sorted = !sort
      ? list
      : [...list].sort((a, b) =>
          sort.key === "name"
            ? dir * a.name.localeCompare(b.name)
            : sort.key === "students"
              ? dir * (a.students - b.students)
              : sort.key === "active"
                ? dir * (a.active - b.active)
                : dir * (RANK[a.status] - RANK[b.status])
        );
    return compact ? sorted.slice(0, limit) : sorted;
  }, [rows, query, sort, compact, limit]);

  const head = (label: string, key: ChildSort, align?: "right") =>
    compact ? <TH align={align}>{label}</TH> : <SortableTH label={label} sortKey={key} sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} align={align} />;

  const table = (
    <Table>
      <THead>
        {head(childLabel, "name")}
        {head("Status", "status")}
        {head("Students", "students", "right")}
        {head("Active", "active", "right")}
        <TH align="right">Staff</TH>
        <TH>Responsible</TH>
        <TH align="right" />
      </THead>
      <tbody>
        {shown.map((r) => (
          <TR key={r.id} className="cursor-pointer hover:bg-hover" onClick={() => open({ kind: r.kind, id: r.id })}>
            <TD>
              <span className="block text-[13px] font-semibold text-ink">{r.name}</span>
              {r.href && (
                <Link href={r.href} onClick={stop} className="text-[11px] font-semibold text-accent-700 hover:underline">
                  {r.kind === "cohort" ? "Open cohort" : "Manage directly"}
                </Link>
              )}
            </TD>
            <TD className="max-w-[260px]">
              <Pill tone={TONE[r.status]}>{r.statusText}</Pill>
              {r.reason && (
                <span className="mt-1 block truncate text-[11px] text-ink-muted" title={r.reason}>
                  {r.reason}
                </span>
              )}
            </TD>
            <TD align="right" className="text-[13px] font-semibold tabular">
              {r.students.toLocaleString()}
            </TD>
            <TD align="right" className="text-[13px] tabular text-ink-secondary">
              {r.active.toLocaleString()}
            </TD>
            <TD align="right" className="text-[13px] tabular text-ink-secondary" title={r.staffDetail}>
              {r.staff}
            </TD>
            <TD onClick={stop} className="cursor-default">
              <ResponsibleCell r={r.responsible} />
            </TD>
            <TD align="right" className="w-px whitespace-nowrap">
              <span className="flex items-center justify-end gap-1">
                {canManage && r.kind === "unit" && (
                  <span onClick={stop}>
                    <ChildManageActions id={r.id} name={r.name} levelLabel={r.levelLabel} />
                  </span>
                )}
                <CaretRight size={13} className="text-ink-faint" />
              </span>
            </TD>
          </TR>
        ))}
        {!shown.length && (
          <TR>
            <TD colSpan={7} className="py-6 text-center text-ink-faint">
              {rows.length ? "No one matches." : `No ${childPlural.toLowerCase()} yet.`}
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );

  if (compact) {
    return (
      <>
        {table}
        {viewAllHref && rows.length > 0 && (
          <Link href={viewAllHref} className="flex items-center justify-center gap-1 border-t border-divider px-[18px] py-2.5 text-xs font-semibold text-accent-700 hover:bg-hover">
            {rows.length > shown.length ? `View all ${rows.length} ${childPlural.toLowerCase()}` : `Open ${childPlural.toLowerCase()}`}
            <CaretRight size={12} />
          </Link>
        )}
      </>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find a ${childLabel.toLowerCase()}`} className="ml-auto" style={{ width: 200 }} />
      </div>
      {table}
    </Card>
  );
}

type IssueSort = "name" | "issues" | "urgent";

interface IssueGroup {
  id: string;
  name: string;
  level: string;
  isCohort: boolean;
  items: IssueRow[];
  urgent: number;
}

/**
 * Needs attention as an ordinary table: one row per child directly below
 * this level — its main problem and how many there are. Clicking a row
 * opens the side panel with every problem for that child (and where inside
 * it), so nothing is listed twice.
 */
export function AttentionTable({ rows, initialKind, childLabel }: { rows: IssueRow[]; initialKind: IssueKind | "all"; childLabel: string }) {
  const [kind, setKind] = useState<IssueKind | "all">(initialKind);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<IssueSort> | null>(null);
  const [open, setOpen] = useState<IssueGroup | null>(null);

  const options = useMemo(() => {
    const kinds = [...new Set(rows.map((r) => r.kind))];
    return [
      { value: "all", label: `All ${rows.length}` },
      ...kinds.map((k) => ({ value: k, label: `${ISSUE_LABELS[k].short} ${rows.filter((r) => r.kind === k).length}` })),
    ];
  }, [rows]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, IssueGroup>();
    for (const r of rows) {
      if (kind !== "all" && r.kind !== kind) continue;
      const g = map.get(r.childId) ?? { id: r.childId, name: r.childName, level: r.childLevel, isCohort: r.childLevel === "Cohort", items: [], urgent: 0 };
      g.items.push(r);
      if (r.severity === "urgent") g.urgent++;
      map.set(r.childId, g);
    }
    const list = [...map.values()].filter((g) => !q || g.name.toLowerCase().includes(q) || g.items.some((i) => i.text.toLowerCase().includes(q)));
    for (const g of list) g.items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "urgent" ? -1 : 1));
    // Unsorted: most urgent first. Sorted: the column, in the chosen direction.
    if (!sort) return list.sort((a, b) => b.urgent - a.urgent || b.items.length - a.items.length);
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) =>
      sort.key === "name" ? dir * a.name.localeCompare(b.name) : sort.key === "issues" ? dir * (a.items.length - b.items.length) : dir * (a.urgent - b.urgent)
    );
  }, [rows, kind, query, sort]);

  if (!rows.length) return <Card className="px-6 py-10 text-center text-sm text-ink-muted">Nothing needs attention right now.</Card>;

  const onSort = (k: IssueSort) => setSort((s) => nextSort(s, k));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented options={options} value={kind} onChange={(v) => setKind(v as IssueKind | "all")} className="max-w-full flex-wrap" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a place or issue" className="ml-auto" style={{ width: 200 }} />
      </div>
      <Table>
        <THead>
          <SortableTH label={childLabel} sortKey="name" sort={sort} onSort={onSort} />
          <TH>Main issue</TH>
          <SortableTH label="Urgent" sortKey="urgent" sort={sort} onSort={onSort} align="right" />
          <SortableTH label="Issues" sortKey="issues" sort={sort} onSort={onSort} align="right" />
          <TH align="right" />
        </THead>
        <tbody>
          {groups.map((g) => (
            <TR key={g.id} className="cursor-pointer hover:bg-hover" onClick={() => setOpen(g)}>
              <TD className="text-[13px] font-semibold text-ink">{g.name}</TD>
              <TD className="max-w-[380px]">
                <span className="block truncate text-[13px] text-ink" title={g.items[0].text}>
                  {g.items[0].text}
                </span>
              </TD>
              <TD align="right">{g.urgent > 0 ? <Pill tone="magenta">{g.urgent}</Pill> : <span className="text-[13px] text-ink-faint">—</span>}</TD>
              <TD align="right" className="text-[13px] font-semibold tabular">
                {g.items.length}
              </TD>
              <TD align="right" className="w-px">
                <CaretRight size={13} className="text-ink-faint" />
              </TD>
            </TR>
          ))}
          {!groups.length && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                No issues match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
      <IssuesSheet group={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

/** Every problem for one child, on the right — the detail behind a row. */
function IssuesSheet({ group, onClose }: { group: IssueGroup | null; onClose: () => void }) {
  const openOverview = useOverviewPanel();
  return (
    <BaseDialog.Root open={!!group} onOpenChange={(o) => !o && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[80] bg-[rgba(20,25,32,0.42)] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Popup className="fixed inset-y-0 right-0 z-[81] flex w-[min(440px,100vw)] flex-col border-l border-border bg-card shadow-modal outline-none transition-transform duration-200 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
          {group && (
            <>
              <div className="flex items-start gap-3 border-b border-divider px-5 pb-3.5 pt-[18px]">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-accent-700">{group.level}</div>
                  <BaseDialog.Title className="mt-0.5 truncate text-[17px] font-bold text-ink">{group.name}</BaseDialog.Title>
                  <BaseDialog.Description className="mt-0.5 text-xs text-ink-muted">
                    {group.urgent ? `${group.urgent} urgent · ` : ""}
                    {group.items.length} {group.items.length === 1 ? "issue" : "issues"}
                  </BaseDialog.Description>
                </div>
                <BaseDialog.Close
                  aria-label="Close"
                  className="grid size-8 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:bg-hover"
                >
                  <X size={15} />
                </BaseDialog.Close>
              </div>
              <ul className="flex-1 overflow-y-auto px-5 py-2">
                {group.items.map((it, i) => (
                  <li key={`${it.cohortId}-${it.kind}-${i}`} className="flex items-start gap-3 border-t border-divider py-3 first:border-t-0">
                    <Pill tone={it.severity === "urgent" ? "magenta" : "yellow"}>{it.severity === "urgent" ? "Urgent" : "Watch"}</Pill>
                    <span className="min-w-0 flex-1 pt-px">
                      <span className="block text-[13px] text-ink">{it.text}</span>
                      {it.path.length > 0 && <span className="mt-0.5 block text-[11px] text-ink-muted">{it.path.join(" › ")}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-divider px-5 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openOverview({ kind: group.isCohort ? "cohort" : "unit", id: group.id });
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-control border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-ink-secondary hover:border-accent hover:text-accent-700"
                >
                  View {group.name} overview
                  <CaretRight size={13} />
                </button>
              </div>
            </>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
