import { notFound } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic, getCrusadeEvents } from "@/lib/data/lessons";
import { isRecorded, lessonStats } from "@/lib/domain/metrics";
import { toneForRate } from "@/components/ui/progress-bar";
import { TOTAL_LESSONS, CURRICULUM } from "@/lib/domain/curriculum";
import { todayISO, formatShortDate } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { LessonsBrowser, type LessonRow } from "@/components/lessons/lessons-browser";

export default async function LessonsPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [cohort, bands, crusadeEvents] = await Promise.all([
    getCohort(supabase, cohortId),
    getBands(supabase),
    getCrusadeEvents(supabase, cohortId),
  ]);
  if (!cohort) notFound();

  const today = todayISO();
  let rows: LessonRow[] = [];
  let recordedCount = 0;

  if (user.role === "teacher") {
    const pub = await getLessonEventsPublic(supabase, cohortId);
    recordedCount = pub.filter((p) => p.recorded).length;
    rows = pub.map((p) => {
      const status: LessonRow["status"] = p.recorded
        ? "recorded"
        : p.date <= today
          ? "missing"
          : "upcoming";
      const ratePct = p.recorded ? p.rate : null;
      return {
        eventId: p.eventId,
        date: p.date,
        globalIndex: p.globalIndex,
        classNumber: p.classNumber,
        lessonRef: p.lessonRef,
        lessonTitle: p.lessonTitle,
        status,
        presentText: p.recorded ? `${p.present}/${p.enrolled}` : "—",
        ratePct,
        tone: ratePct !== null ? toneForRate(ratePct, bands.activeThreshold, bands.helpThreshold) : "grey",
      };
    });
  } else {
    const [students, lessonEvents] = await Promise.all([
      getStudents(supabase, cohortId),
      getLessonEvents(supabase, cohortId),
    ]);
    const enrolled = students.length;
    recordedCount = lessonEvents.filter(isRecorded).length;
    rows = lessonEvents.map((ev) => {
      const recorded = isRecorded(ev);
      const status: LessonRow["status"] = recorded
        ? "recorded"
        : ev.date <= today
          ? "missing"
          : "upcoming";
      const stats = lessonStats(ev, enrolled);
      const ratePct = stats ? stats.rate : null;
      return {
        eventId: ev.eventId,
        date: ev.date,
        globalIndex: ev.globalIndex,
        classNumber: ev.classNumber,
        lessonRef: ev.lessonRef,
        lessonTitle: ev.lessonTitle,
        status,
        presentText: stats ? `${stats.present}/${enrolled}` : "—",
        ratePct,
        tone: ratePct !== null ? toneForRate(ratePct, bands.activeThreshold, bands.helpThreshold) : "grey",
      };
    });
  }

  const missingRows = rows
    .filter((r) => r.status === "missing")
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const missingSub = missingRows[0]?.lessonRef ?? "all up to date";
  const lastLessonDate = rows[rows.length - 1]?.date;

  const weekendsByClass = new Map<number, { fridayDate: string }>();
  for (const ev of crusadeEvents) {
    if (ev.crusadeDay !== 0) continue;
    weekendsByClass.set(ev.afterClass, { fridayDate: ev.date });
  }
  const weekendsDone = [...weekendsByClass.values()].filter((w) => w.fridayDate <= today).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Lessons" subtitle={`${cohort.name} · the register lives here`} />

      <StatGrid>
        <StatCard label="Recorded" value={recordedCount} sub={`of ${TOTAL_LESSONS} lessons`} />
        <StatCard
          label="Missing register"
          value={missingRows.length}
          sub={missingSub}
          icon={missingRows.length > 0 ? WarningCircle : undefined}
          tone="magenta"
        />
        <StatCard
          label="Remaining"
          value={TOTAL_LESSONS - recordedCount}
          sub={lastLessonDate ? `ends ${formatShortDate(lastLessonDate)}` : undefined}
        />
        <StatCard
          label="Crusades done"
          value={weekendsDone}
          sub={`of ${CURRICULUM.length} weekends`}
        />
      </StatGrid>

      <LessonsBrowser cohortId={cohortId} role={user.role} rows={rows} />
    </div>
  );
}
