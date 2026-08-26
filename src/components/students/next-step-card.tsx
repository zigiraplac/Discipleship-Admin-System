import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { OutcomeModal } from "@/components/outcome/outcome-modal";
import { OUTCOME_NARRATIVE } from "@/components/outcome/outcome-copy";
import type { AttendanceSince } from "@/lib/domain/metrics";
import type { Bands, Outcome, StudentAggregate } from "@/lib/domain/types";

export function NextStepCard({
  cohortId,
  student,
  latestOutcome,
  canRecord,
  sinceProgress,
  bands,
}: {
  cohortId: string;
  student: StudentAggregate;
  latestOutcome: Outcome | null;
  canRecord: boolean;
  /** Only meaningful when `latestOutcome.kind === "catchup"` — attendance
   * since that decision was made, separate from the lifetime average. */
  sinceProgress: AttendanceSince | null;
  bands: Bands;
}) {
  const hasIssues = student.status !== "On track";
  const heading = latestOutcome ? "Outcome recorded" : hasIssues ? "Next step" : "Nothing needed";
  const sentence = latestOutcome
    ? OUTCOME_NARRATIVE[latestOutcome.kind].text(student.missed)
    : hasIssues
      ? "Attendance has fallen below the target band. Reach out and record what happens next."
      : "Attendance is on track. No action needed right now.";

  const trackingCatchup = latestOutcome?.kind === "catchup" && sinceProgress != null;
  const caughtUp = trackingCatchup && sinceProgress!.rate != null && sinceProgress!.rate >= bands.activeThreshold;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        <p className="text-[13px] text-ink-secondary">{sentence}</p>

        {trackingCatchup && (
          <div className="rounded-control border border-border-soft bg-subtle px-3 py-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-tertiary">
              <span>Since this decision</span>
              <span className="tabular text-ink">
                {sinceProgress!.rate === null
                  ? "No lessons recorded yet"
                  : `${sinceProgress!.attended}/${sinceProgress!.expected} · ${sinceProgress!.rate}%`}
              </span>
            </div>
            {sinceProgress!.rate !== null && (
              <ProgressBar
                pct={sinceProgress!.rate}
                tone={toneForRate(sinceProgress!.rate, bands.activeThreshold, bands.helpThreshold)}
                className="mt-2"
              />
            )}
            {caughtUp && (
              <div className="mt-2 text-[11px] font-semibold text-accent-700">
                Back on track since this decision — worth updating their outcome.
              </div>
            )}
          </div>
        )}

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
