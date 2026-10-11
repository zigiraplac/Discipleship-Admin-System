"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { CURRICULUM, partDisplayLabel, partSpans } from "@/lib/domain/curriculum";
import { studentClassMarks, type ClassMarkStatus } from "@/lib/domain/metrics";
import { enrolledOn } from "@/lib/domain/enrolment";
import { toggleLessonCatchup } from "@/lib/actions/catchup";
import { cn, formatShortDate } from "@/lib/utils";
import type { LessonEventView, Student } from "@/lib/domain/types";

/** A lesson's mark for this student, plus the two cases a register alone
 * can't tell: the date passed with no register taken, and lessons from
 * before they joined (or while they were away), which they don't owe. */
type MarkStatus = ClassMarkStatus | "missing" | "not-enrolled";
interface Mark {
  status: MarkStatus;
  ev: LessonEventView;
}

const MARK_CLASSES: Record<MarkStatus, string> = {
  present: "bg-accent",
  absent: "bg-accent-2-500",
  "caught-up": "bg-amber-400",
  missing: "bg-neutral-border",
  "not-taught": "bg-divider",
  "not-enrolled": "border border-dashed border-neutral-border",
};

const MARK_LABELS: Record<MarkStatus, string> = {
  present: "Present",
  absent: "Absent",
  "caught-up": "Absent, caught up later",
  missing: "Register not taken",
  "not-taught": "Not taught yet",
  "not-enrolled": "Not enrolled then",
};

/** Only these count towards the row's rate. */
const OWED: MarkStatus[] = ["present", "absent", "caught-up"];

export function AttendanceByClassCard({
  cohortId,
  student,
  lessonEvents,
  canRecord,
  today,
  rate,
}: {
  cohortId: string;
  student: Student;
  lessonEvents: LessonEventView[];
  today: string;
  /** Overall attendance, shown in the title; null before any lesson is owed. */
  rate: number | null;
  /** Lets a mistaken catch-up mark be undone right from the grid — the
   * checklist only ever adds a mark, so this is the one place to reverse it. */
  canRecord: boolean;
}) {
  const studentId = student.id;
  const router = useRouter();
  // Catch-ups undone here, shown as plain absences until the page refreshes.
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function undo(eventId: string) {
    if (!canRecord || pendingId) return;
    setPendingId(eventId);
    try {
      await toggleLessonCatchup({ studentId, cohortId, eventId, caughtUp: false });
      setUndone((prev) => new Set(prev).add(eventId));
      router.refresh();
    } catch {
      // The mark stays amber and clickable — the click simply didn't take.
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Attendance by class{rate !== null && ` (${rate}%)`}</CardTitle>
          <CardSubtitle>One mark per lesson · hover a mark for the lesson and date</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-3 px-[18px] py-4">
        {CURRICULUM.map((cls, classIndex) => {
          const marks: Mark[] = studentClassMarks(studentId, lessonEvents, classIndex).map((m): Mark => {
            if (m.status === "not-taught") return { ...m, status: m.ev.date <= today ? "missing" : "not-taught" };
            if (!enrolledOn(student, m.ev.date)) return { ...m, status: "not-enrolled" };
            return m.status === "caught-up" && undone.has(m.ev.eventId) ? { ...m, status: "absent" } : m;
          });

          // A class with a real Part A/Part B split (per curriculum.ts) gets
          // its tile strip broken into one labeled sub-row per part instead
          // of one continuous strip — everything else renders as one row,
          // exactly as before.
          if (cls.parts.length <= 1) {
            return (
              <ClassMarkStrip
                key={cls.n}
                label={`C${cls.n} · ${cls.title}`}
                marks={marks}
                canRecord={canRecord}
                pendingId={pendingId}
                onUndo={undo}
              />
            );
          }

          const spans = partSpans(cls);
          return (
            <div key={cls.n} className="flex flex-col gap-1.5">
              <div className="truncate text-[13px] font-medium text-ink">
                C{cls.n} · {cls.title}
              </div>
              {cls.parts.map((part, pi) => {
                const [start, end] = spans[pi];
                return (
                  <ClassMarkStrip
                    key={pi}
                    label={partDisplayLabel(part, pi, cls.parts.length)}
                    indent
                    marks={marks.slice(start, end + 1)}
                    canRecord={canRecord}
                    pendingId={pendingId}
                    onUndo={undo}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 border-t border-divider px-[18px] py-3 text-[11px] text-ink-muted">
        {(["present", "absent", "caught-up", "missing", "not-enrolled"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[2px]", MARK_CLASSES[s])} />
            {s === "caught-up" ? "Caught up" : MARK_LABELS[s]}
          </span>
        ))}
      </div>
    </Card>
  );
}

/** One row's worth of lesson tiles (a whole class, or one part of a class
 * split into Part A/B) plus its own attendance rate. */
function ClassMarkStrip({
  label,
  indent,
  marks,
  canRecord,
  pendingId,
  onUndo,
}: {
  label: string;
  indent?: boolean;
  marks: Mark[];
  canRecord: boolean;
  pendingId: string | null;
  onUndo: (eventId: string) => void;
}) {
  const taught = marks.filter((m) => OWED.includes(m.status));
  const rate = taught.length
    ? Math.round((taught.filter((m) => m.status === "present" || m.status === "caught-up").length / taught.length) * 100)
    : null;

  return (
    <div className={cn("flex items-center gap-3", indent && "pl-4")}>
      <div
        className={cn("w-[150px] flex-none truncate text-ink", indent ? "text-[12px] text-ink-muted" : "text-[13px] font-medium")}
      >
        {label}
      </div>
      <div className="flex flex-1 gap-[3px]">
        {marks.map((mark, i) => {
          const title = `L${i + 1} · ${mark.ev.lessonTitle} · ${MARK_LABELS[mark.status]} · ${formatShortDate(mark.ev.date)}`;
          if (mark.status === "caught-up" && canRecord) {
            return (
              <button
                key={mark.ev.eventId}
                type="button"
                title={`${title} — click to undo`}
                disabled={pendingId === mark.ev.eventId}
                onClick={() => onUndo(mark.ev.eventId)}
                className={cn(
                  "h-4 flex-1 rounded-[3px] transition-opacity hover:opacity-70",
                  MARK_CLASSES[mark.status],
                  pendingId === mark.ev.eventId && "opacity-50"
                )}
              />
            );
          }
          return (
            <span key={mark.ev.eventId} title={title} className={cn("h-4 flex-1 rounded-[3px]", MARK_CLASSES[mark.status])} />
          );
        })}
        {marks.length === 0 && <span className="text-xs text-ink-faint">No lessons yet</span>}
      </div>
      <div className="w-10 flex-none text-right text-[12px] font-semibold text-ink-secondary tabular">
        {rate === null ? "—" : `${rate}%`}
      </div>
    </div>
  );
}
