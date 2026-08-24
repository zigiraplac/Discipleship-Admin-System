"use client";

import { useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { UpcomingEventsCard, type UpcomingEventRow } from "@/components/shared/upcoming-events";
import { CalendarGrid, type CalendarFilter } from "./calendar-grid";
import type { BirthdayEntry, CalendarLessonEvent, CrusadeEventView } from "./calendar-types";

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = m - 1 + delta;
  const y2 = y + Math.floor(idx / 12);
  const m2 = (((idx % 12) + 12) % 12) + 1;
  return { y: y2, m: m2 };
}

const FILTER_OPTIONS: SegmentedOption<CalendarFilter>[] = [
  { value: "all", label: "All" },
  { value: "lesson", label: "Lesson" },
  { value: "crusade", label: "Crusade" },
  { value: "birthday", label: "Birthday" },
];

export function CalendarView({
  cohortId,
  lessonEvents,
  crusadeEvents,
  birthdays,
  upcomingRows,
  canOpenLesson,
  hasLessonsNav,
  canOpenStudent,
  today,
}: {
  cohortId: string;
  lessonEvents: CalendarLessonEvent[];
  crusadeEvents: CrusadeEventView[];
  birthdays: BirthdayEntry[];
  upcomingRows: UpcomingEventRow[];
  canOpenLesson: boolean;
  hasLessonsNav: boolean;
  canOpenStudent: boolean;
  today: string;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [filter, setFilter] = useState<CalendarFilter>("all");

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
    <div className="grid items-start gap-4" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
      <UpcomingEventsCard title="This week" subtitle="Next 7 days, across the cohort" rows={upcomingRows} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
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
          <Button type="button" variant="secondary" size="sm" onClick={() => setMonthOffset(0)}>
            Today
          </Button>

          <div className="ml-auto">
            <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
          </div>
        </div>

        <CalendarGrid
          cohortId={cohortId}
          year={viewYear}
          month={viewMonth}
          today={today}
          filter={filter}
          lessonEvents={lessonEvents}
          crusadeEvents={crusadeEvents}
          birthdays={birthdays}
          canOpenLesson={canOpenLesson}
          hasLessonsNav={hasLessonsNav}
          canOpenStudent={canOpenStudent}
        />
      </Card>
    </div>
  );
}
