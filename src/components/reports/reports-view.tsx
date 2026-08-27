"use client";

import { useMemo, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import type { Bands, CrusadeEventView } from "@/lib/domain/types";
import { ByClassCard } from "./by-class-card";
import { MonthChartCard } from "./month-chart-card";
import { HighlightCards } from "./highlight-cards";
import { CrusadesTable } from "./crusades-table";
import { downloadLessonsCsv } from "./csv-export";
import { formatRangeLabel, inRange, resolvePeriodRange, type Period, type ReportLesson } from "./report-utils";

const PERIOD_OPTIONS: SegmentedOption<Period>[] = [
  { value: "Month", label: "Month" },
  { value: "Quarter", label: "Quarter" },
  { value: "All", label: "All" },
];

export function ReportsView({
  cohortId,
  cohortName,
  lessons,
  crusadeEvents,
  completedAfterClasses,
  canRecordCrusades,
  enrolled,
  bands,
  today,
  paceGap,
}: {
  cohortId: string;
  cohortName: string;
  lessons: ReportLesson[];
  crusadeEvents: CrusadeEventView[];
  completedAfterClasses: Set<number>;
  canRecordCrusades: boolean;
  enrolled: number;
  bands: Bands;
  today: string;
  /** Positive = behind the cohort's own ideal pace, 0/negative = on or ahead. */
  paceGap: number;
}) {
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
      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} solid />
        <span className="text-xs text-ink-muted">{rangeLabel}</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={() => downloadLessonsCsv(inPeriod, cohortName, `${period}-${rangeLabel}`)}
        >
          <DownloadSimple size={14} />
          Download report
        </Button>
      </div>

      <StatGrid>
        <StatCard label="Lessons" value={lessonsTaught} sub={`${recordedInPeriod.length} recorded`} />
        <StatCard
          label="Attendance"
          value={attendanceRate != null ? `${attendanceRate}%` : "—"}
          sub={`target ${bands.activeThreshold}%`}
        />
        <StatCard label="Absences" value={sumAbsent} sub="seats missed" />
        <StatCard
          label="Pace"
          value={paceGap <= 0 ? "On pace" : `${paceGap} behind`}
          sub="vs. this cohort's own ideal plan"
        />
      </StatGrid>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ByClassCard lessons={lessons} enrolled={enrolled} bands={bands} />
        <div className="flex flex-col gap-4">
          <MonthChartCard lessons={lessons} enrolled={enrolled} bands={bands} />
          <HighlightCards recordedInPeriod={recordedInPeriod} enrolled={enrolled} />
        </div>
      </div>

      <CrusadesTable
        cohortId={cohortId}
        crusadeEvents={crusadeEvents}
        completedAfterClasses={completedAfterClasses}
        canRecord={canRecordCrusades}
        today={today}
      />
    </div>
  );
}
