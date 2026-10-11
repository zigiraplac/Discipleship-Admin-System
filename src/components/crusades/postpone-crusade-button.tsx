"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/utils";
import { postponeCrusadeWeekend } from "@/lib/actions/crusades";

/**
 * "We didn't get to this after all" — same idea as a lesson's postpone
 * button (src/components/lessons/lessons-browser.tsx), applied to a whole
 * crusade weekend: it shifts to the following weekend, and every lesson
 * and crusade day after it that hasn't happened yet shifts with it. Only
 * offered for a weekend not marked done (see crusades.ts — a done weekend
 * already happened, so there's nothing to postpone).
 */
export function PostponeCrusadeButton({
  cohortId,
  afterClass,
  friday,
  onPostponed,
}: {
  cohortId: string;
  afterClass: number;
  friday: string;
  onPostponed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await postponeCrusadeWeekend({ cohortId, afterClass, reason: reason.trim() || undefined });
      setOpen(false);
      show(
        result.shiftedCount > 1
          ? `Crusade weekend postponed — ${result.shiftedCount} lessons and crusade days shifted forward.`
          : "Crusade weekend postponed to the following weekend."
      );
      onPostponed?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't postpone this weekend. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <DialogTrigger className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <CalendarX size={13} />
        Postpone
      </DialogTrigger>
      <DialogPopup width={400}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">
            Postpone the Class {afterClass} weekend?
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            Moves it (and everything after it that hasn&rsquo;t happened yet) to the weekend
            after {formatShortDate(friday)}.
          </DialogDescription>
        </div>
        <div className="px-5 pt-3">
          <Label htmlFor="crusade-postpone-reason">Reason (optional)</Label>
          <Textarea
            id="crusade-postpone-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Venue fell through, clashing with another event…"
          />
          <p className="mt-1 text-[11px] text-ink-faint">Shown on Reports&rsquo; What changed timeline.</p>
        </div>
        {error && <div className="px-5 pb-1 pt-3 text-xs font-medium text-accent-2-700">{error}</div>}
        <div className="mt-3 flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={pending} onClick={handleConfirm}>
            {pending && <Spinner />}
            {pending ? "Postponing…" : "Postpone"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
