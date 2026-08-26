import { notFound } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic, getCrusadeEvents } from "@/lib/data/lessons";
import { TOTAL_LESSONS, CURRICULUM } from "@/lib/domain/curriculum";
import { todayISO, formatShortDate } from "@/lib/utils";
import { PageHead } from "@/components/shell/page-head";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { LessonsBrowser, type LessonRow } from "@/components/lessons/lessons-browser";
import { buildLessonRows, buildLessonRowsPublic } from "@/components/lessons/lesson-rows";

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

  if (user.role === "teacher") {
    const pub = await getLessonEventsPublic(supabase, cohortId);
    rows = buildLessonRowsPublic(pub, bands, today);
  } else {
    const [allStudents, lessonEvents] = await Promise.all([
      getStudents(supabase, cohortId),
      getLessonEvents(supabase, cohortId),
    ]);
    // Left students stop counting toward the cohort's own numbers, same
    // as everywhere else — otherwise this page's rates disagree with
    // Dashboard/Attention for a cohort with any departures.
    const activeIds = new Set(allStudents.filter((s) => !s.leftAt).map((s) => s.id));
    rows = buildLessonRows(lessonEvents, activeIds, bands, today);
  }

  const recordedCount = rows.filter((r) => r.status === "recorded").length;
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
