import { cn } from "@/lib/utils";
import { CalendarChip } from "./calendar-chip";
import type { BirthdayEntry, CalendarLessonEvent, ChipData, CrusadeEventView } from "./calendar-types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function CalendarGrid({
  cohortId,
  year,
  month,
  today,
  lessonEvents,
  crusadeEvents,
  birthdays,
  canOpenLesson,
  hasLessonsNav,
  canOpenStudent,
}: {
  cohortId: string;
  year: number;
  month: number; // 1-based
  today: string;
  lessonEvents: CalendarLessonEvent[];
  crusadeEvents: CrusadeEventView[];
  birthdays: BirthdayEntry[];
  canOpenLesson: boolean;
  hasLessonsNav: boolean;
  canOpenStudent: boolean;
}) {
  const total = daysInMonth(year, month);
  // Monday-first weekday index for the 1st of the month.
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cellCount = Math.ceil((firstWeekday + total) / 7) * 7;

  function lessonHref(eventId: string): string | null {
    if (canOpenLesson) return `/c/${cohortId}/lessons/${eventId}`;
    if (hasLessonsNav) return `/c/${cohortId}/lessons`;
    return null;
  }

  const cells: { date: string | null; dayNum: number | null }[] = Array.from(
    { length: cellCount },
    (_, i) => {
      const dayNum = i - firstWeekday + 1;
      if (dayNum < 1 || dayNum > total) return { date: null, dayNum: null };
      return { date: `${year}-${pad2(month)}-${pad2(dayNum)}`, dayNum };
    }
  );

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-divider bg-subtle">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-ink-tertiary"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(106px, auto)" }}>
        {cells.map((cell, i) => {
          if (!cell.date) {
            return <div key={i} className="border-b border-r border-divider bg-cell" />;
          }

          const isToday = cell.date === today;
          const chips: ChipData[] = [];

          for (const ev of lessonEvents) {
            if (ev.date !== cell.date) continue;
            if (ev.recorded) {
              chips.push({
                key: `l-${ev.eventId}`,
                tone: "cyan",
                title: ev.lessonTitle,
                detail: `${ev.rate ?? 0}% present`,
                href: lessonHref(ev.eventId),
              });
            } else if (cell.date <= today) {
              chips.push({
                key: `l-${ev.eventId}`,
                tone: "magenta",
                title: ev.lessonTitle,
                detail: "No register",
                href: lessonHref(ev.eventId),
              });
            } else {
              chips.push({
                key: `l-${ev.eventId}`,
                tone: "cyan",
                title: ev.lessonTitle,
                detail: ev.lessonRef,
                href: lessonHref(ev.eventId),
              });
            }
          }

          for (const ev of crusadeEvents) {
            if (ev.date !== cell.date) continue;
            chips.push({
              key: `c-${ev.eventId}`,
              tone: "magenta",
              title: `Crusade day ${ev.crusadeDay + 1}`,
              detail: `After class ${ev.afterClass}`,
              href: null,
            });
          }

          for (const b of birthdays) {
            if (b.dobMonth !== month || b.dobDay !== cell.dayNum) continue;
            chips.push({
              key: `b-${b.id}`,
              tone: "yellow",
              title: b.fullName,
              detail: "Birthday",
              href: canOpenStudent ? `/c/${cohortId}/students/${b.id}` : null,
            });
          }

          return (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-1 border-b border-r border-divider p-1.5",
                isToday && "bg-accent-100/50"
              )}
            >
              <div
                className={cn(
                  "text-[11px]",
                  isToday ? "font-bold text-accent-800" : "text-ink-tertiary"
                )}
              >
                {cell.dayNum}
              </div>
              {chips.length > 0 && (
                <div className="flex flex-col gap-1">
                  {chips.map((chip) => (
                    <CalendarChip key={chip.key} chip={chip} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
