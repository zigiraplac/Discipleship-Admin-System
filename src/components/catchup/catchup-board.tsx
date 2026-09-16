"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { GroupTabs, type TabGroup } from "@/components/shared/group-tabs";
import { ViewToggle, type ViewMode } from "@/components/shared/view-toggle";
import { CatchupCard } from "./catchup-card";
import { CatchupList, type CatchupEntry } from "./catchup-list";
import type { Bands, LessonEventView } from "@/lib/domain/types";

/** Cards vs. list, and the All/On-catch-up/Ready-to-update tabs — pulled
 * into one client component so the view choice can live in React state
 * without making the whole page a client component just for that. */
export function CatchupBoard({
  entries,
  onCatchup,
  readyToUpdate,
  cohortId,
  cohortSlug,
  lessonEvents,
  bands,
  canRecord,
}: {
  entries: CatchupEntry[];
  onCatchup: CatchupEntry[];
  readyToUpdate: CatchupEntry[];
  cohortId: string;
  cohortSlug: string;
  lessonEvents: LessonEventView[];
  bands: Bands;
  canRecord: boolean;
}) {
  const [view, setView] = useState<ViewMode>("list");

  const render = (roster: CatchupEntry[]) =>
    view === "list" ? (
      <Card className="overflow-hidden">
        <CatchupList entries={roster} cohortId={cohortId} cohortSlug={cohortSlug} bands={bands} canRecord={canRecord} />
      </Card>
    ) : (
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {roster.map(({ student, outcome, sinceProgress }) => (
          <CatchupCard
            key={student.id}
            cohortId={cohortId}
            cohortSlug={cohortSlug}
            student={student}
            outcome={outcome}
            sinceProgress={sinceProgress}
            bands={bands}
            lessonEvents={lessonEvents}
            canRecord={canRecord}
          />
        ))}
        {roster.length === 0 && (
          <Card className="col-span-full px-6 py-10 text-center text-sm text-ink-muted">Nobody in this group.</Card>
        )}
      </div>
    );

  const groups: { key: string; title: string; roster: CatchupEntry[] }[] = [
    { key: "catchup", title: "On catch-up", roster: onCatchup },
    { key: "ready", title: "Ready to update", roster: readyToUpdate },
  ];

  const tabs: TabGroup[] = [
    {
      key: "all",
      label: "All",
      count: entries.length,
      content: (
        <div className="flex flex-col gap-5">
          {groups
            .filter((g) => g.roster.length > 0)
            .map((g) => (
              <div key={g.key} className="flex flex-col gap-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[15px] font-bold text-ink">{g.title}</h2>
                  <span className="text-xs font-semibold text-ink-muted tabular">{g.roster.length}</span>
                </div>
                {render(g.roster)}
              </div>
            ))}
          {entries.length === 0 && (
            <Card className="px-6 py-10 text-center text-sm text-ink-muted">Nobody is on a catch-up plan right now.</Card>
          )}
        </div>
      ),
    },
    ...groups.map((g) => ({ key: g.key, label: g.title, count: g.roster.length, content: render(g.roster) })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ViewToggle value={view} onChange={setView} />
      </div>
      <GroupTabs tabs={tabs} />
    </div>
  );
}
