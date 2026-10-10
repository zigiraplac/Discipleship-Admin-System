import { cohortCapabilities } from "@/lib/authz";
import { notFound } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { TOTAL_LESSONS } from "@/lib/domain/curriculum";
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
  const { cohortId: routeParam } = await params;
  await requireUser();
  const supabase = await createClient();

  // Bands come from the cohort's own branch (a level can set stricter ones).
  const [cohort, bands] = await getCohortWithBands(supabase, routeParam);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_cohort")) notFound();

  const today = todayISO();
  let rows: LessonRow[] = [];

  if (!caps.has("view_attendance")) {
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
    rows = buildLessonRows(lessonEvents, allStudents, bands, today);
  }

  const recordedCount = rows.filter((r) => r.status === "recorded").length;
  const missingRows = rows
    .filter((r) => r.status === "missing")
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const missingSub = missingRows[0]?.lessonRef ?? "all up to date";
  const lastLessonDate = rows[rows.length - 1]?.date;

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
      </StatGrid>

      <LessonsBrowser cohortId={cohortId} cohortSlug={cohort.slug} canOpenRegister={caps.has("view_attendance")} canPostpone={caps.has("postpone_lesson")} rows={rows} />
    </div>
  );
}
