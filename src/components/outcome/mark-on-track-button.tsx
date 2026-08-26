"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { recordOutcome } from "@/lib/actions/outcomes";

/**
 * The fast path for closing out a successful catch-up — records
 * "resolved" directly with one click, instead of requiring the full
 * outcome modal (open it, pick an option, save) just to say "this worked."
 * The modal still offers the same choice for anyone who wants it there.
 */
export function MarkOnTrackButton({
  studentId,
  cohortId,
  studentName,
  variant = "secondary",
  size = "sm",
  className,
}: {
  studentId: string;
  cohortId: string;
  studentName: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const { show } = useToast();
  const router = useRouter();

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      await recordOutcome({ studentId, cohortId, kind: "resolved" });
      show(`${studentName} marked back on track.`);
      router.refresh();
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't update — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} disabled={pending} onClick={handleClick} className={className}>
      {pending ? <Spinner /> : <ArrowsClockwise size={13} weight="bold" />}
      {pending ? "Updating…" : "Mark on track"}
    </Button>
  );
}
