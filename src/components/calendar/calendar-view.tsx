"use client";

import { useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarGrid } from "./calendar-grid";
import type { BirthdayEntry, CalendarLessonEvent, CrusadeEventView } from "./calendar-types";

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = m - 1 + delta;
  const y2 = y + Math.floor(idx / 12);
  const m2 = (((idx % 12) + 12) % 12) + 1;
  return { y: y2, m: m2 };
}

export function CalendarView({
  cohortId,
  lessonEvents,
  crusadeEvents,
  birthdays,
  canOpenLesson,
  hasLessonsNav,
  canOpenStudent,
  today,
}: {
  cohortId: string;
  lessonEvents: CalendarLessonEvent[];
  crusadeEvents: CrusadeEventView[];
  birthdays: BirthdayEntry[];
  canOpenLesson: boolean;
  hasLessonsNav: boolean;
  canOpenStudent: boolean;
  today: string;
}) {
  const [monthOffset, setMonthOffset] = useState(0);

  const [todayY, todayM] = useMemo(() => today.split("-").map(Number), [today]);

  const { y: viewYear, m: viewMonth } = useMemo(
    () => shiftMonth(todayY, todayM, monthOffset),
    [todayY, todayM, monthOffset]
  );

  const monthLabel = useMemo(
    () =>
      new Date(Date.UTC(viewYear, viewMonth - 1, 1)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
    [viewYear, viewMonth]
  );

  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-divider px-[18px] py-4">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonthOffset((v) => v - 1)}
        >
          <CaretLeft size={16} />
        </Button>
        <div className="min-w-[150px] text-center text-[15px] font-bold text-ink">{monthLabel}</div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonthOffset((v) => v + 1)}
        >
          <CaretRight size={16} />
        </Button>

        <div className="ml-auto flex items-center gap-4 text-xs text-ink-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent" /> Lesson
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent-2-500" /> Crusade
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-yellow" /> Birthday
          </span>
        </div>
      </div>

      <CalendarGrid
        cohortId={cohortId}
        year={viewYear}
        month={viewMonth}
        today={today}
        lessonEvents={lessonEvents}
        crusadeEvents={crusadeEvents}
        birthdays={birthdays}
        canOpenLesson={canOpenLesson}
        hasLessonsNav={hasLessonsNav}
        canOpenStudent={canOpenStudent}
      />
    </Card>
  );
}
