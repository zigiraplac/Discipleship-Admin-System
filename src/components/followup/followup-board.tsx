"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { GroupTabs, type TabGroup } from "@/components/shared/group-tabs";
import { ViewToggle, type ViewMode } from "@/components/shared/view-toggle";
import { FollowUpCard } from "./followup-card";
import { FollowUpList, type FollowUpEntry } from "./followup-list";
import type { LessonEventView } from "@/lib/domain/types";

/** Cards vs. list, and the All/Needs-contact/Contacted-awaiting-outcome
 * tabs — pulled into one client component so the view choice can live in
 * React state without making the whole page a client component just for
 * that. */
export function FollowUpBoard({
  entries,
  needsContact,
  contactedAwaiting,
  cohortId,
  cohortSlug,
  lessonEvents,
  canRecord,
}: {
  entries: FollowUpEntry[];
  needsContact: FollowUpEntry[];
  contactedAwaiting: FollowUpEntry[];
  cohortId: string;
  cohortSlug: string;
  lessonEvents: LessonEventView[];
  canRecord: boolean;
}) {
  const [view, setView] = useState<ViewMode>("list");

  const render = (roster: FollowUpEntry[]) =>
    view === "list" ? (
      <Card className="overflow-hidden">
        <FollowUpList entries={roster} cohortId={cohortId} cohortSlug={cohortSlug} lessonEvents={lessonEvents} canRecord={canRecord} />
      </Card>
    ) : (
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {roster.map(({ student, currentOutcomeKind }) => (
          <FollowUpCard
            key={student.id}
            student={student}
            cohortId={cohortId}
            cohortSlug={cohortSlug}
            currentOutcomeKind={currentOutcomeKind}
            lessonEvents={lessonEvents}
            canRecord={canRecord}
          />
        ))}
        {roster.length === 0 && (
          <Card className="col-span-full px-6 py-10 text-center text-sm text-ink-muted">Nobody in this group.</Card>
        )}
      </div>
    );

  const groups: { key: string; title: string; roster: FollowUpEntry[] }[] = [
    { key: "contact", title: "Needs contact", roster: needsContact },
    { key: "awaiting", title: "Contacted, awaiting outcome", roster: contactedAwaiting },
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
            <Card className="px-6 py-10 text-center text-sm text-ink-muted">Nobody needs following up right now.</Card>
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
