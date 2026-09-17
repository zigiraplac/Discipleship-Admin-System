"use client";

import { useMemo, useState } from "react";
import { DownloadSimple, FilePdf, WarningCircle, SignOut } from "@phosphor-icons/react";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { HealthPill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import type { Bands, CohortHealth } from "@/lib/domain/types";
import type { MajorChange } from "@/lib/data/audit";
import { ByClassCard } from "./by-class-card";
import { MonthChartCard } from "./month-chart-card";
import { HighlightCards } from "./highlight-cards";
import { WhatsChangedCard } from "@/components/shared/whats-changed-card";
import { TrendSparkline } from "./trend-sparkline";
import { downloadLessonsCsv } from "./csv-export";
import { formatRangeLabel, inRange, resolvePeriodRange, type Period, type ReportLesson } from "./report-utils";

const PERIOD_OPTIONS: SegmentedOption<Period>[] = [
  { value: "Month", label: "Month" },
  { value: "Quarter", label: "Quarter" },
  { value: "All", label: "All" },
];

export function ReportsView({
  cohortName,
  lessons,
  majorChanges,
  enrolled,
  leftCount,
  insights,
  bands,
  today,
  paceGap,
}: {
  cohortName: string;
  lessons: ReportLesson[];
  majorChanges: MajorChange[];
  enrolled: number;
  leftCount: number;
  /** Null for teacher — per-student status needs the full register, which
   * RLS blocks for that role (same reason Dashboard hides its own "Needs
   * follow up" KPI/table there). */
  insights: { health: CohortHealth; atRisk: number } | null;
  bands: Bands;
  today: string;
  /** Positive = behind the cohort's own ideal pace, 0/negative = on or ahead. */
  paceGap: number;
}) {
  // Crusade postponements are Crusades' own history now (see the Crusades
  // page) — Reports only narrates lesson/cohort-level schedule changes, so
  // nothing crusade-related leaks back in here.
  const nonCrusadeChanges = useMemo(() => majorChanges.filter((c) => c.changeKind !== "crusade"), [majorChanges]);
  const [period, setPeriod] = useState<Period>("Month");

  const range = useMemo(() => resolvePeriodRange(period, today, lessons), [period, today, lessons]);
  const rangeLabel = useMemo(() => formatRangeLabel(range.start, range.end), [range]);

  const inPeriod = useMemo(
    () => lessons.filter((l) => inRange(l.date, range.start, range.end)),
    [lessons, range]
  );
  const recordedInPeriod = useMemo(() => inPeriod.filter((l) => l.recorded), [inPeriod]);

  const lessonsTaught = inPeriod.length;
  const sumPresent = recordedInPeriod.reduce((a, l) => a + (l.present ?? 0), 0);
  const sumAbsent = recordedInPeriod.reduce((a, l) => a + (l.absent ?? 0), 0);
  const attendanceRate =
    recordedInPeriod.length && enrolled
      ? Math.round((sumPresent / (enrolled * recordedInPeriod.length)) * 100)
      : null;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Only shown when printing — the screen already has this in the
          top bar's page title, which .no-print hides for print. */}
      <div className="hidden print:block">
        <div className="text-[20px] font-bold text-ink">{cohortName} — Report</div>
        <div className="text-xs text-ink-muted">
          {period} · {rangeLabel} · generated {today}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-3">
        <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} solid />
        <span className="text-xs text-ink-muted">{rangeLabel}</span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
            <FilePdf size={14} />
            Download PDF
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => downloadLessonsCsv(inPeriod, cohortName, `${period}-${rangeLabel}`)}
          >
            <DownloadSimple size={14} />
            Download CSV
          </Button>
        </div>
      </div>

      <StatGrid>
        <StatCard label="Lessons" value={lessonsTaught} sub={`${recordedInPeriod.length} recorded`} />
        <StatCard
          label="Attendance"
          value={attendanceRate != null ? `${attendanceRate}%` : "—"}
          sub={`target ${bands.activeThreshold}%`}
          trend={<TrendSparkline lessons={lessons} enrolled={enrolled} bands={bands} />}
        />
        <StatCard label="Absences" value={sumAbsent} sub="seats missed" />
        <StatCard
          label="Pace"
          value={paceGap <= 0 ? "On pace" : `${paceGap} behind`}
          sub="vs. this cohort's own ideal plan"
        />
      </StatGrid>

      {/* Dashboard-only insights, folded into the report itself instead of
          a separate embedded view — insights is null for teacher (RLS
          blocks the per-student data behind it), so those two cards drop
          out rather than show a wrong number; left-count needs nothing
          RLS-gated, so it always renders. */}
      <StatGrid>
        {insights && (
          <StatCard label="Cohort health" value={<HealthPill health={insights.health} />} sub="overall status" />
        )}
        {insights && (
          <StatCard
            icon={WarningCircle}
            tone="magenta"
            label="Needs follow up"
            value={insights.atRisk}
            sub={`of ${enrolled} enrolled`}
          />
        )}
        <StatCard icon={SignOut} tone="grey" label="Left the program" value={leftCount} sub="no longer enrolled" />
      </StatGrid>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ByClassCard lessons={lessons} enrolled={enrolled} bands={bands} />
        <div className="flex flex-col gap-4">
          <MonthChartCard lessons={lessons} enrolled={enrolled} bands={bands} />
          <HighlightCards recordedInPeriod={recordedInPeriod} enrolled={enrolled} />
        </div>
      </div>

      <WhatsChangedCard
        changes={nonCrusadeChanges}
        subtitle="Lesson postponements and cohort milestones, with reasons where given — crusade weekends have their own history on the Crusades page"
        emptyLabel="Nothing schedule-affecting has happened in this cohort yet."
      />
    </div>
  );
}
