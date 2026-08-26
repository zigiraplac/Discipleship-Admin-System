import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { monthLabel } from "@/components/reports/report-utils";
import { studentMonthlyRates } from "@/lib/domain/metrics";
import type { Bands, LessonEventView } from "@/lib/domain/types";

/** Same shape as the cohort's own "Month over month" chart (Reports),
 * scoped to one student — a lifetime average moves slowly, so this is
 * the only place a student's own profile shows whether they're actually
 * trending up or down recently. */
export function AttendanceTrendCard({
  studentId,
  lessonEvents,
  bands,
}: {
  studentId: string;
  lessonEvents: LessonEventView[];
  bands: Bands;
}) {
  const monthly = studentMonthlyRates(studentId, lessonEvents);
  if (monthly.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Attendance trend</CardTitle>
          <CardSubtitle>Month over month</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-2.5 px-[18px] py-4">
        {monthly.map((m) => (
          <div key={m.month} className="flex items-center gap-2.5">
            <div className="w-8 flex-none text-[11px] text-ink-tertiary">{monthLabel(m.month)}</div>
            <ProgressBar
              pct={m.rate}
              height={7}
              tone={toneForRate(m.rate, bands.activeThreshold, bands.helpThreshold)}
              className="flex-1"
            />
            <div className="w-16 flex-none text-right text-[12px] font-semibold text-ink tabular">
              {m.attended}/{m.expected} · {m.rate}%
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
