"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Segmented } from "@/components/ui/segmented";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { UserGear, X } from "@phosphor-icons/react";
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

const ROLE_ORDER: StaffRoleLabel[] = ["Leader", "Viewer", "Facilitator", "Teacher"];
const ROLE_PLURAL: Record<StaffRoleLabel, string> = { Leader: "Leaders", Viewer: "Viewers", Facilitator: "Facilitators", Teacher: "Teachers" };
const ROLE_TONE: Record<StaffRoleLabel, PillTone> = { Leader: "cyan", Viewer: "grey", Facilitator: "teal", Teacher: "violet" };

/** The name column's width — the drawer starts right after it. */
const NAME_COL = "w-[260px] min-w-[260px] max-w-[260px]";

type SortKey = "name" | "staff";

/** For a place with levels inside it (a continent → its countries): who
 * serves in each, by role, and who leads it. */
export interface PlaceBreakdown {
  /** "Country". */
  label: string;
  rows: {
    id: string;
    name: string;
    leaders: number;
    facilitators: number;
    teachers: number;
    inCharge: { name: string; email: string }[];
    /** An official place nobody has set up yet (all zeros). */
    notSetUp?: boolean;
  }[];
}

interface Group {
  id: string;
  name: string;
  /** An official place nobody has set up yet: greyed out, not openable. */
  notSetUp?: boolean;
  people: DirectoryRow[];
  /** People holding each role here (someone with two roles counts in both). */
  byRole: Map<StaffRoleLabel, number>;
}

/**
 * Staff below the level being viewed, one row per direct child (each
 * cohort, in a promotion) with how many people serve there in each role —
 * the same table as the Cohorts page. Clicking a row opens everyone who
 * serves there, by role, in a drawer over the table beside the names. The
 * viewed level's own staff, and anyone above it, never appear.
 */
export function StaffDirectory({
  rows,
  groupLabel,
  places,
  breakdown = {},
}: {
  rows: DirectoryRow[];
  groupLabel: string;
  /** Every direct child, so one with nobody yet still shows (as a gap). */
  places: { id: string; name: string; notSetUp?: boolean }[];
  /** Per direct child with levels inside it: the drawer shows this table. */
  breakdown?: Record<string, PlaceBreakdown>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "empty" | "notSetUp">("all");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => {
    const map = new Map<string, Group>(places.map((pl): [string, Group] => [pl.id, { id: pl.id, name: pl.name, notSetUp: pl.notSetUp, people: [], byRole: new Map() }]));
    for (const r of rows) {
      const g: Group = map.get(r.groupId) ?? { id: r.groupId, name: r.groupName, people: [], byRole: new Map() };
      g.people.push(r);
      for (const role of new Set(r.assignments.map((x) => x.role))) g.byRole.set(role, (g.byRole.get(role) ?? 0) + 1);
      map.set(r.groupId, g);
    }
    return [...map.values()];
  }, [rows, places]);

  // A column for each role anyone holds here, in the usual order.
  const roles = ROLE_ORDER.filter((role) => all.some((g) => g.byRole.has(role)));
  const empty = all.filter((g) => !g.notSetUp && !g.people.length).length;
  const notSetUp = all.filter((g) => g.notSetUp).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter(
      (g) =>
        (filter === "all" || (filter === "notSetUp" ? g.notSetUp : !g.notSetUp && !g.people.length)) &&
        (!q || g.name.toLowerCase().includes(q) || g.people.some((r) => r.name.toLowerCase().includes(q)))
    );
    const dir = sort?.dir === "desc" ? -1 : 1;
    // Places set up come first; then the chosen order.
    return list.sort(
      (a, b) =>
        Number(!!a.notSetUp) - Number(!!b.notSetUp) ||
        (sort?.key === "staff" ? dir * (a.people.length - b.people.length) : dir * a.name.localeCompare(b.name))
    );
  }, [all, filter, query, sort]);

  const open = openId ? (all.find((g) => g.id === openId) ?? null) : null;
  const onSort = (k: SortKey) => setSort((s) => nextSort(s, k));

  return (
    // The drawer covers the card from its top edge (toolbar included), right of the names.
    <Card className={cn("relative overflow-clip", open && "min-h-[70vh]")}>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        {(empty > 0 || notSetUp > 0) && (
          <Segmented
            options={[
              { value: "all" as const, label: `All ${all.length}` },
              ...(empty ? [{ value: "empty" as const, label: `Without staff ${empty}` }] : []),
              ...(notSetUp ? [{ value: "notSetUp" as const, label: `Not set up ${notSetUp}` }] : []),
            ]}
            value={filter}
            onChange={setFilter}
          />
        )}
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a place or name" className="ml-auto" style={{ width: 210 }} />
      </div>
      <Table>
        <THead>
          <SortableTH label={groupLabel} sortKey="name" sort={sort} onSort={onSort} className={NAME_COL} />
          <SortableTH label="Staff" sortKey="staff" sort={sort} onSort={onSort} align="right" />
          {roles.map((role) => (
            <TH key={role} align="right">
              {ROLE_PLURAL[role]}
            </TH>
          ))}
        </THead>
        <tbody>
          {shown.map((g) => (
            <TR
              key={g.id}
              aria-disabled={g.notSetUp || undefined}
              className={cn(g.notSetUp ? "opacity-50" : "cursor-pointer hover:bg-hover", g.id === openId && "bg-accent-100 hover:bg-accent-100")}
              onClick={() => !g.notSetUp && setOpenId(g.id)}
            >
              <TD className={NAME_COL}>
                <span className="block truncate text-[13px] font-semibold text-ink" title={g.name}>
                  {g.name}
                </span>
              </TD>
              <TD align="right" className="text-[13px] font-semibold tabular">
                {g.notSetUp ? (
                  <span className="text-[12px] font-normal text-ink-faint">Not set up</span>
                ) : g.people.length ? (
                  g.people.length
                ) : (
                  <Pill tone="yellow">No staff</Pill>
                )}
              </TD>
              {roles.map((role) => (
                <TD key={role} align="right" className="text-[13px] tabular text-ink-secondary">
                  {g.byRole.get(role) ?? "—"}
                </TD>
              ))}
            </TR>
          ))}
          {!shown.length && (
            <TR>
              <TD colSpan={2 + roles.length} className="py-6 text-center text-ink-faint">
                {all.length ? "No one matches." : "No staff below this level yet."}
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
      {open && (
        <div className="absolute inset-y-0 right-0 left-0 z-10 border-l border-border bg-card shadow-modal lg:left-[260px]">
          <div className="sticky top-[76px] flex max-h-[calc(100dvh-88px)] flex-col">
            <PlaceStaff group={open} groupLabel={groupLabel} breakdown={breakdown[open.id]} onClose={() => setOpenId(null)} />
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusText({ state }: { state: DirectoryRow["state"] }) {
  return state === "invited" ? <Pill tone="grey">Invited</Pill> : state === "deactivated" ? <Pill tone="magenta">Deactivated</Pill> : null;
}

/** Everyone serving in one place, by role: how to reach them, and what
 * else they answer for there (each person listed once per role). */
function PlaceStaff({ group, groupLabel, breakdown, onClose }: { group: Group; groupLabel: string; breakdown?: PlaceBreakdown; onClose: () => void }) {
  const sections = ROLE_ORDER.map((role) => ({
    role,
    people: group.people.filter((r) => r.assignments.some((a) => a.role === role)).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((sec) => sec.people.length);

  return (
    <>
      <div className="flex items-start gap-3 border-b border-divider px-5 pb-3.5 pt-[18px]">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-accent-700">{groupLabel} staff</div>
          <h2 className="mt-0.5 truncate text-[17px] font-bold text-ink">{group.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close staff"
          className="grid size-8 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:bg-hover"
        >
          <X size={15} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        {breakdown ? (
          <BreakdownTable breakdown={breakdown} />
        ) : (
          <>
            {!sections.length && <p className="text-[13px] text-ink-muted">Nobody serves here yet. Assign people from Appointments.</p>}
            {sections.map((sec) => (
              <section key={sec.role} className="flex flex-col gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  {ROLE_PLURAL[sec.role]} · {sec.people.length}
                </h3>
                <ul className="flex flex-col rounded-card border border-border">
                  {sec.people.map((r) => {
                    const places = r.assignments.filter((a) => a.role === sec.role);
                    return (
                      <li
                        key={r.userId}
                        className={cn("flex items-start gap-3 border-t border-divider px-3.5 py-3 first:border-t-0", r.state === "deactivated" && "opacity-60")}
                      >
                        <Avatar name={r.name} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold text-ink">{r.name}</span>
                            <StatusText state={r.state} />
                          </span>
                          <a href={`mailto:${r.email}`} className="block truncate text-[12px] text-accent-700 hover:underline">
                            {r.email}
                          </a>
                          {/* Only worth saying when it isn't simply this place. */}
                          {places.some((a) => a.place !== group.name) && (
                            <span className="mt-1 block text-[11px] text-ink-muted">
                              {places.map((a) => [a.place, a.where].filter(Boolean).join(" · ")).join("; ")}
                            </span>
                          )}
                        </span>
                        <Pill tone={ROLE_TONE[sec.role]}>{sec.role}</Pill>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </>
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
              {gaps > 0 && (
                <span className="text-yellow-ink">
                  {" "}
                  {gaps} {gaps === 1 ? "place has" : "places have"} nobody yet.
                </span>
              )}
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

/** Each level inside the place (its countries…): staff by role, in numbers,
 * and who leads it. */
function BreakdownTable({ breakdown }: { breakdown: PlaceBreakdown }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {breakdown.label === "Country" ? "Countries" : `${breakdown.label}s`} · {breakdown.rows.length}
      </h3>
      <div className="overflow-auto rounded-card border border-border">
        <table className="w-full border-collapse text-[12px]">
          <thead className="bg-subtle">
            <tr className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 text-left">{breakdown.label}</th>
              <th className="px-3 py-2 text-right">Leaders</th>
              <th className="px-3 py-2 text-right">Facilitators</th>
              <th className="px-3 py-2 text-right">Teachers</th>
              <th className="px-3 py-2 text-left">In charge</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.rows.map((r) => (
              <tr key={r.id} className={cn("border-t border-divider align-top", r.notSetUp && "opacity-50")} title={r.notSetUp ? "Not set up yet" : undefined}>
                <td className="px-3 py-2 font-semibold text-ink">{r.name}</td>
                <td className="px-3 py-2 text-right tabular text-ink-secondary">{r.leaders}</td>
                <td className="px-3 py-2 text-right tabular text-ink-secondary">{r.facilitators}</td>
                <td className="px-3 py-2 text-right tabular text-ink-secondary">{r.teachers}</td>
                <td className="px-3 py-2">
                  {r.inCharge.length ? (
                    r.inCharge.map((p) => (
                      <span key={p.email} className="block">
                        <span className="block font-semibold text-ink">{p.name}</span>
                        <a href={`mailto:${p.email}`} className="block text-accent-700 hover:underline">
                          {p.email}
                        </a>
                      </span>
                    ))
                  ) : (
                    <span className="text-ink-faint">{r.notSetUp ? "—" : "Not assigned"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
