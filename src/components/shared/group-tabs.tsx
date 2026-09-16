"use client";

import { useState } from "react";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";

export interface TabGroup {
  key: string;
  label: string;
  count: number;
  content: React.ReactNode;
}

/** Switches between the "everything at once" view and one group at a
 * time — shared by Follow Up and Catch ups (formerly one "Attention" page's
 * `AttentionTabs`), each with their own two groups plus an "All". */
export function GroupTabs({ tabs }: { tabs: TabGroup[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const options: SegmentedOption<string>[] = tabs.map((t) => ({ value: t.key, label: `${t.label} (${t.count})` }));
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      <Segmented options={options} value={active} onChange={setActive} className="w-fit" />
      {current?.content}
    </div>
  );
}
