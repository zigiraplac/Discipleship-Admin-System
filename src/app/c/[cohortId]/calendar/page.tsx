import { notFound } from "next/navigation";
import { NAV_BY_ROLE, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getCrusadeEvents, getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { lessonStats } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { CalendarView } from "@/components/calendar/calendar-view";
import type { CalendarLessonEvent } from "@/components/calendar/calendar-types";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const user = await requireUser();
  if (!NAV_BY_ROLE[user.role].includes("calendar")) notFound();

  const supabase = await createClient();
  const [cohort, students, crusadeEvents] = await Promise.all([
    getCohort(supabase, cohortId),
    getStudents(supabase, cohortId),
    getCrusadeEvents(supabase, cohortId),
  ]);
  if (!cohort) notFound();

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
    const enrolled = students.length;
    const full = await getLessonEvents(supabase, cohortId);
    lessonEvents = full.map((e) => {
      const stats = lessonStats(e, enrolled);
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

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Calendar" subtitle={cohort.name} />
      <CalendarView
        cohortId={cohortId}
        lessonEvents={lessonEvents}
        crusadeEvents={crusadeEvents}
        birthdays={birthdays}
        canOpenLesson={canOpenLesson}
        hasLessonsNav={hasLessonsNav}
        canOpenStudent={canOpenStudent}
        today={todayISO()}
      />
    </div>
  );
}
