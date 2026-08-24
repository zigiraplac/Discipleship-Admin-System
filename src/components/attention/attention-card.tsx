import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { buttonVariants } from "@/components/ui/button";
import { OutcomeModal, outcomeShortLabel } from "@/components/outcome/outcome-modal";
import { cn } from "@/lib/utils";
import type { Outcome, StudentAggregate } from "@/lib/domain/types";

export function AttentionCard({
  cohortId,
  student,
  outcome,
}: {
  cohortId: string;
  student: StudentAggregate;
  outcome: Outcome | null;
}) {
  const resolved = outcome != null;
  const overdue = !resolved && student.missed > 8;

  return (
    <Card className={cn("overflow-hidden", !resolved && "border-accent-2-200")}>
      <div className="flex items-center gap-3 p-4">
        <Avatar name={student.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/c/${cohortId}/students/${student.id}`}
            className="block truncate text-[14px] font-bold text-ink hover:underline"
          >
            {student.fullName}
          </Link>
          <div className="mt-0.5 text-[11px] text-ink-muted tabular">
            {student.rate}% · {student.attended}/{student.expected} lessons
          </div>
        </div>
        {resolved ? (
          <Pill tone="cyan">{outcomeShortLabel(outcome.kind)}</Pill>
        ) : overdue ? (
          <Pill tone="magenta">Overdue</Pill>
        ) : (
          <Pill tone="yellow">To contact</Pill>
        )}
      </div>

      <div className="mx-4 rounded-control bg-page px-3 py-2.5 text-xs text-ink-secondary">
        {resolved
          ? `Missed ${student.missed} lessons. Decision recorded today.`
          : `Missed ${student.missed} lessons. No contact for 12 days.`}
      </div>

      <div className="flex gap-2 p-4 pt-3">
        <OutcomeModal
          studentId={student.id}
          cohortId={cohortId}
          studentName={student.fullName}
          missedCount={student.missed}
          currentOutcome={outcome?.kind ?? null}
          triggerClassName={buttonVariants({
            variant: resolved ? "outlineAccent" : "primary",
            size: "sm",
            className: "flex-1",
          })}
        >
          {resolved ? "Change outcome" : "Record outcome"}
        </OutcomeModal>
        <Link
          href={`/c/${cohortId}/students/${student.id}`}
          className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
        >
          View record
        </Link>
      </div>
    </Card>
  );
}
