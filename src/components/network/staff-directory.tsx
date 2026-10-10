"use client";

import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Input } from "@/components/ui/input";
import { SplitRow, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { CaretRight, UserGear, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type StaffRoleLabel = "Leader" | "Viewer" | "Facilitator" | "Teacher";

export interface StaffAssignment {
  role: StaffRoleLabel;
  /** The level or cohort they answer for. */
  place: string;
  /** What it is and where, below the group: "Church · Rwanda › Kigali City". */
  where: string;
}

export interface DirectoryRow {
  userId: string;
  name: string;
  email: string;
  state: "active" | "invited" | "deactivated";
  /** The direct child of the viewed level this falls under (the split). */
  groupId: string;
  groupName: string;
  assignments: StaffAssignment[];
}

type SortKey = "name" | "role" | "place";
const ROLE_ORDER: StaffRoleLabel[] = ["Leader", "Viewer", "Facilitator", "Teacher"];

const ROLE_TONE: Record<StaffRoleLabel, PillTone> = { Leader: "cyan", Viewer: "grey", Facilitator: "teal", Teacher: "violet" };

/**
 * Everyone serving below the level being viewed — the same table as a
 * cohort's Students, split by the direct child they work in (Africa, then
 * every African staff member; …). Each row says what the person is
 * responsible for. The viewed level's own staff, and anyone above it,
 * never appear: each level sees what is in its responsibility.
 */
export function StaffDirectory({ rows, groupLabel }: { rows: DirectoryRow[]; groupLabel: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [open, setOpen] = useState<DirectoryRow | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = rows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.assignments.some((a) => a.place.toLowerCase().includes(q)))
    );
    const dir = sort?.dir === "desc" ? -1 : 1;
    const sorted = [...shown].sort((a, b) =>
      sort?.key === "place"
        ? dir * (a.assignments[0]?.place ?? "").localeCompare(b.assignments[0]?.place ?? "")
        : sort?.key === "role"
          ? dir * (ROLE_ORDER.indexOf(a.assignments[0]?.role ?? "Teacher") - ROLE_ORDER.indexOf(b.assignments[0]?.role ?? "Teacher")) || a.name.localeCompare(b.name)
          : dir * a.name.localeCompare(b.name)
    );
    const map = new Map<string, { id: string; name: string; rows: DirectoryRow[] }>();
    for (const r of sorted) {
      const g = map.get(r.groupId) ?? { id: r.groupId, name: r.groupName, rows: [] };
      g.rows.push(r);
      map.set(r.groupId, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, query, sort]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a name or place" className="ml-auto" style={{ width: 210 }} />
      </div>
      <Table>
        <THead>
          <SortableTH label="Staff" sortKey="name" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <SortableTH label="Role" sortKey="role" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <SortableTH label="Responsible for" sortKey="place" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <TH>Status</TH>
          <TH align="right" />
        </THead>
        <tbody>
          {groups.map((g) => {
            return (
              <Fragment key={g.id}>
                {/* The split: where these people work. */}
                <SplitRow colSpan={5} title={g.name} />
                {g.rows.map((r) => {
                    const [first, ...more] = r.assignments;
                    const otherRoles = [...new Set(more.map((a) => a.role))].filter((x) => x !== first?.role);
                    return (
                      <TR
                        key={`${g.id}-${r.userId}`}
                        className={cn("cursor-pointer hover:bg-hover", r.state === "deactivated" && "opacity-60")}
                        onClick={() => setOpen(r)}
                      >
                        <TD>
                          <span className="flex items-center gap-2.5">
                            <Avatar name={r.name} />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold text-ink">{r.name}</span>
                              <span className="block truncate text-[11px] text-ink-muted">{r.email}</span>
                            </span>
                          </span>
                        </TD>
                        <TD>
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            {first && <Pill tone={ROLE_TONE[first.role]}>{first.role}</Pill>}
                            {otherRoles.length > 0 && <span className="text-[11px] font-semibold text-ink-muted">+{otherRoles.length}</span>}
                          </span>
                        </TD>
                        <TD className="max-w-[280px]">
                          {first && (
                            <span className="block min-w-0">
                              <span className="block truncate text-[13px] text-ink">
                                {first.place}
                                {more.length > 0 && <span className="text-ink-muted"> · +{more.length} more</span>}
                              </span>
                            </span>
                          )}
                        </TD>
                        <TD>
                          <StatusText state={r.state} />
                        </TD>
                        <TD align="right" className="w-8">
                          <CaretRight size={13} className="text-ink-faint" />
                        </TD>
                      </TR>
                    );
                  })}
              </Fragment>
            );
          })}
          {!groups.length && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                {rows.length ? "No one matches." : "No staff below this level yet."}
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
      {open && <StaffDetails row={open} groupLabel={groupLabel} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function StatusText({ state }: { state: DirectoryRow["state"] }) {
  return state === "invited" ? (
    <Pill tone="grey">Invited</Pill>
  ) : state === "deactivated" ? (
    <Pill tone="magenta">Deactivated</Pill>
  ) : (
    <span className="text-[12px] text-ink-muted">Active</span>
  );
}

/** Everything about one person: how to reach them, and every place they
 * are responsible for (the table shows only the first). */
function StaffDetails({ row, groupLabel, onClose }: { row: DirectoryRow; groupLabel: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={460}>
        <div className="flex items-start gap-3 px-5 pt-5">
          <Avatar name={row.name} size="xl" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[16px] font-bold text-ink">{row.name}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-ink-muted">
              <a href={`mailto:${row.email}`} className="text-accent-700 hover:underline">
                {row.email}
              </a>
            </DialogDescription>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-muted">
              <StatusText state={row.state} />
              <span>
                · {groupLabel} {row.groupName}
              </span>
            </div>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Responsible for · {row.assignments.length}
          </div>
          <ul className="flex flex-col">
            {row.assignments.map((a, i) => (
              <li key={i} className="flex items-start gap-3 border-t border-divider py-2.5 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{a.place}</span>
                  <span className="block text-[11px] text-ink-muted">{a.where}</span>
                </span>
                <Pill tone={ROLE_TONE[a.role]}>{a.role}</Pill>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Close</DialogClose>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * The appointments this level makes, in a popup opened from the Staff
 * page header — the directory stays the page. The button says how many
 * places still have nobody, so gaps are visible without opening it.
 */
export function AppointmentsDialog({ gaps, levelLabel, children }: { gaps: number; levelLabel: string; children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" className="gap-1.5" />}>
        <UserGear size={15} />
        Appointments
        {gaps > 0 && <span className="rounded-pill bg-yellow px-1.5 text-[10px] font-bold leading-[16px] text-ink">{gaps}</span>}
      </DialogTrigger>
      <DialogPopup width={760} className="flex max-h-[min(86vh,820px)] flex-col overflow-hidden">
        <div className="flex items-start gap-3 border-b border-divider px-5 pb-3.5 pt-[18px]">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[16px] font-bold text-ink">Appointments</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-ink-muted">
              Who this {levelLabel.toLowerCase()} appoints. Tap a person to change or remove them, + to appoint someone.
              {gaps > 0 && <span className="text-yellow-ink"> {gaps} {gaps === 1 ? "place has" : "places have"} nobody yet.</span>}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close"
            className="grid size-8 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:bg-hover"
          >
            <X size={15} />
          </DialogClose>
        </div>
        <div className="flex-1 overflow-y-auto bg-page px-5 py-4">{children}</div>
      </DialogPopup>
    </Dialog>
  );
}
