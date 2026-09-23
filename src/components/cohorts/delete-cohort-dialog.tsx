"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { deleteCohort } from "@/lib/actions/cohorts";

/**
 * Permanent — every student, register, and history for this cohort goes
 * with it (see `deleteCohort`, src/lib/actions/cohorts.ts). Typing the
 * cohort's exact name is the one deliberate speed bump here: a single
 * misclick shouldn't be enough to erase a real cohort's worth of
 * attendance history, so the confirm step costs a moment of actually
 * reading the name back.
 */
export function DeleteCohortDialog({
  cohortId,
  cohortName,
  triggerVariant = "row",
}: {
  cohortId: string;
  cohortName: string;
  /** "row" — a small text button (List view's actions column). "icon" —
   * an icon-only button (Cards view, where space is tighter). */
  triggerVariant?: "row" | "icon";
}) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmName.trim() === cohortName;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setConfirmName("");
      setError(null);
    }
  }

  async function handleDelete() {
    if (!canConfirm) return;
    setPending(true);
    setError(null);
    try {
      await deleteCohort({ cohortId, confirmName });
      show(`${cohortName} was permanently deleted.`);
      setOpen(false);
      router.push("/cohorts");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete this cohort.");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={
          triggerVariant === "icon"
            ? buttonVariants({ variant: "secondary", size: "icon" })
            : buttonVariants({ variant: "secondary", size: "row" })
        }
        aria-label="Delete cohort"
      >
        <Trash size={triggerVariant === "icon" ? 14 : 13} />
        {triggerVariant === "row" && "Delete"}
      </DialogTrigger>
      <DialogPopup width={420}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Delete {cohortName}?</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            This permanently removes every student, lesson, register, and history for this cohort. There&rsquo;s
            no undo.
          </DialogDescription>
        </div>
        <div className="px-5 pt-3">
          <Label htmlFor="delete-cohort-confirm">
            Type <span className="font-semibold text-ink">{cohortName}</span> to confirm
          </Label>
          <Input
            id="delete-cohort-confirm"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
          />
        </div>
        {error && <div className="px-5 pb-1 pt-3 text-xs font-medium text-accent-2-700">{error}</div>}
        <div className="mt-3 flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="primary"
            disabled={!canConfirm || pending}
            onClick={handleDelete}
            className="bg-accent-2-500 hover:bg-accent-2-700 active:bg-accent-2-700 disabled:bg-page"
          >
            {pending && <Spinner />}
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
