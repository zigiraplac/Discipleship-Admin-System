"use client";

import { Check } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface WizardStepDef {
  n: number;
  label: string;
  hint: string;
}

/** Completed step: solid cyan circular badge with a check. Current: pale
 * cyan badge. Future: grey. */
export function Stepper({ steps, current }: { steps: readonly WizardStepDef[]; current: number }) {
  return (
    <Card className="flex items-center gap-4 overflow-x-auto p-[18px] px-5">
      {steps.map((s, i) => {
        const state = s.n < current ? "done" : s.n === current ? "current" : "future";
        return (
          <div key={s.n} className="flex flex-1 items-center gap-4">
            <div className="flex flex-none items-center gap-2.5">
              <span
                className={cn(
                  "grid size-7 flex-none place-items-center rounded-full text-xs font-bold",
                  state === "done" && "bg-accent text-white",
                  state === "current" && "bg-accent-100 text-accent-800",
                  state === "future" && "bg-page text-ink-faint"
                )}
              >
                {state === "done" ? <Check size={14} weight="bold" /> : s.n}
              </span>
              <div className="whitespace-nowrap">
                <div
                  className={cn(
                    "text-[13px] font-semibold",
                    state === "future" ? "text-ink-faint" : "text-ink"
                  )}
                >
                  {s.label}
                </div>
                <div className="text-[11px] text-ink-muted">{s.hint}</div>
              </div>
            </div>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-divider" />}
          </div>
        );
      })}
    </Card>
  );
}
