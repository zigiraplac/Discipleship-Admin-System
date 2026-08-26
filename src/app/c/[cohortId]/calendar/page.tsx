import { notFound } from "next/navigation";
import { NAV_BY_ROLE, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getCrusadeEvents, getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { lessonStats } from "@/lib/domain/metrics";
import { upcomingBirthdays, formatBirthdayDate } from "@/lib/domain/birthdays";
import { todayISO, formatShortDate } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { CalendarView } from "@/components/calendar/calendar-view";
import type { CalendarLessonEvent } from "@/components/calendar/calendar-types";
import type { UpcomingEventRow } from "@/components/shared/upcoming-events";

function daysFromToday(dateISO: string, todayISO: string): number {
  const [y1, m1, d1] = todayISO.split("-").map(Number);
  const [y2, m2, d2] = dateISO.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function dayLabel(n: number, shortDate: string): string {
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return shortDate;
}

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("calendar")) notFound();

  const supabase = await createClient();
  const [cohort, allStudents, crusadeEvents] = await Promise.all([
    getCohort(supabase, cohortId),
    getStudents(supabase, cohortId),
    getCrusadeEvents(supabase, cohortId),
  ]);
  if (!cohort) notFound();

  // Left students stop counting toward the cohort's own numbers, and stop
  // showing up as upcoming birthday reminders — same policy as everywhere
  // else the cohort's active roster is used.
  const students = allStudents.filter((s) => !s.leftAt);

  let lessonEvents: CalendarLessonEvent[];
  if (user.role === "teacher") {
    const pub = await getLessonEventsPublic(supabase, cohortId);
    lessonEvents = pub.map((p) => ({
      eventId: p.eventId,
      date: p.date,
      lessonRef: p.lessonRef,
      lessonTitle: p.lessonTitle,
      recorded: p.recorded,
      rate: p.rate,
    }));
  } else {
    const activeIds = new Set(students.map((s) => s.id));
    const full = await getLessonEvents(supabase, cohortId);
    lessonEvents = full.map((e) => {
      const stats = lessonStats(e, activeIds);
      return {
        eventId: e.eventId,
        date: e.date,
        lessonRef: e.lessonRef,
        lessonTitle: e.lessonTitle,
        recorded: stats !== null,
        rate: stats?.rate ?? null,
      };
    });
  }

  const canOpenLesson = user.role === "facilitator" || user.role === "admin";
  const hasLessonsNav = NAV_BY_ROLE[user.role].includes("lessons");
  const canOpenStudent = NAV_BY_ROLE[user.role].includes("students");

  const birthdays = students
    .filter((s) => s.dobDay != null && s.dobMonth != null)
    .map((s) => ({
      id: s.id,
      fullName: s.fullName,
      dobDay: s.dobDay as number,
      dobMonth: s.dobMonth as number,
    }));

  function lessonHref(eventId: string): string | null {
    if (canOpenLesson) return `/c/${cohortId}/lessons/${eventId}`;
    if (hasLessonsNav) return `/c/${cohortId}/lessons`;
    return null;
  }

  const today = todayISO();

  // "This week" = a rolling 7-day window from today, independent of
  // whichever month is currently browsed in the grid below.
  const weekly: { sortKey: number; row: UpcomingEventRow }[] = [];

  for (const ev of lessonEvents) {
    const n = daysFromToday(ev.date, today);
    if (n < 0 || n > 6) continue;
    const shortDate = formatShortDate(ev.date);
    if (ev.recorded) {
      weekly.push({
        sortKey: n,
        row: {
          id: ev.eventId,
          tone: "cyan",
          kind: "lesson",
          title: ev.lessonTitle,
          meta: `${ev.rate ?? 0}% present`,
          dateLabel: dayLabel(n, shortDate),
          href: lessonHref(ev.eventId),
        },
      });
    } else if (n === 0) {
      weekly.push({
        sortKey: n,
        row: {
          id: ev.eventId,
          tone: "magenta",
          kind: "lesson",
          title: ev.lessonTitle,
          meta: `${ev.lessonRef} · no register`,
          dateLabel: "Today",
          href: lessonHref(ev.eventId),
        },
      });
    } else {
      weekly.push({
        sortKey: n,
        row: {
          id: ev.eventId,
          tone: "cyan",
          kind: "lesson",
          title: ev.lessonTitle,
          meta: ev.lessonRef,
          dateLabel: dayLabel(n, shortDate),
          href: lessonHref(ev.eventId),
        },
      });
    }
  }

  for (const ev of crusadeEvents) {
    const n = daysFromToday(ev.date, today);
    if (n < 0 || n > 6) continue;
    weekly.push({
      sortKey: n,
      row: {
        id: ev.eventId,
        tone: "violet",
        kind: "crusade",
        title: `Crusade day ${ev.crusadeDay + 1}`,
        meta: `After class ${ev.afterClass}`,
        dateLabel: dayLabel(n, formatShortDate(ev.date)),
        href: null,
      },
    });
  }

  for (const b of upcomingBirthdays(students, today, 20)) {
    if (b.daysUntil > 6) continue;
    weekly.push({
      sortKey: b.daysUntil,
      row: {
        id: `birthday-${b.studentId}`,
        tone: "yellow",
        kind: "birthday",
        title: b.name,
        meta: "Birthday",
        dateLabel: dayLabel(b.daysUntil, formatBirthdayDate(b.day, b.month)),
        href: canOpenStudent ? `/c/${cohortId}/students/${b.studentId}` : null,
      },
    });
  }

  const upcomingRows = weekly.sort((a, b) => a.sortKey - b.sortKey).map((w) => w.row);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Calendar" subtitle={cohort.name} />
      <CalendarView
        cohortId={cohortId}
        lessonEvents={lessonEvents}
        crusadeEvents={crusadeEvents}
        birthdays={birthdays}
        upcomingRows={upcomingRows}
        canOpenLesson={canOpenLesson}
        hasLessonsNav={hasLessonsNav}
        canOpenStudent={canOpenStudent}
        today={today}
      />
    </div>
  );
}
