import { notFound } from "next/navigation";
import { CheckCircle, WarningCircle, BookOpen, Gauge, SignOut } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCohort, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { getCatchupCountsByEvent } from "@/lib/data/catchup";
import { aggregateCohort, isRecorded, lessonStats, computePace } from "@/lib/domain/metrics";
import { cohortHealth } from "@/lib/domain/bands";
import { CURRICULUM, classSpans, lessonAt } from "@/lib/domain/curriculum";
import { upcomingBirthdays, formatBirthdayDate } from "@/lib/domain/birthdays";
import { todayISO, formatShortDate } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/lib/roles";
import { PageHead } from "@/components/shell/page-head";
import { KpiRow, KpiCard, type DeltaTone } from "@/components/dashboard/kpi-card";
import { AttendanceChart, type ChartBar } from "@/components/dashboard/attendance-chart";
import { UpcomingEventsCard, type UpcomingEventRow } from "@/components/shared/upcoming-events";
import { NeedsAttentionTable } from "@/components/dashboard/needs-attention-table";
import { Greeting } from "@/components/dashboard/greeting";
import { HealthPill } from "@/components/ui/pill";
import { LessonsHeatmap } from "@/components/lessons/lessons-heatmap";
import { buildLessonRows, buildLessonRowsPublic } from "@/components/lessons/lesson-rows";
import type { LessonRow } from "@/components/lessons/lessons-browser";
import type { Student } from "@/lib/domain/types";

/** Only lessons already due (recorded or not) — a future, not-yet-taught
 * lesson has nothing to show yet and would just read as a false "0%". A
 * missing register for a due lesson, on the other hand, genuinely is 0%
 * and stays visible as a gap in the trend rather than quietly vanishing. */
const EMPTY_BAR: Pick<ChartBar, "rate" | "presentPct" | "catchupPct" | "absentPct"> = {
  rate: 0,
  presentPct: 0,
  catchupPct: 0,
  absentPct: 0,
};

/** presentCount excludes catch-up corrections — those are their own
 * segment — so presentPct + catchupPct + absentPct always adds to 100
 * for a recorded lesson/class. */
function splitBar(presentCount: number, catchupCount: number, enrolled: number): typeof EMPTY_BAR {
  if (!enrolled) return EMPTY_BAR;
  const presentPct = Math.round((presentCount / enrolled) * 100);
  const catchupPct = Math.round((catchupCount / enrolled) * 100);
  const absentPct = Math.max(0, 100 - presentPct - catchupPct);
  return { rate: presentPct + catchupPct, presentPct, catchupPct, absentPct };
}

function splitBarTitle(ref: string, split: typeof EMPTY_BAR): string {
  if (split.rate === 0 && split.presentPct === 0 && split.absentPct === 0) return `${ref} · not recorded`;
  return split.catchupPct > 0
    ? `${ref} · ${split.rate}% attended (${split.catchupPct}% caught up) · ${split.absentPct}% absent`
    : `${ref} · ${split.rate}% attended · ${split.absentPct}% absent`;
}

function buildLessonBars(
  lessons: {
    globalIndex: number;
    lessonRef: string;
    date: string;
    recorded: boolean;
    present: number;
    catchup: number;
    enrolled: number;
  }[],
  todayISO: string
): ChartBar[] {
  return lessons
    .filter((l) => l.date <= todayISO)
    .sort((a, b) => a.globalIndex - b.globalIndex)
    .slice(-16)
    .map((l) => {
      const split = l.recorded ? splitBar(l.present, l.catchup, l.enrolled) : EMPTY_BAR;
      return { label: `L${l.globalIndex + 1}`, title: splitBarTitle(l.lessonRef, split), ...split };
    });
}

function classBarsFromCounts(
  counts: { present: number; catchup: number; enrolled: number; started: boolean }[]
): ChartBar[] {
  return counts.map((c, ci) => {
    const split = c.started ? splitBar(c.present, c.catchup, c.enrolled) : EMPTY_BAR;
    return { label: `C${ci + 1}`, title: splitBarTitle(CURRICULUM[ci].title, split), ...split };
  });
}

/** Whole days between two ISO dates — used to interleave lessons/crusades
 * and birthdays into one chronological "what's coming up" list. */
function daysFromToday(dateISO: string, todayISO: string): number {
  const [y1, m1, d1] = todayISO.split("-").map(Number);
  const [y2, m2, d2] = dateISO.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

interface UpcomingItem {
  sortKey: number;
  row: UpcomingEventRow;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: routeParam } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [cohort, bands] = await Promise.all([getCohort(supabase, routeParam), getBands(supabase)]);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  const cohortSlug = cohort.slug;
  const today = todayISO();
  const spans = classSpans();

  let recordedCount = 0;
  let rate = 0;
  let lessonBars: ChartBar[] = [];
  let classBars: ChartBar[] = [];
  let lessonItems: UpcomingItem[] = [];
  let attentionRows: Awaited<ReturnType<typeof aggregateCohort>>["roster"] | null = null;
  let atRiskCount = 0;
  let enrolled = 0;
  let leftCount = 0;
  let studentsForBirthdays: Student[] = [];
  // The last curriculum lesson's own (possibly postponed) scheduled date —
  // the real, live-reflowed schedule already answers "when does this
  // finish", so there's no need to re-derive a projection from scratch.
  let finishDate: string | null = null;
  let heatmapRows: LessonRow[] = [];

  const canOpenStudent = NAV_BY_ROLE[user.role].includes("students");
  const studentHref = canOpenStudent ? (id: string) => `/c/${cohortSlug}/students/${id}` : null;

  if (user.role === "teacher") {
    const [pub, students] = await Promise.all([
      getLessonEventsPublic(supabase, cohortId),
      getStudents(supabase, cohortId),
    ]);
    leftCount = students.filter((s) => s.leftAt).length;
    studentsForBirthdays = students.filter((s) => !s.leftAt);
    finishDate = pub[pub.length - 1]?.date ?? null;
    heatmapRows = buildLessonRowsPublic(pub, bands, today);
    const recorded = pub.filter((p) => p.recorded);
    recordedCount = recorded.length;
    enrolled = pub[0]?.enrolled ?? 0;
    const totalPresent = recorded.reduce((a, p) => a + (p.present ?? 0), 0);
    rate = enrolled && recordedCount ? Math.round((totalPresent / (enrolled * recordedCount)) * 100) : 0;
    // A teacher's client never sees `lesson_catchup` (pastoral detail,
    // blocked by RLS) — their chart shows attended/absent only, no
    // caught-up segment.
    lessonBars = buildLessonBars(
      pub.map((p) => ({
        globalIndex: p.globalIndex,
        lessonRef: p.lessonRef,
        date: p.date,
        recorded: p.recorded,
        present: p.present ?? 0,
        catchup: 0,
        enrolled: p.enrolled ?? 0,
      })),
      today
    );
    classBars = classBarsFromCounts(
      CURRICULUM.map((_, ci) => {
        const inClass = pub.filter((p) => p.classIndex === ci && p.recorded);
        return {
          present: inClass.reduce((a, p) => a + (p.present ?? 0), 0),
          catchup: 0,
          enrolled: inClass.reduce((a, p) => a + (p.enrolled ?? 0), 0),
          started: inClass.length > 0,
        };
      })
    );

    const outstanding = pub.filter((p) => !p.recorded && p.date <= today).sort((a, b) => a.globalIndex - b.globalIndex);
    const upcoming = pub
      .filter((p) => !p.recorded && p.date > today)
      .sort((a, b) => a.globalIndex - b.globalIndex)
      .slice(0, 5);
    lessonItems = [...outstanding.slice(0, 2), ...upcoming].map((p) => {
      const outstandingFlag = !p.recorded && p.date <= today;
      return {
        sortKey: daysFromToday(p.date, today),
        row: {
          id: p.eventId,
          tone: outstandingFlag ? "magenta" : "cyan",
          kind: "lesson",
          title: p.lessonTitle,
          meta: outstandingFlag ? `${p.lessonRef} · no register` : p.lessonRef,
          dateLabel: formatShortDate(p.date),
          href: `/c/${cohortSlug}/lessons`,
        },
      };
    });
  } else {
    const [allStudents, lessonEvents] = await Promise.all([
      getStudents(supabase, cohortId),
      getLessonEvents(supabase, cohortId),
    ]);
    leftCount = allStudents.filter((s) => s.leftAt).length;
    studentsForBirthdays = allStudents.filter((s) => !s.leftAt);
    // A student marked "left" stops counting toward the cohort's own
    // health — the dashboard reflects who's actually still being tracked.
    const students = allStudents.filter((s) => !s.leftAt);
    const activeIds = new Set(students.map((s) => s.id));
    finishDate = lessonEvents[lessonEvents.length - 1]?.date ?? null;
    heatmapRows = buildLessonRows(lessonEvents, activeIds, bands, today);
    const agg = aggregateCohort(students, lessonEvents, bands, today);
    recordedCount = agg.recordedCount;
    rate = agg.rate;
    enrolled = agg.enrolled;
    atRiskCount = agg.atRisk;

    const catchupCounts = await getCatchupCountsByEvent(
      supabase,
      lessonEvents.map((e) => e.eventId),
      activeIds
    );

    lessonBars = buildLessonBars(
      lessonEvents.map((e) => {
        const catchup = catchupCounts.get(e.eventId) ?? 0;
        return {
          globalIndex: e.globalIndex,
          lessonRef: e.lessonRef,
          date: e.date,
          recorded: isRecorded(e),
          present: (lessonStats(e, activeIds)?.present ?? 0) - catchup,
          catchup,
          enrolled: activeIds.size,
        };
      }),
      today
    );
    classBars = classBarsFromCounts(
      CURRICULUM.map((_, ci) => {
        const inClass = lessonEvents.filter((e) => e.classIndex === ci && isRecorded(e));
        let present = 0;
        let catchup = 0;
        for (const e of inClass) {
          const cu = catchupCounts.get(e.eventId) ?? 0;
          present += lessonStats(e, activeIds)!.present - cu;
          catchup += cu;
        }
        return { present, catchup, enrolled: activeIds.size * inClass.length, started: inClass.length > 0 };
      })
    );

    const upcoming = lessonEvents
      .filter((e) => !isRecorded(e) && e.date > today)
      .slice(0, 5);
    lessonItems = [...agg.outstanding.slice(0, 2), ...upcoming].map((e) => {
      const outstandingFlag = !isRecorded(e) && e.date <= today;
      return {
        sortKey: daysFromToday(e.date, today),
        row: {
          id: e.eventId,
          tone: outstandingFlag ? "magenta" : "cyan",
          kind: "lesson",
          title: e.lessonTitle,
          meta: outstandingFlag ? `${e.lessonRef} · no register` : e.lessonRef,
          dateLabel: formatShortDate(e.date),
          href: `/c/${cohortSlug}/lessons/${e.eventId}`,
        },
      };
    });

    attentionRows = agg.roster
      .filter((s) => s.status !== "On track")
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 4);
  }

  let classIndex = spans.findIndex(([a, b]) => recordedCount >= a && recordedCount <= b);
  if (classIndex < 0) classIndex = CURRICULUM.length - 1;
  const currentClass = CURRICULUM[classIndex];

  const attendanceDelta = rate >= bands.activeThreshold ? "On target" : `${bands.activeThreshold - rate} under`;
  const attendanceTone: DeltaTone = rate >= bands.activeThreshold ? "ok" : "bad";

  // Never stored — re-derived from the cohort's own ideal plan (real
  // start date, teaching days, lessons/session) vs. what's actually
  // recorded, so postponing a lesson can never leave this stale.
  const pace = computePace(cohort, recordedCount, today);
  const onPace = pace.gap <= 0;

  // Same tiers already shown on the Cohorts switcher list — surfaced here
  // too since that's the only place it showed before, not the dashboard a
  // facilitator actually spends their day on.
  const health = cohortHealth(rate, atRiskCount, enrolled);

  const birthdays = upcomingBirthdays(studentsForBirthdays, today, 5);
  const birthdayItems: UpcomingItem[] = birthdays.map((b) => ({
    sortKey: b.daysUntil,
    row: {
      id: `birthday-${b.studentId}`,
      tone: "yellow",
      kind: "birthday",
      title: b.name,
      meta: "Birthday",
      dateLabel: b.daysUntil === 0 ? "Today" : b.daysUntil === 1 ? "Tomorrow" : formatBirthdayDate(b.day, b.month),
      href: studentHref ? studentHref(b.studentId) : null,
    },
  }));

  // One combined "what's coming up" list — lessons/crusades and
  // birthdays interleaved by how soon they are, the same pattern the
  // Calendar's own "This week" panel already uses, instead of two
  // separate cards competing for the same space.
  const upNext: UpcomingEventRow[] = [...lessonItems, ...birthdayItems]
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, 6)
    .map((i) => i.row);

  const attentionHref = NAV_BY_ROLE[user.role].includes("attention") ? `/c/${cohortSlug}/attention` : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead
        title={user.role === "leadership" ? "Overview" : "Dashboard"}
        subtitle={`${cohort.name} · Class ${classIndex + 1} of 7`}
      />

      <Greeting name={user.name} right={<HealthPill health={health} />} />

      <KpiRow>
        <KpiCard
          icon={<CheckCircle size={15} />}
          label="Attendance"
          value={`${rate}%`}
          delta={attendanceDelta}
          deltaTone={attendanceTone}
          sub={`Target ${bands.activeThreshold}%`}
        />
        {attentionRows !== null && (
          <KpiCard
            icon={<WarningCircle size={15} />}
            label="Needs attention"
            value={atRiskCount}
            sub={`of ${enrolled} students`}
          />
        )}
        <KpiCard
          icon={<BookOpen size={15} />}
          label="Lessons recorded"
          value={`${recordedCount}/80`}
          sub={`Class ${classIndex + 1} · ${currentClass.title}`}
        />
        <KpiCard
          icon={<Gauge size={15} />}
          label="Pace"
          value={onPace ? "On pace" : `${pace.gap} behind`}
          delta={onPace ? "On target" : "Catch up"}
          deltaTone={onPace ? "ok" : "bad"}
          sub={
            recordedCount < 80
              ? `Now at ${lessonAt(recordedCount).ref}${finishDate ? ` · Ends ${formatShortDate(finishDate)}` : ""}`
              : finishDate
                ? `Ends ${formatShortDate(finishDate)}`
                : "vs. this cohort's own ideal plan"
          }
        />
        <KpiCard
          icon={<SignOut size={15} />}
          label="Left the program"
          value={leftCount}
          sub="No longer tracked in these numbers"
        />
      </KpiRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <AttendanceChart lessonBars={lessonBars} classBars={classBars} />
          <LessonsHeatmap
            cohortSlug={cohortSlug}
            rows={heatmapRows}
            canOpenRegister={user.role === "facilitator" || user.role === "admin"}
          />
        </div>
        <UpcomingEventsCard title="Upcoming" rows={upNext} emptyLabel="Nothing coming up in the next few days." />
      </div>

      {attentionRows !== null && (
        <NeedsAttentionTable
          cohortSlug={cohortSlug}
          rows={attentionRows}
          bands={bands}
          attentionHref={attentionHref}
        />
      )}
    </div>
  );
}
