"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { ChildComparison } from "./child-comparison";
import { GrowthLines } from "./growth-lines";
import type { GrowthSeries } from "@/lib/data/org-view";

type View = "now" | "growth";

/** Students by direct child (continents at HQ) in one card: how many each
 * has now (bars), or how that grew month by month (lines). */
export function ChildStudentsChart({
  childWord,
  items,
  growth,
}: {
  /** "continent". */
  childWord: string;
  items: { id: string; name: string; value: number }[];
  growth: { months: { label: string; title: string }[]; series: GrowthSeries[] };
}) {
  const [view, setView] = useState<View>("now");
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex-1">
          {view === "now" ? "Students" : "Student growth"} by {childWord}
        </CardTitle>
        <Segmented
          options={[
            { value: "now", label: "Now" },
            { value: "growth", label: "Growth" },
          ]}
          value={view}
          onChange={setView}
        />
      </CardHeader>
      <div className="px-[18px] py-3.5">{view === "now" ? <ChildComparison items={items} /> : <GrowthLines {...growth} />}</div>
    </Card>
  );
}
