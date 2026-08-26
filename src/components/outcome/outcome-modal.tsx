"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@phosphor-icons/react";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { recordOutcome } from "@/lib/actions/outcomes";
import { cn } from "@/lib/utils";
import type { OutcomeKind } from "@/lib/domain/types";
import { OUTCOME_NARRATIVE, outcomeShortLabel } from "./outcome-copy";

const BASE_OPTIONS: OutcomeKind[] = ["catchup", "left"];

export interface OutcomeModalProps {
  studentId: string;
  cohortId: string;
  studentName: string;
  missedCount: number;
  currentOutcome: OutcomeKind | null;
  /** Trigger content — rendered inside the trigger button. */
  children: React.ReactNode;
  triggerClassName?: string;
}

/**
 * The one shared "record what happened" dialog, opened both from an
 * Attention card and from Student detail. Saves via the `recordOutcome`
 * server action (facilitator/admin only — callers should not render this
 * for leadership), toasts, closes, and refreshes so server data catches up.
 */
export function OutcomeModal({
  studentId,
  cohortId,
  studentName,
  missedCount,
  currentOutcome,
  children,
  triggerClassName,
}: OutcomeModalProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OutcomeKind | null>(currentOutcome);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  // "Back on track" only makes sense to offer while there's an actual
  // catch-up decision to close out — showing it for a student who's never
  // had one recorded would just be a confusing no-op option.
  const options: OutcomeKind[] =
    currentOutcome === "catchup" ? ["catchup", "resolved", "left"] : BASE_OPTIONS;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKind(currentOutcome);
      setError(null);
    }
  }

  async function handleSave() {
    if (!kind) return;
    setPending(true);
    setError(null);
    try {
      await recordOutcome({ studentId, cohortId, kind });
      show(`${outcomeShortLabel(kind)} recorded for ${studentName}.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={triggerClassName}>{children}</DialogTrigger>
      <DialogPopup width={440}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Record outcome</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            {studentName} · missed {missedCount} lesson{missedCount === 1 ? "" : "s"} so far
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4">
          {options.map((opt) => {
            const narrative = OUTCOME_NARRATIVE[opt];
            const selected = kind === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setKind(opt)}
                className={cn(
                  "flex items-start gap-2.5 rounded-control border px-3 py-2.5 text-left transition-colors",
                  selected ? "border-accent bg-accent-100" : "border-border bg-card hover:bg-hover"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 flex-none items-center justify-center rounded-full border",
                    selected ? "border-accent bg-accent text-white" : "border-neutral-border bg-card"
                  )}
                >
                  {selected && <Check size={10} weight="bold" />}
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-ink">{narrative.title}</span>
                  <span className="block text-xs text-ink-muted">{narrative.text(missedCount)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {error && <div className="px-5 pb-1 text-xs font-medium text-accent-2-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={!kind || pending} onClick={handleSave}>
            {pending && <Spinner />}
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
