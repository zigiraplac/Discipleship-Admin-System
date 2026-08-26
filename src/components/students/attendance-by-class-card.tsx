"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { CURRICULUM } from "@/lib/domain/curriculum";
import { studentClassMarks, type ClassMarkStatus } from "@/lib/domain/metrics";
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
          const taught = marks.filter((m) => m.status !== "not-taught");
          const rate = taught.length
            ? Math.round(
                (taught.filter((m) => m.status === "present" || m.status === "caught-up").length / taught.length) *
                  100
              )
            : null;
          return (
            <div key={cls.n} className="flex items-center gap-3">
              <div className="w-[150px] flex-none truncate text-[13px] font-medium text-ink">
                C{cls.n} · {cls.title}
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
                        onClick={() => undo(mark.ev.eventId)}
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
        })}
      </div>
    </Card>
  );
}
