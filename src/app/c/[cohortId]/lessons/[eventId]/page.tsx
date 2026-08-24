import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { aggregateCohort, isRecorded, lessonStats } from "@/lib/domain/metrics";
import { todayISO, formatLongDate } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { RegisterForm, type RegisterRosterEntry } from "@/components/lessons/register-form";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ cohortId: string; eventId: string }>;
}) {
  const { cohortId, eventId } = await params;
  const user = await requireUser();

  // Teacher's Lessons is read-only — no register access, no drilling in.
  if (user.role === "teacher") {
    redirect(`/c/${cohortId}/lessons`);
  }

  const supabase = await createClient();
  const [cohort, bands] = await Promise.all([getCohort(supabase, cohortId), getBands(supabase)]);
  if (!cohort) notFound();

  const [students, lessonEvents] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
  ]);

  const ev = lessonEvents.find((e) => e.eventId === eventId);
  if (!ev || ev.cohortId !== cohortId) notFound();

  const today = todayISO();
  const agg = aggregateCohort(students, lessonEvents, bands, today);

  const recorded = isRecorded(ev);
  const isFuture = ev.date > today;
  const canWriteRole = user.role === "facilitator" || user.role === "admin";
  const editable = canWriteRole && !isFuture;

  const roster: RegisterRosterEntry[] = agg.roster.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    rate: s.rate,
    attended: s.attended,
    expected: s.expected,
  }));

  const thisLessonStats = recorded ? lessonStats(ev, agg.enrolled) : null;
  const recordedCountExcludingThis = agg.recordedCount - (recorded ? 1 : 0);
  const totalPresentExcludingThis = agg.totalPresent - (thisLessonStats?.present ?? 0);

  const dateLong = formatLongDate(ev.date);
  const backHref = `/c/${cohortId}/lessons`;

  return (
    <div className="flex flex-col gap-4">
      <PageHead title={ev.lessonTitle} subtitle={`${cohort.name} · ${ev.lessonRef} · ${dateLong}`} />

      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-secondary hover:text-accent-700"
      >
        <ArrowLeft size={14} />
        All lessons
      </Link>

      <RegisterForm
        cohortId={cohortId}
        eventId={ev.eventId}
        lessonTitle={ev.lessonTitle}
        lessonRef={ev.lessonRef}
        dateLong={dateLong}
        roster={roster}
        initialAttendance={recorded ? ev.register.attendance : {}}
        recorded={recorded}
        isFuture={isFuture}
        editable={editable}
        enrolled={agg.enrolled}
        recordedCountExcludingThis={recordedCountExcludingThis}
        totalPresentExcludingThis={totalPresentExcludingThis}
        activeThreshold={bands.activeThreshold}
        helpThreshold={bands.helpThreshold}
      />
    </div>
  );
}
