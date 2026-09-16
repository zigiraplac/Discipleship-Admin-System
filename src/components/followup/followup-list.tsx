"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WhatsappLogo, PhoneCall } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { OutcomeModal } from "@/components/outcome/outcome-modal";
import { markStudentContacted } from "@/lib/actions/students";
import { whatsappHref, catchupOutreachMessage } from "@/lib/domain/whatsapp";
import { isRecorded } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import type { LessonEventView, OutcomeKind, StudentAggregate } from "@/lib/domain/types";

function daysAgo(iso: string): number {
  const then = new Date(iso.slice(0, 10));
  const now = new Date(todayISO());
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86400000));
}

export interface FollowUpEntry {
  student: StudentAggregate;
  currentOutcomeKind: OutcomeKind | null;
}

/** The same roster as the card grid, one glance-able row per student
 * instead — for comparing everyone who needs following up at once rather
 * than scanning card by card. */
export function FollowUpList({
  entries,
  cohortId,
  cohortSlug,
  lessonEvents,
  canRecord,
}: {
  entries: FollowUpEntry[];
  cohortId: string;
  cohortSlug: string;
  lessonEvents: LessonEventView[];
  canRecord: boolean;
}) {
  return (
    <Table>
      <THead>
        <TH>Student</TH>
        <TH>Status</TH>
        <TH>Missed</TH>
        <TH align="right" />
      </THead>
      <tbody>
        {entries.map((entry) => (
          <FollowUpRow
            key={entry.student.id}
            entry={entry}
            cohortId={cohortId}
            cohortSlug={cohortSlug}
            lessonEvents={lessonEvents}
            canRecord={canRecord}
          />
        ))}
        {entries.length === 0 && (
          <TR>
            <TD colSpan={4} className="py-6 text-center text-ink-faint">
              Nobody in this group.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}

function FollowUpRow({
  entry,
  cohortId,
  cohortSlug,
  lessonEvents,
  canRecord,
}: {
  entry: FollowUpEntry;
  cohortId: string;
  cohortSlug: string;
  lessonEvents: LessonEventView[];
  canRecord: boolean;
}) {
  const { student, currentOutcomeKind } = entry;
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const contacted = student.contactedAt != null;
  const overdue = student.missed > 8;

  const missedLessons = lessonEvents
    .filter((e) => isRecorded(e) && e.register.attendance[student.id] !== "present")
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const whatsappLink = student.whatsapp
    ? whatsappHref(student.whatsapp, student.country, catchupOutreachMessage(student.fullName, missedLessons))
    : null;

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
    <TR>
      <TD>
        <Link href={`/c/${cohortSlug}/students/${student.id}`} className="flex items-center gap-2.5 hover:underline">
          <Avatar name={student.fullName} />
          <span>
            <span className="block text-[13px] font-semibold text-ink">{student.fullName}</span>
            <span className="block text-[11px] text-ink-muted tabular">
              {student.rate}% · {student.attended}/{student.expected} lessons
            </span>
          </span>
        </Link>
      </TD>
      <TD>
        {contacted ? (
          <Pill tone="cyan">
            {(() => {
              const d = daysAgo(student.contactedAt!);
              return `Contacted ${d === 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`}`;
            })()}
          </Pill>
        ) : overdue ? (
          <Pill tone="magenta">Overdue</Pill>
        ) : (
          <Pill tone="yellow">To contact</Pill>
        )}
      </TD>
      <TD className="tabular">{student.missed}</TD>
      <TD align="right">
        <span className="flex items-center justify-end gap-2">
          {canRecord && !contacted && (
            <button
              type="button"
              disabled={pending}
              onClick={handleMarkContacted}
              aria-label="Mark contacted"
              className={buttonVariants({ variant: "secondary", size: "row" })}
            >
              {pending ? <Spinner /> : <PhoneCall size={13} />}
            </button>
          )}
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Message ${student.fullName} on WhatsApp`}
              className={buttonVariants({ variant: "secondary", size: "row" })}
            >
              <WhatsappLogo size={13} weight="fill" />
            </a>
          )}
          {canRecord ? (
            <OutcomeModal
              studentId={student.id}
              cohortId={cohortId}
              studentName={student.fullName}
              missedCount={student.missed}
              currentOutcome={currentOutcomeKind}
              triggerClassName={buttonVariants({ variant: "secondary", size: "row" })}
            >
              {currentOutcomeKind ? "Change" : "Record"}
            </OutcomeModal>
          ) : (
            <Link
              href={`/c/${cohortSlug}/students/${student.id}`}
              className={buttonVariants({ variant: "secondary", size: "row" })}
            >
              Open
            </Link>
          )}
        </span>
      </TD>
    </TR>
  );
}
