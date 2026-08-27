import Link from "next/link";
import { WhatsappLogo, ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { OutcomeModal } from "@/components/outcome/outcome-modal";
import { outcomeShortLabel, outcomeTone } from "@/components/outcome/outcome-copy";
import { CatchupChecklist } from "@/components/students/catchup-checklist";
import { MarkOnTrackButton } from "@/components/outcome/mark-on-track-button";
import { whatsappHref, catchupOutreachMessage } from "@/lib/domain/whatsapp";
import { isRecorded, type AttendanceSince } from "@/lib/domain/metrics";
import { cn, todayISO } from "@/lib/utils";
import type { Bands, LessonEventView, Outcome, StudentAggregate } from "@/lib/domain/types";

/** How long ago `iso` was, in whole days — used for "last contacted"
 * rather than a made-up figure, since `outcome.recordedAt` is the one
 * real timestamp we have for when someone last actually followed up. */
function daysAgo(iso: string): number {
  const then = new Date(iso.slice(0, 10));
  const now = new Date(todayISO());
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86400000));
}

export function AttentionCard({
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
  outcome: Outcome | null;
  /** Only meaningful when `outcome.kind === "catchup"` — lets every
   * catch-up student's progress be scanned on this page at once, instead
   * of having to open each profile one by one to check. */
  sinceProgress: AttendanceSince | null;
  bands: Bands;
  lessonEvents: LessonEventView[];
  /** True only for viewers who can record outcomes — lets a caught-up
   * lesson be ticked right here, instead of the card just describing a
   * catch-up plan with nothing on screen that acts on it. */
  canRecord: boolean;
}) {
  const resolved = outcome != null;
  const overdue = !resolved && student.missed > 8;
  // Every lesson resolved but the outcome still says "catchup" — the plan
  // worked, but the record itself is stale until someone actually changes
  // it. Surfaced as something to act on, not a quiet "all good" label.
  const readyToUpdate = outcome?.kind === "catchup" && student.missed === 0;
  const trackingCatchup = outcome?.kind === "catchup" && sinceProgress != null && !readyToUpdate;
  const showChecklist = canRecord && outcome?.kind === "catchup" && !readyToUpdate;

  const missedLessons = lessonEvents
    .filter((e) => isRecorded(e) && e.register.attendance[student.id] !== "present")
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const whatsappLink = student.whatsapp
    ? whatsappHref(
        student.whatsapp,
        student.country,
        !resolved ? catchupOutreachMessage(student.fullName, missedLessons) : undefined
      )
    : null;

  let statusLine: string;
  if (resolved) {
    const days = daysAgo(outcome.recordedAt);
    statusLine = `Missed ${student.missed} lessons. Decision recorded ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.`;
  } else {
    statusLine = `Missed ${student.missed} lessons. Not yet contacted.`;
  }

  return (
    <Card
      className={cn(
        "overflow-hidden",
        !resolved && "border-accent-2-200",
        readyToUpdate && "border-yellow"
      )}
    >
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
        ) : resolved ? (
          <Pill tone={outcomeTone(outcome.kind)}>{outcomeShortLabel(outcome.kind)}</Pill>
        ) : overdue ? (
          <Pill tone="magenta">Overdue</Pill>
        ) : (
          <Pill tone="yellow">To contact</Pill>
        )}
      </div>

      <div className="mx-4 rounded-control bg-page px-3 py-2.5 text-xs text-ink-secondary">{statusLine}</div>

      {readyToUpdate && canRecord && (
        <div className="mx-4 mt-2.5 flex items-center gap-2.5 rounded-control bg-yellow-100 px-3 py-2.5">
          <ArrowsClockwise size={16} weight="bold" className="flex-none text-yellow-ink" />
          <span className="flex-1 text-xs font-semibold text-yellow-ink">
            Every missed lesson is made up.
          </span>
          <MarkOnTrackButton studentId={student.id} cohortId={cohortId} studentName={student.fullName} size="row" />
        </div>
      )}

      {trackingCatchup && (
        <div className="mx-4 mt-2.5 rounded-control border border-border-soft px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-ink-tertiary">
            <span>Since catch-up decision</span>
            <span className="tabular text-ink">
              {sinceProgress!.rate === null ? "Nothing recorded yet" : `${sinceProgress!.attended}/${sinceProgress!.expected} · ${sinceProgress!.rate}%`}
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
            currentOutcome={outcome?.kind ?? null}
            triggerClassName={buttonVariants({
              variant: resolved ? "outlineAccent" : "primary",
              size: "sm",
              className: "flex-1",
            })}
          >
            {resolved ? "Change outcome" : "Record outcome"}
          </OutcomeModal>
        ) : (
          <Button variant="inert" size="sm" className="flex-1" disabled>
            {resolved ? "Change outcome" : "Record outcome"}
          </Button>
        )}
        {!resolved && whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Message ${student.fullName} on WhatsApp`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <WhatsappLogo size={15} weight="fill" />
          </a>
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
