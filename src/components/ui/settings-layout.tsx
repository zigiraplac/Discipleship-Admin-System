"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface SettingsSection {
  id: string;
  label: string;
  description: string;
  content: React.ReactNode;
}

/**
 * Settings grouped by what's being configured: a section list on the left,
 * the chosen section on the right. Sections stay mounted while hidden, so
 * switching never loses something half-typed.
 */
export function SettingsLayout({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-card border border-border bg-card p-2 lg:flex-col lg:self-start">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            className={cn(
              "flex-none rounded-control px-3 py-2 text-left text-[13px] font-medium text-ink-secondary hover:bg-hover",
              s.id === active && "bg-accent-100 font-bold text-accent-800 hover:bg-accent-100"
            )}
            aria-current={s.id === active ? "page" : undefined}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0">
        {sections.map((s) => (
          <section key={s.id} className={s.id === active ? "flex flex-col gap-4" : "hidden"} aria-label={s.label}>
            <div>
              <h2 className="text-[17px] font-bold text-ink">{s.label}</h2>
              <p className="mt-0.5 text-[13px] text-ink-muted">{s.description}</p>
            </div>
            {s.content}
          </section>
        ))}
      </div>
    </div>
  );
}
