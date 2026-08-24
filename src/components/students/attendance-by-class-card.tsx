import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { CURRICULUM } from "@/lib/domain/curriculum";
import { studentClassMarks, type ClassMarkStatus } from "@/lib/domain/metrics";
import { cn } from "@/lib/utils";
import type { LessonEventView } from "@/lib/domain/types";

const MARK_CLASSES: Record<ClassMarkStatus, string> = {
  present: "bg-accent",
  absent: "bg-accent-2-300",
  "not-taught": "bg-divider",
};

export function AttendanceByClassCard({
  studentId,
  lessonEvents,
}: {
  studentId: string;
  lessonEvents: LessonEventView[];
}) {
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
          const marks = studentClassMarks(studentId, lessonEvents, classIndex);
          const taught = marks.filter((m) => m.status !== "not-taught");
          const rate = taught.length
            ? Math.round((taught.filter((m) => m.status === "present").length / taught.length) * 100)
            : null;
          return (
            <div key={cls.n} className="flex items-center gap-3">
              <div className="w-[150px] flex-none truncate text-[13px] font-medium text-ink">
                C{cls.n} · {cls.title}
              </div>
              <div className="flex flex-1 gap-[3px]">
                {marks.map((mark, i) => (
                  <span
                    key={mark.ev.eventId}
                    title={`L${i + 1} · ${mark.ev.lessonTitle} · ${mark.status === "not-taught" ? "not taught" : mark.status}`}
                    className={cn("h-4 flex-1 rounded-[3px]", MARK_CLASSES[mark.status])}
                  />
                ))}
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
