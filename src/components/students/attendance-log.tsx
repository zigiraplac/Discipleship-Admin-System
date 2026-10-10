import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { enrolledOn } from "@/lib/domain/enrolment";
import { isRecorded } from "@/lib/domain/metrics";
import type { LessonEventView, Student } from "@/lib/domain/types";
import { formatShortDate } from "@/lib/utils";

/**
 * Lesson by lesson, as it happened: present, absent, or absent and made up
 * later — a catch-up never turns an absence into "present". Lessons with
 * no register yet are shown as such (not as absences); lessons before the
 * student joined, or while away, aren't listed as owed.
 */
export function AttendanceLog({ student, lessonEvents, today }: { student: Student; lessonEvents: LessonEventView[]; today: string }) {
  const rows = lessonEvents
    .filter((e) => e.date <= today && enrolledOn(student, e.date))
    .sort((a, b) => b.globalIndex - a.globalIndex);
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Lesson by lesson</CardTitle>
          <CardSubtitle>Newest first · only lessons owed while enrolled</CardSubtitle>
        </div>
      </CardHeader>
      <ul className="max-h-[420px] overflow-y-auto">
        {rows.map((e) => {
          const recorded = isRecorded(e);
          const mark = e.register.attendance[student.id];
          const caughtUp = e.register.caughtUp?.includes(student.id);
          return (
            <li key={e.eventId} className="flex items-center gap-3 border-t border-divider px-[18px] py-2 first:border-t-0">
              <span className="w-16 flex-none text-[12px] font-semibold tabular text-ink-secondary">{e.lessonRef}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{e.lessonTitle}</span>
              <span className="hidden w-20 flex-none text-[12px] text-ink-muted sm:block">{formatShortDate(e.date)}</span>
              {!recorded ? (
                <Pill tone="grey">Register missing</Pill>
              ) : mark === "present" ? (
                <Pill tone="cyan">Present</Pill>
              ) : caughtUp ? (
                <span className="flex items-center gap-1">
                  <Pill tone="magenta">Absent</Pill>
                  <span className="text-[11px] text-ink-faint">→</span>
                  <Pill tone="amber">Caught up</Pill>
                </span>
              ) : (
                <Pill tone="magenta">Absent</Pill>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-[18px] py-6 text-center text-[13px] text-ink-muted">No lessons owed yet.</li>}
      </ul>
    </Card>
  );
}

const KIND_LABEL = { joined: "Joined", left: "Left", returned: "Came back" } as const;

/** Joined / left / came back, with dates — the facts behind what they owe. */
export function EnrolmentHistory({ student }: { student: Student }) {
  const changes = student.enrolment?.length
    ? student.enrolment
    : [{ kind: "joined" as const, on: student.enrolledAt.slice(0, 10) }, ...(student.leftAt ? [{ kind: "left" as const, on: student.leftAt.slice(0, 10) }] : [])];
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Enrolment</CardTitle>
      </CardHeader>
      <ol className="flex flex-col px-[18px] py-3">
        {changes.map((c, i) => (
          <li key={`${c.kind}-${c.on}-${i}`} className="flex items-center gap-3 py-1.5">
            <span className={`size-2 flex-none rounded-full ${c.kind === "left" ? "bg-ink-faint" : "bg-accent"}`} />
            <span className="flex-1 text-[13px] font-semibold text-ink">{KIND_LABEL[c.kind]}</span>
            <span className="text-[12px] tabular text-ink-muted">{formatShortDate(c.on)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
