"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { toneForRate } from "@/components/ui/progress-bar";
import { StreakBadge } from "@/components/shared/streak-badge";
import type { StudentAggregate } from "@/lib/domain/types";

type View = "good" | "followup";

/**
 * One card, two rankings picked from a dropdown beside the title — the
 * best attendance and (what used to be its own separate panel) who needs
 * follow up, both from the same roster data, just opposite ends of the
 * sort. Keeps the Dashboard from needing a second card for the same kind
 * of "ranked student list" content.
 */
export function TopAttendersCard({
  good,
  followUp,
  bands,
}: {
  good: StudentAggregate[];
  followUp: StudentAggregate[];
  bands: { activeThreshold: number; helpThreshold: number };
}) {
  const [view, setView] = useState<View>("good");
  const rows = view === "good" ? good : followUp;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-bold text-ink">Top 5</div>
        <select
          value={view}
          onChange={(e) => setView(e.target.value as View)}
          className="rounded-control border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary"
        >
          <option value="good">Good attendance</option>
          <option value="followup">Needs follow up</option>
        </select>
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {rows.map((s) => (
          <div key={s.id} className="flex items-center gap-2.5">
            <Avatar name={s.fullName} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{s.fullName}</span>
            {view === "followup" && <StreakBadge streak={s.currentMissStreak} />}
            <Pill tone={view === "good" ? "green" : toneForRate(s.rate, bands.activeThreshold, bands.helpThreshold)}>
              {s.rate}%
            </Pill>
            <span className="w-16 flex-none text-right text-[11px] text-ink-muted tabular">
              {s.attended}/{s.expected}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-4 text-center text-xs text-ink-faint">
            {view === "good" ? "No attendance recorded yet." : "Nobody needs follow up right now."}
          </div>
        )}
      </div>
    </Card>
  );
}
