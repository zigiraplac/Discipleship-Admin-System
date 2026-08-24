import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { OutcomeModal, OUTCOME_NARRATIVE } from "@/components/outcome/outcome-modal";
import type { Outcome, StudentAggregate } from "@/lib/domain/types";

export function NextStepCard({
  cohortId,
  student,
  latestOutcome,
  canRecord,
}: {
  cohortId: string;
  student: StudentAggregate;
  latestOutcome: Outcome | null;
  canRecord: boolean;
}) {
  const hasIssues = student.status !== "On track";
  const heading = latestOutcome ? "Outcome recorded" : hasIssues ? "Next step" : "Nothing needed";
  const sentence = latestOutcome
    ? OUTCOME_NARRATIVE[latestOutcome.kind].text(student.missed)
    : hasIssues
      ? "Attendance has fallen below the target band. Reach out and record what happens next."
      : "Attendance is on track. No action needed right now.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        <p className="text-[13px] text-ink-secondary">{sentence}</p>
        {canRecord ? (
          <OutcomeModal
            studentId={student.id}
            cohortId={cohortId}
            studentName={student.fullName}
            missedCount={student.missed}
            currentOutcome={latestOutcome?.kind ?? null}
            triggerClassName={buttonVariants({ variant: "primary", className: "w-full" })}
          >
            Record outcome
          </OutcomeModal>
        ) : (
          <Button variant="inert" className="w-full" disabled>
            Record outcome
          </Button>
        )}
      </div>
    </Card>
  );
}
