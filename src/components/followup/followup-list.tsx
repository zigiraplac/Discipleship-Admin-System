"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WhatsappLogo, UserCheck } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { StreakBadge } from "@/components/shared/streak-badge";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortableTH, nextSort, type SortState } from "@/components/ui/sortable-th";
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

type Filter = "all" | "needsContact" | "contacted";
type SortKey = "name" | "missed";

const FILTER_OPTIONS: SegmentedOption<Filter>[] = [
  { value: "all", label: "All" },
  { value: "needsContact", label: "Needs contact" },
  { value: "contacted", label: "Contacted" },
];

/** Same layout as StudentsTable — a filter + search in the table's own
 * header, one continuous sortable table — instead of separate tab panels
 * per group. */
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
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      const contacted = e.student.contactedAt != null;
      if (filter === "needsContact" && contacted) return false;
      if (filter === "contacted" && !contacted) return false;
      if (q && !e.student.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return dir * a.student.fullName.localeCompare(b.student.fullName);
      return dir * (a.student.missed - b.student.missed);
    });
  }, [entries, filter, query, sort]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a name"
          className="ml-auto"
          style={{ width: 190 }}
        />
      </div>
      <Table>
        <THead>
          <SortableTH label="Student" sortKey="name" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <TH>Status</TH>
          <SortableTH label="Missed" sortKey="missed" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
          <TH align="right" />
        </THead>
        <tbody>
          {rows.map((entry) => (
            <FollowUpRow
              key={entry.student.id}
              entry={entry}
              cohortId={cohortId}
              cohortSlug={cohortSlug}
              lessonEvents={lessonEvents}
              canRecord={canRecord}
            />
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={4} className="py-6 text-center text-ink-faint">
                No students match.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
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
            <span className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-ink">{student.fullName}</span>
              <StreakBadge streak={student.currentMissStreak} />
            </span>
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
          {canRecord && !contacted && (
            // Distinct from the WhatsApp button on purpose — this logs that
            // outreach already happened, it isn't another way to contact
            // the student.
            <button
              type="button"
              disabled={pending}
              onClick={handleMarkContacted}
              aria-label={`Mark ${student.fullName} as contacted`}
              title="Mark as contacted"
              className={buttonVariants({ variant: "secondary", size: "row" })}
            >
              {pending ? <Spinner /> : <UserCheck size={13} />}
            </button>
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
