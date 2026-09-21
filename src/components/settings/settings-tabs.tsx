"use client";

import { useState } from "react";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";

type SettingsTab = "people" | "bands" | "schedule";

const TAB_OPTIONS: SegmentedOption<SettingsTab>[] = [
  { value: "people", label: "People" },
  { value: "bands", label: "Status bands" },
  { value: "schedule", label: "Cohort schedule" },
];

/**
 * One section visible at a time instead of the whole page's worth of
 * cards stacked together — inactive sections stay mounted (just hidden),
 * not removed, so switching tabs never loses an edit already in progress
 * on the Bands or Schedule form.
 */
export function SettingsTabs({
  people,
  bands,
  schedule,
}: {
  people: React.ReactNode;
  bands: React.ReactNode;
  schedule: React.ReactNode;
}) {
  const [tab, setTab] = useState<SettingsTab>("people");

  return (
    <div className="flex flex-col gap-4">
      <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
      <div className={tab === "people" ? undefined : "hidden"}>{people}</div>
      <div className={tab === "bands" ? undefined : "hidden"}>{bands}</div>
      <div className={tab === "schedule" ? undefined : "hidden"}>{schedule}</div>
    </div>
  );
}
