"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import type { PromotionRow } from "@/lib/data/admin-console";

type SortKey = "name" | "country" | "students" | "cohorts";

const STATUS: Record<PromotionRow["status"], { label: string; tone: PillTone }> = {
  running: { label: "Running", tone: "green" },
  upcoming: { label: "Starting soon", tone: "sky" },
  finished: { label: "Finished", tone: "grey" },
  empty: { label: "No cohorts", tone: "yellow" },
};

/** Every promotion in the world, filtered by continent and country. */
export function PromotionsConsole({ rows, initialCountry }: { rows: PromotionRow[]; initialCountry?: string }) {
  const [continent, setContinent] = useState(() => rows.find((r) => r.country === initialCountry)?.continent ?? "all");
  const [country, setCountry] = useState(initialCountry ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const continents = [...new Set(rows.map((r) => r.continent))].sort();
  const countries = [...new Set(rows.filter((r) => continent === "all" || r.continent === continent).map((r) => r.country))].sort();

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (continent === "all" || r.continent === continent) &&
      (country === "all" || r.country === country) &&
      (!q || r.name.toLowerCase().includes(q) || r.site.toLowerCase().includes(q))
  );
  const dir = sort?.dir === "desc" ? -1 : 1;
  const key = sort?.key;
  const shown = !key
    ? filtered
    : [...filtered].sort((a, b) => (key === "name" || key === "country" ? dir * a[key].localeCompare(b[key]) : dir * (a[key] - b[key])));

  const onSort = (k: SortKey) => setSort((s) => nextSort(s, k));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented
          options={[{ value: "all", label: `All ${rows.length}` }, ...continents.map((c) => ({ value: c, label: c }))]}
          value={continent}
          onChange={(v) => {
            setContinent(v);
            setCountry("all");
          }}
          className="max-w-full flex-wrap"
        />
        {countries.length > 0 && (
          <NativeSelect aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        )}
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a promotion or site" className="ml-auto" style={{ width: 210 }} />
      </div>
      <Table>
        <THead>
          <SortableTH label="Promotion" sortKey="name" sort={sort} onSort={onSort} />
          <SortableTH label="Country" sortKey="country" sort={sort} onSort={onSort} />
          <TH>Site</TH>
          <TH>Status</TH>
          <SortableTH label="Cohorts" sortKey="cohorts" sort={sort} onSort={onSort} align="right" />
          <SortableTH label="Students" sortKey="students" sort={sort} onSort={onSort} align="right" />
        </THead>
        <tbody>
          {shown.map((r) => (
            <TR key={r.id}>
              <TD className="text-[13px] font-semibold text-ink">{r.name}</TD>
              <TD className="text-[13px] text-ink-secondary">
                {r.country}
                <span className="block text-[11px] text-ink-muted">{r.continent}</span>
              </TD>
              <TD className="text-[13px] text-ink-secondary">{r.site}</TD>
              <TD>
                <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
              </TD>
              <TD align="right" className="text-[13px] tabular">
                {r.cohorts}
                {r.runningCohorts > 0 && r.runningCohorts < r.cohorts && <span className="text-ink-muted"> · {r.runningCohorts} running</span>}
              </TD>
              <TD align="right" className="text-[13px] font-semibold tabular">
                {r.students.toLocaleString()}
              </TD>
            </TR>
          ))}
          {!shown.length && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-ink-faint">
                No promotions match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
