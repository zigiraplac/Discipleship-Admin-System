"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { ViewToggle, type ViewMode } from "@/components/shared/view-toggle";
import { CohortCard } from "./cohort-card";
import { CohortList, type CohortListRow } from "./cohort-list";
import { NewCohortTile } from "./new-cohort-tile";
import type { Bands } from "@/lib/domain/types";

/** Cards vs. list for the Cohorts grid — cards for the richer at-a-glance
 * tile (completion ring, need-help count), list for comparing every
 * cohort's numbers side by side in one table. */
export function CohortsBoard({
  rows,
  bands,
  canCreateCohort,
}: {
  rows: CohortListRow[];
  bands: Bands;
  canCreateCohort: boolean;
}) {
  const [view, setView] = useState<ViewMode>("list");

  return (
    <div className="flex flex-col gap-4">
      {(rows.length > 1 || (view === "list" && canCreateCohort)) && (
        <div className="flex items-center justify-end gap-2.5">
          {view === "list" && canCreateCohort && (
            <Link href="/cohorts/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
              <Plus size={14} />
              New cohort
            </Link>
          )}
          {rows.length > 1 && <ViewToggle value={view} onChange={setView} />}
        </div>
      )}

      {view === "list" ? (
        <CohortList rows={rows} bands={bands} />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {rows.map(({ cohort, agg, pace }) => (
            <CohortCard key={cohort.id} cohort={cohort} agg={agg} paceGap={pace.gap} />
          ))}
          {canCreateCohort && <NewCohortTile />}
        </div>
      )}
    </div>
  );
}
