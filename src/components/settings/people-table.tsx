"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Table, THead, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { Avatar } from "@/components/ui/avatar";
import { Pill, type PillTone } from "@/components/ui/pill";
import { EditPersonDialog } from "./edit-person-dialog";
import { roleLabel } from "@/lib/roles";
import { describeScope } from "@/lib/data/people";
import type { AppUser, Role } from "@/lib/domain/types";

// A role isn't a health signal, so it gets its own identity colors rather
// than borrowing the status tones (which would misread admin as "at risk").
const ROLE_TONE: Record<Role, PillTone> = {
  admin: "violet",
  facilitator: "teal",
  teacher: "sky",
  leadership: "amber",
};

const ROLE_RANK: Record<Role, number> = { admin: 0, leadership: 1, facilitator: 2, teacher: 3 };

const STATE_TONE: Record<AppUser["state"], PillTone> = {
  active: "green",
  invited: "grey",
  deactivated: "magenta",
};
const STATE_LABEL: Record<AppUser["state"], string> = {
  active: "Active",
  invited: "Invited",
  deactivated: "Deactivated",
};

type SortKey = "name" | "role" | "state";

export function PeopleTable({
  people,
  scopesByUser,
  cohorts,
  currentUserId,
  headerAction,
}: {
  people: AppUser[];
  scopesByUser: Map<string, { cohortId: string; cohortName: string; capacity: string }[]>;
  cohorts: { id: string; name: string }[];
  currentUserId: string;
  headerAction?: React.ReactNode;
}) {
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const rows = useMemo(() => {
    if (!sort) return people;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...people].sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      if (sort.key === "role") return dir * (ROLE_RANK[a.role] - ROLE_RANK[b.role]);
      return dir * a.state.localeCompare(b.state);
    });
  }, [people, sort]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex-1">
          <CardTitle>People</CardTitle>
          <CardSubtitle>Role sets what they can do. Cohort sets what they can see.</CardSubtitle>
        </div>
        {headerAction}
      </CardHeader>
      <Table>
        <THead>
          <SortableTH label="Person" sortKey="name" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <SortableTH label="Role" sortKey="role" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <StaticTH>Cohorts</StaticTH>
          <SortableTH label="State" sortKey="state" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <StaticTH>
            <span className="sr-only">Edit</span>
          </StaticTH>
        </THead>
        <tbody>
          {rows.map((person) => (
            <TR key={person.id}>
              <TD>
                <span className="flex items-center gap-2.5">
                  <Avatar name={person.name} />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{person.name}</span>
                    <span className="block text-[11px] text-ink-muted">{person.email}</span>
                  </span>
                </span>
              </TD>
              <TD>
                <Pill tone={ROLE_TONE[person.role]}>{roleLabel(person.role)}</Pill>
              </TD>
              <TD className="text-[13px] text-ink-secondary">
                {describeScope(person.role, scopesByUser.get(person.id))}
              </TD>
              <TD>
                <Pill tone={STATE_TONE[person.state]}>{STATE_LABEL[person.state]}</Pill>
              </TD>
              <TD>
                <EditPersonDialog
                  person={person}
                  cohorts={cohorts}
                  currentCohortIds={(scopesByUser.get(person.id) ?? []).map((s) => s.cohortId)}
                  isSelf={person.id === currentUserId}
                />
              </TD>
            </TR>
          ))}
          {people.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                No people yet.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}

// "Cohorts" isn't sortable (it's a free-text scope summary, not a single
// comparable value) — a plain header cell, styled to match SortableTH's
// padding so the row stays visually aligned.
function StaticTH({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-ink-faint">
      {children}
    </th>
  );
}
