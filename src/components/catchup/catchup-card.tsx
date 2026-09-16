import Link from "next/link";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { OutcomeModal } from "@/components/outcome/outcome-modal";
import { outcomeShortLabel, outcomeTone } from "@/components/outcome/outcome-copy";
import { CatchupChecklist } from "@/components/students/catchup-checklist";
import { MarkOnTrackButton } from "@/components/outcome/mark-on-track-button";
import { type AttendanceSince } from "@/lib/domain/metrics";
import { cn, todayISO } from "@/lib/utils";
import type { Bands, LessonEventView, Outcome, StudentAggregate } from "@/lib/domain/types";

function daysAgo(iso: string): number {
  const then = new Date(iso.slice(0, 10));
  const now = new Date(todayISO());
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86400000));
}

/**
 * "On catch-up" or "Ready to update" — the two Catch ups groups. Every
 * student here has a `kind: "catchup"` outcome on record; there's nothing
 * to "contact" about (that's Follow Up's job) — this card is purely about
 * tracking the plan until someone closes it out.
 */
export function CatchupCard({
  cohortId,
  cohortSlug,
  student,
  outcome,
  sinceProgress,
  bands,
  lessonEvents,
  canRecord,
}: {
  cohortId: string;
  cohortSlug: string;
  student: StudentAggregate;
  outcome: Outcome;
  sinceProgress: AttendanceSince | null;
  bands: Bands;
  lessonEvents: LessonEventView[];
  /** True only for facilitator/admin — leadership sees this page read-only. */
  canRecord: boolean;
}) {
  const readyToUpdate = student.missed === 0;
  const trackingCatchup = sinceProgress != null && !readyToUpdate;
  const showChecklist = canRecord && !readyToUpdate;

  const days = daysAgo(outcome.recordedAt);
  const statusLine = `Missed ${student.missed} lessons. Decision recorded ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.`;

  return (
    <Card className={cn("overflow-hidden", readyToUpdate && "border-yellow")}>
      <div className="flex items-center gap-3 p-4">
        <Avatar name={student.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/c/${cohortSlug}/students/${student.id}`}
            className="block truncate text-[14px] font-bold text-ink hover:underline"
          >
            {student.fullName}
          </Link>
          <div className="mt-0.5 text-[11px] text-ink-muted tabular">
            {student.rate}% · {student.attended}/{student.expected} lessons
          </div>
        </div>
        {readyToUpdate ? (
          <Pill tone="yellow">Ready to update</Pill>
        ) : (
          <Pill tone={outcomeTone(outcome.kind)}>{outcomeShortLabel(outcome.kind)}</Pill>
        )}
      </div>

      <div className="mx-4 rounded-control bg-page px-3 py-2.5 text-xs text-ink-secondary">{statusLine}</div>

      {readyToUpdate && canRecord && (
        <div className="mx-4 mt-2.5 flex items-center gap-2.5 rounded-control bg-yellow-100 px-3 py-2.5">
          <ArrowsClockwise size={16} weight="bold" className="flex-none text-yellow-ink" />
          <span className="flex-1 text-xs font-semibold text-yellow-ink">Every missed lesson is made up.</span>
          <MarkOnTrackButton studentId={student.id} cohortId={cohortId} studentName={student.fullName} size="row" />
        </div>
      )}

      {trackingCatchup && (
        <div className="mx-4 mt-2.5 rounded-control border border-border-soft px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-ink-tertiary">
            <span>Since catch-up decision</span>
            <span className="tabular text-ink">
              {sinceProgress!.rate === null
                ? "Nothing recorded yet"
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
        </div>
      )}

      {showChecklist && (
        <div className="mx-4 mt-2.5">
          <CatchupChecklist
            cohortId={cohortId}
            studentId={student.id}
            lessonEvents={lessonEvents}
            variant="compact"
            maxVisible={2}
            viewAllHref={`/c/${cohortSlug}/students/${student.id}#catchup-checklist`}
            label="Tick a lesson once it's made up"
          />
        </div>
      )}

      <div className="flex gap-2 p-4 pt-3">
        {canRecord ? (
          <OutcomeModal
            studentId={student.id}
            cohortId={cohortId}
            studentName={student.fullName}
            missedCount={student.missed}
            currentOutcome={outcome.kind}
            triggerClassName={buttonVariants({ variant: "outlineAccent", size: "sm", className: "flex-1" })}
          >
            Change outcome
          </OutcomeModal>
        ) : (
          <Button variant="inert" size="sm" className="flex-1" disabled>
            Change outcome
          </Button>
        )}
        <Link
          href={`/c/${cohortSlug}/students/${student.id}`}
          className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
        >
          View record
        </Link>
      </div>
    </Card>
  );
}
