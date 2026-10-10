"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WhatsappLogo, UserCheck } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { StreakBadge } from "@/components/shared/streak-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { OutcomeModal } from "@/components/outcome/outcome-modal";
import { markStudentContacted } from "@/lib/actions/students";
import { FollowUpPlan } from "./follow-up-plan";
import { whatsappHref, catchupOutreachMessage } from "@/lib/domain/whatsapp";
import { isRecorded } from "@/lib/domain/metrics";
import { cn, todayISO } from "@/lib/utils";
import type { LessonEventView, OutcomeKind, StudentAggregate } from "@/lib/domain/types";

function daysAgo(iso: string): number {
  const then = new Date(iso.slice(0, 10));
  const now = new Date(todayISO());
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86400000));
}

/**
 * "Needs contact" or "Contacted, awaiting outcome" — the two Follow Up
 * groups. A student here has no outcome recorded yet (or a stale
 * "resolved" that didn't actually fix things) — once a real outcome is
 * recorded, they move to Catch ups (if "catchup") or drop off entirely
 * (if "resolved"/"left").
 */
export function FollowUpCard({
  cohortId,
  cohortSlug,
  student,
  /** Null for "never had an outcome"; "resolved" for the rare reopened
   * case (a closed decision that still left them below the band) — either
   * way this student belongs in Follow Up, not Catch ups. */
  currentOutcomeKind,
  lessonEvents,
  canRecord,
  people,
}: {
  cohortId: string;
  cohortSlug: string;
  student: StudentAggregate;
  currentOutcomeKind: OutcomeKind | null;
  lessonEvents: LessonEventView[];
  /** True only for facilitator/admin — leadership sees this page read-only. */
  canRecord: boolean;
  /** Who a follow-up can be assigned to (this cohort's facilitators + admins). */
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const contacted = student.contactedAt != null;
  const overdue = student.missed > 8;

  const missedLessons = lessonEvents
    // Absences still to make up (a caught-up lesson is already recovered).
    .filter((e) => isRecorded(e) && e.register.attendance[student.id] !== "present" && !e.register.caughtUp?.includes(student.id))
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const whatsappLink = student.whatsapp
    ? whatsappHref(student.whatsapp, student.country, catchupOutreachMessage(student.fullName, missedLessons))
    : null;

  // Why are they here → were they contacted → what was decided.
  const contactedWhen = contacted
    ? (() => {
        const d = daysAgo(student.contactedAt!);
        return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
      })()
    : null;
  const steps: { label: string; value: string; done: boolean }[] = [
    {
      label: "Why",
      value: `${student.performance === "Not started" ? "Struggling" : student.performance} · ${student.rate}% attendance${
        student.currentMissStreak >= 2 ? ` · ${student.currentMissStreak} absences in a row` : ""
      }`,
      done: true,
    },
    { label: "Contacted", value: contactedWhen ?? "Not yet", done: contacted },
    {
      label: "Decision",
      value: currentOutcomeKind === "resolved" ? "Was resolved — below the band again" : "Waiting (catch up, or leaving)",
      done: false,
    },
  ];

  function handleMarkContacted() {
    startTransition(async () => {
      try {
        await markStudentContacted({ studentId: student.id, cohortId });
        router.refresh();
      } catch {
        show("Couldn't mark that as contacted — try again.");
      }
    });
  }

  return (
    <Card className={cn("overflow-hidden", "border-accent-2-200")}>
      <div className="flex items-center gap-3 p-4">
        <Avatar name={student.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Link
              href={`/c/${cohortSlug}/students/${student.id}`}
              className="truncate text-[14px] font-bold text-ink hover:underline"
            >
              {student.fullName}
            </Link>
            <StreakBadge streak={student.currentMissStreak} />
          </span>
          <div className="mt-0.5 text-[11px] text-ink-muted tabular">
            {student.rate}% · {student.attended}/{student.expected} lessons
          </div>
        </div>
        {contacted ? (
          <Pill tone="cyan">Contacted</Pill>
        ) : overdue ? (
          <Pill tone="magenta">Overdue</Pill>
        ) : (
          <Pill tone="yellow">To contact</Pill>
        )}
      </div>

      <ol className="mx-4 flex flex-col gap-1.5 rounded-control bg-page px-3 py-2.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-baseline gap-2 text-xs">
            <span className={cn("size-1.5 flex-none translate-y-[-1px] rounded-full", s.done ? "bg-accent" : "bg-ink-faint")} />
            <span className="w-[68px] flex-none font-semibold text-ink-tertiary">{s.label}</span>
            <span className="text-ink-secondary">{s.value}</span>
          </li>
        ))}
      </ol>
      <FollowUpPlan
        studentId={student.id}
        cohortId={cohortId}
        assigneeId={student.followUpAssignee}
        nextOn={student.followUpNextOn}
        people={people}
        canEdit={canRecord}
        className="mx-4 mt-2.5"
      />

      <div className="flex gap-2 p-4 pt-3">
        {canRecord ? (
          <OutcomeModal
            studentId={student.id}
            cohortId={cohortId}
            studentName={student.fullName}
            missedCount={student.missed}
            currentOutcome={currentOutcomeKind}
            triggerClassName={buttonVariants({
              variant: contacted ? "primary" : "outlineAccent",
              size: "sm",
              className: "flex-1",
            })}
          >
            {currentOutcomeKind ? "Change outcome" : "Record outcome"}
          </OutcomeModal>
        ) : (
          <Button variant="inert" size="sm" className="flex-1" disabled>
            {currentOutcomeKind ? "Change outcome" : "Record outcome"}
          </Button>
        )}
        {whatsappLink && (
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
        {canRecord && !contacted && (
          // Distinct from the WhatsApp button above on purpose — this isn't
          // another way to reach the student, it's marking down that
          // outreach already happened (clears once a real outcome is
          // recorded). A checkmark reads as "log this," not "call them."
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={handleMarkContacted}
            aria-label={`Mark ${student.fullName} as contacted`}
            title="Mark as contacted"
          >
            {pending ? <Spinner /> : <UserCheck size={15} />}
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
