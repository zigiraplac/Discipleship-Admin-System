"use client";

import { CaretUp, CaretDown, ArrowsDownUp } from "@phosphor-icons/react";
import { TH } from "./table";
import { cn } from "@/lib/utils";

export interface SortState<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

/** A clickable `<TH>` that reports which column + direction it's sorted
 * by — the sort itself stays owned by whichever table renders this
 * (each table's row shape and default order differ too much to share). */
export function SortableTH<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  return (
    <TH align={align} className="p-0">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors hover:bg-hover hover:text-ink-secondary",
          align === "right" && "justify-end",
          active ? "bg-accent-100 text-accent-800 hover:bg-accent-100" : "text-ink-faint"
        )}
      >
        {label}
        {active ? (
          sort!.dir === "asc" ? (
            <CaretUp size={11} weight="bold" />
          ) : (
            <CaretDown size={11} weight="bold" />
          )
        ) : (
          <ArrowsDownUp size={11} className="opacity-70" />
        )}
      </button>
    </TH>
  );
}

/** Three-state toggle (asc → desc → back to a table's own default) that
 * every sortable table shares, so clicking a header twice doesn't get
 * stuck sorted forever in whichever direction was clicked first. */
export function nextSort<K extends string>(current: SortState<K> | null, key: K): SortState<K> | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}
