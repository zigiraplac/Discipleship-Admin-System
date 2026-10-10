import { cohortCapabilities } from "@/lib/authz";
import { enrolledOn } from "@/lib/domain/enrolment";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { aggregateCohort, isRecorded, lessonStats, earlierUnrecorded } from "@/lib/domain/metrics";
import { todayISO, formatLongDate } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { RegisterForm, type RegisterRosterEntry, type LeftRosterEntry } from "@/components/lessons/register-form";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ cohortId: string; eventId: string }>;
}) {
  const { cohortId: routeParam, eventId } = await params;
  await requireUser();

  const supabase = await createClient();
  const [cohort, bands] = await getCohortWithBands(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_attendance")) notFound();

  const [allStudents, lessonEvents] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
  ]);

  const ev = lessonEvents.find((e) => e.eventId === eventId);
  if (!ev || ev.cohortId !== cohortId) notFound();

  const today = todayISO();
  // A student who's left stops counting in the cohort's own numbers and
  // can't be ticked here — but they still show up as a disabled tile
  // (rather than silently vanishing from the class list) with whatever
  // mark they already had, preserved as-is via frozenAttendance below.
  const students = allStudents.filter((s) => !s.leftAt);
  const leftStudentsRaw = allStudents.filter((s) => s.leftAt);
  const leftIds = new Set(leftStudentsRaw.map((s) => s.id));
  const frozenAttendance: Record<string, "present" | "absent"> = {};
  for (const [sid, mark] of Object.entries(ev.register.attendance)) {
    if (leftIds.has(sid)) frozenAttendance[sid] = mark;
  }
  const leftStudents: LeftRosterEntry[] = leftStudentsRaw.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    mark: frozenAttendance[s.id] ?? null,
  }));
  // Attendance counts everyone enrolled on each lesson's date; only
  // current students can be ticked.
  const agg = aggregateCohort(allStudents, lessonEvents, bands, today);

  const recorded = isRecorded(ev);
  const isFuture = ev.date > today;
  // Recording out of curriculum order is allowed; say what's out of step.
  const missingBefore = !recorded && !isFuture ? earlierUnrecorded(lessonEvents, ev, today) : [];
  // Facilitators and teachers of this cohort take registers; levels above only view.
  const canWriteRole = caps.has("edit_attendance");
  const editable = canWriteRole && !isFuture;

  const roster: RegisterRosterEntry[] = agg.roster.filter((s) => !s.leftAt).map((s) => ({
    id: s.id,
    fullName: s.fullName,
    rate: s.rate,
    attended: s.attended,
    expected: s.expected,
    caughtUp: ev.register.caughtUp?.includes(s.id) ?? false,
  }));

  const thisLessonStats = recorded ? lessonStats(ev, allStudents) : null;
  // Live projection while ticking: everything already counted, minus this
  // lesson's own figure, plus whatever is ticked now. Students who have
  // left keep their saved mark for this lesson (if they were enrolled).
  const countedIds = students.filter((s) => enrolledOn(s, ev.date)).map((s) => s.id);
  const eligibleLeft = leftStudentsRaw.filter((s) => enrolledOn(s, ev.date));
  const frozenPresent = eligibleLeft.filter((s) => frozenAttendance[s.id] === "present").length;
  const totalPresentExcludingThis = agg.totalPresent - (thisLessonStats?.present ?? 0) + frozenPresent;
  const projectedExpected = agg.totalExpected + (recorded ? 0 : countedIds.length + eligibleLeft.length);

  const dateLong = formatLongDate(ev.date);
  const backHref = `/c/${cohort.slug}/lessons`;

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

      {/* Register status: a missing register is a reporting gap, not absences. */}
      {isFuture ? (
        <div className="rounded-[10px] border border-border bg-subtle px-4 py-3 text-[13px] text-ink-secondary">
          <span className="font-semibold text-ink">Scheduled</span> for {dateLong}. The register opens on the day.
        </div>
      ) : recorded && thisLessonStats ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-border bg-accent-100 px-4 py-3 text-[13px] text-accent-800">
          <span className="flex items-center gap-1.5 font-semibold">
            <CheckCircle size={16} weight="fill" /> Recorded
          </span>
          <span>{thisLessonStats.expected} students</span>
          <span>Present {thisLessonStats.present}</span>
          <span>Absent {thisLessonStats.absent}</span>
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-yellow-100 px-4 py-3 text-[13px] text-yellow-ink">
          <span className="flex items-center gap-1.5 font-semibold">
            <WarningCircle size={16} weight="fill" /> Not recorded
          </span>
          <span className="mt-0.5 block">This lesson isn&apos;t counted in attendance until the register is submitted.</span>
        </div>
      )}

      {missingBefore.length > 0 && (
        <div className="rounded-[10px] border border-border bg-yellow-100 px-4 py-3 text-[13px] text-yellow-ink">
          <span className="font-semibold">
            {missingBefore.length === 1 ? "1 earlier lesson" : `${missingBefore.length} earlier lessons`} not recorded yet
          </span>{" "}
          ({missingBefore.slice(0, 4).map((e) => e.lessonRef).join(", ")}
          {missingBefore.length > 4 ? ", …" : ""}). You can still record this one.
        </div>
      )}

      <RegisterForm
        cohortId={cohortId}
        cohortSlug={cohort.slug}
        eventId={ev.eventId}
        lessonTitle={ev.lessonTitle}
        lessonRef={ev.lessonRef}
        dateLong={dateLong}
        roster={roster}
        leftStudents={leftStudents}
        initialAttendance={recorded ? ev.register.attendance : {}}
        frozenAttendance={frozenAttendance}
        expectedVersion={ev.register.updatedAt ?? ev.register.recordedAt ?? null}
        recorded={recorded}
        isFuture={isFuture}
        editable={editable}
        enrolled={agg.enrolled}
        totalPresentExcludingThis={totalPresentExcludingThis}
        totalExpected={projectedExpected}
        countedIds={countedIds}
        activeThreshold={bands.activeThreshold}
        helpThreshold={bands.helpThreshold}
      />
    </div>
  );
}
