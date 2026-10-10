"use client";

import { useState } from "react";
import { Segmented } from "./segmented";

/** One section of a page at a time. Hidden sections stay mounted, so
 * switching tabs never loses something half-typed. */
export function SectionTabs({ tabs, initial }: { tabs: { id: string; label: string; content: React.ReactNode }[]; initial?: string }) {
  const [tab, setTab] = useState(initial ?? tabs[0]?.id);
  return (
    <div className="flex flex-col gap-4">
      <Segmented options={tabs.map((t) => ({ value: t.id, label: t.label }))} value={tab} onChange={setTab} className="w-fit max-w-full flex-wrap" />
      {tabs.map((t) => (
        <div key={t.id} className={t.id === tab ? "flex flex-col gap-4" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
