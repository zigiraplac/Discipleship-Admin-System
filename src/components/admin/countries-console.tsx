"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
import { cn } from "@/lib/utils";
import type { CountryRow } from "@/lib/data/admin-console";

type SortKey = "name" | "students" | "promotions" | "accounts";
type Show = "all" | "setUp" | "notSetUp";

/** Every country in the world by continent, with what BCC has there. A
 * country that's set up opens its promotions. */
export function CountriesConsole({ rows }: { rows: CountryRow[] }) {
  const [continent, setContinent] = useState("all");
  const [show, setShow] = useState<Show>("setUp");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const continents = [...new Set(rows.map((r) => r.continent))];
  const inContinent = rows.filter((r) => continent === "all" || r.continent === continent);
  const setUp = inContinent.filter((r) => r.setUp).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = inContinent.filter((r) => (show === "all" || (show === "setUp") === r.setUp) && (!q || r.name.toLowerCase().includes(q)));
    const dir = sort?.dir === "desc" ? -1 : 1;
    return [...list].sort(
      (a, b) => Number(!a.setUp) - Number(!b.setUp) || (!sort || sort.key === "name" ? dir * a.name.localeCompare(b.name) : dir * (a[sort.key] - b[sort.key]))
    );
  }, [inContinent, show, query, sort]);

  const onSort = (k: SortKey) => setSort((s) => nextSort(s, k));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented
          options={[{ value: "all", label: "All continents" }, ...continents.map((c) => ({ value: c, label: c }))]}
          value={continent}
          onChange={setContinent}
          className="max-w-full flex-wrap"
        />
        <Segmented
          options={[
            { value: "setUp" as Show, label: `With BCC ${setUp}` },
            { value: "notSetUp" as Show, label: `Not set up ${inContinent.length - setUp}` },
            { value: "all" as Show, label: `All ${inContinent.length}` },
          ]}
          value={show}
          onChange={setShow}
        />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a country" className="ml-auto" style={{ width: 190 }} />
      </div>
      <Table>
        <THead>
          <SortableTH label="Country" sortKey="name" sort={sort} onSort={onSort} />
          <TH>Continent</TH>
          <TH align="right">Sites</TH>
          <SortableTH label="Promotions" sortKey="promotions" sort={sort} onSort={onSort} align="right" />
          <TH align="right">Cohorts</TH>
          <SortableTH label="Students" sortKey="students" sort={sort} onSort={onSort} align="right" />
          <SortableTH label="Accounts" sortKey="accounts" sort={sort} onSort={onSort} align="right" />
        </THead>
        <tbody>
          {shown.map((r) => (
            <TR key={r.code} className={cn(!r.setUp && "opacity-50")}>
              <TD className="text-[13px] font-semibold text-ink">
                {r.setUp && r.promotions > 0 ? (
                  <Link href={`/admin/promotions?country=${encodeURIComponent(r.name)}`} className="hover:text-accent-700 hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </TD>
              <TD className="text-[13px] text-ink-secondary">{r.continent}</TD>
              <TD align="right" className="text-[13px] tabular">
                {r.sites}
              </TD>
              <TD align="right" className="text-[13px] tabular" title={`${r.activePromotions} with a cohort running`}>
                {r.promotions}
                {r.activePromotions > 0 && <span className="text-ink-muted"> · {r.activePromotions} active</span>}
              </TD>
              <TD align="right" className="text-[13px] tabular">
                {r.cohorts}
              </TD>
              <TD align="right" className="text-[13px] font-semibold tabular">
                {r.students.toLocaleString()}
              </TD>
              <TD align="right" className="text-[13px] tabular">
                {r.accounts}
              </TD>
            </TR>
          ))}
          {!shown.length && (
            <TR>
              <TD colSpan={7} className="py-6 text-center text-ink-faint">
                No countries match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
