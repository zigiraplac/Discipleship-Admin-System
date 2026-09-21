"use client";

import { useState } from "react";
import { Label, NativeSelect } from "@/components/ui/input";
import { ScheduleSettingsCard } from "@/components/cohorts/schedule-settings-card";
import type { ScheduleSegment } from "@/lib/domain/generator";

export interface CohortScheduleOption {
  cohortId: string;
  cohortName: string;
  cohort: {
    startDate: string;
    teachingDays: number[];
    lessonsPerSession: number;
    intervalWeeks: number;
  };
  segments: ScheduleSegment[];
  nextLesson: { eventId: string; lessonRef: string; globalIndex: number } | null;
}

/** Picks which cohort's teaching schedule to view/change — moved here
 * (admin-only) from what used to be its own per-cohort sidebar page, so a
 * facilitator no longer changes this directly; they'd ask an admin, same
 * as any other cohort-wide setting on this page. */
export function ScheduleSettingsPanel({ options }: { options: CohortScheduleOption[] }) {
  const [selectedId, setSelectedId] = useState(options[0]?.cohortId ?? "");
  const selected = options.find((o) => o.cohortId === selectedId) ?? options[0] ?? null;

  if (!selected) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="schedule-cohort-picker">Cohort</Label>
        <NativeSelect
          id="schedule-cohort-picker"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full"
        >
          {options.map((o) => (
            <option key={o.cohortId} value={o.cohortId}>
              {o.cohortName}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ScheduleSettingsCard
        key={selected.cohortId}
        cohort={selected.cohort}
        segments={selected.segments}
        cohortId={selected.cohortId}
        nextLesson={selected.nextLesson}
      />
    </div>
  );
}
