"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { setCrusadeCompletion } from "@/lib/actions/crusades";

/** One click, no confirm dialog — same pattern as MarkOnTrackButton.
 * Reversible either direction, so there's nothing here worth gating
 * behind extra friction. */
export function CrusadeDoneButton({
  cohortId,
  afterClass,
  completed,
}: {
  cohortId: string;
  afterClass: number;
  completed: boolean;
}) {
  const [pending, setPending] = useState(false);
  const { show } = useToast();
  const router = useRouter();

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      await setCrusadeCompletion({ cohortId, afterClass, completed: !completed });
      show(completed ? "Marked as not done." : "Marked as done.");
      router.refresh();
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't update — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant={completed ? "secondary" : "outlineAccent"}
      size="row"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? <Spinner /> : completed ? <CheckCircle size={13} weight="fill" /> : <Circle size={13} />}
      {pending ? "Working…" : completed ? "Done" : "Mark done"}
    </Button>
  );
}
