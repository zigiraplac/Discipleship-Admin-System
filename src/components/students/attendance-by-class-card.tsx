"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { CURRICULUM, partDisplayLabel, partSpans } from "@/lib/domain/curriculum";
import { studentClassMarks, type ClassMark, type ClassMarkStatus } from "@/lib/domain/metrics";
import { toggleLessonCatchup } from "@/lib/actions/catchup";
import { cn } from "@/lib/utils";
import type { LessonEventView } from "@/lib/domain/types";

const MARK_CLASSES: Record<ClassMarkStatus, string> = {
  present: "bg-accent",
  absent: "bg-accent-2-500",
  "caught-up": "bg-amber-400",
  "not-taught": "bg-divider",
};

export function AttendanceByClassCard({
  cohortId,
  studentId,
  lessonEvents,
  caughtUpEventIds,
  canRecord,
}: {
  cohortId: string;
  studentId: string;
  lessonEvents: LessonEventView[];
  /** Present marks that came from correcting a lesson via catch-up —
   * shown amber instead of blue so it reads differently from being there
   * on the day. */
  caughtUpEventIds: string[];
  /** Lets a mistaken catch-up mark be undone right from the grid — the
   * checklist only ever adds a mark, so this is the one place to reverse it. */
  canRecord: boolean;
}) {
  const router = useRouter();
  const [caughtUp, setCaughtUp] = useState<Set<string>>(new Set(caughtUpEventIds));
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function undo(eventId: string) {
    if (!canRecord || pendingId) return;
    setPendingId(eventId);
    try {
      await toggleLessonCatchup({ studentId, cohortId, eventId, caughtUp: false });
      setCaughtUp((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
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
          <CardTitle>Attendance by class</CardTitle>
          <CardSubtitle>One mark per lesson taught so far</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-3 px-[18px] py-4">
        {CURRICULUM.map((cls, classIndex) => {
          const marks = studentClassMarks(studentId, lessonEvents, classIndex, caughtUp);

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
  marks: ClassMark[];
  canRecord: boolean;
  pendingId: string | null;
  onUndo: (eventId: string) => void;
}) {
  const taught = marks.filter((m) => m.status !== "not-taught");
  const rate = taught.length
    ? Math.round(
        (taught.filter((m) => m.status === "present" || m.status === "caught-up").length / taught.length) * 100
      )
    : null;

  return (
    <div className={cn("flex items-center gap-3", indent && "pl-4")}>
      <div className={cn("w-[150px] flex-none truncate text-ink", indent ? "text-[12px] text-ink-muted" : "text-[13px] font-medium")}>
        {label}
      </div>
      <div className="flex flex-1 gap-[3px]">
        {marks.map((mark, i) => {
          const title = `L${i + 1} · ${mark.ev.lessonTitle} · ${
            mark.status === "caught-up"
              ? "present · via catch-up"
              : mark.status === "not-taught"
                ? "not taught"
                : mark.status
          }`;
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
            <span
              key={mark.ev.eventId}
              title={title}
              className={cn("h-4 flex-1 rounded-[3px]", MARK_CLASSES[mark.status])}
            />
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
