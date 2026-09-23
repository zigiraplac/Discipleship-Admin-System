import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { HealthPill, Pill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { lessonAt, TOTAL_LESSONS } from "@/lib/domain/curriculum";
import { DeleteCohortDialog } from "./delete-cohort-dialog";
import type { Bands, Cohort } from "@/lib/domain/types";
import type { CohortAggregate, PaceStatus } from "@/lib/domain/metrics";

export interface CohortListRow {
  cohort: Cohort;
  agg: CohortAggregate;
  pace: PaceStatus;
}

/** Same cohorts as the card grid, one row per cohort instead — for
 * comparing every cohort's health/attendance/pace side by side rather than
 * scanning tile by tile. */
export function CohortList({ rows, bands, canDelete }: { rows: CohortListRow[]; bands: Bands; canDelete?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <TH>Cohort</TH>
          <TH>Health</TH>
          <TH>Students</TH>
          <TH>Attendance</TH>
          <TH>Current class</TH>
          <TH>Pace</TH>
          <TH align="right" />
        </THead>
        <tbody>
          {rows.map(({ cohort, agg, pace }) => {
            const current = agg.recordedCount < TOTAL_LESSONS ? lessonAt(agg.recordedCount) : null;
            return (
              <TR key={cohort.id}>
                <TD>
                  <Link href={`/c/${cohort.slug}`} className="hover:underline">
                    <div className="text-[13px] font-semibold text-ink">{cohort.name}</div>
                    <div className="text-[11px] text-ink-muted">{cohort.city ?? "—"}</div>
                  </Link>
                </TD>
                <TD>
                  <HealthPill health={agg.health} />
                </TD>
                <TD className="tabular">{agg.enrolled}</TD>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <ProgressBar
                      pct={agg.recordedCount ? agg.rate : null}
                      tone={toneForRate(agg.rate, bands.activeThreshold, bands.helpThreshold)}
                      className="w-[60px]"
                    />
                    <span className="text-[12px] font-semibold tabular">{agg.rate}%</span>
                  </span>
                </TD>
                <TD className="text-ink-secondary">
                  {current ? current.ref : "Complete"}
                </TD>
                <TD>
                  <Pill tone={pace.gap > 0 ? "magenta" : "cyan"}>
                    {pace.gap > 0 ? `${pace.gap} behind` : "On pace"}
                  </Pill>
                </TD>
                <TD align="right">
                  <span className="flex items-center justify-end gap-2">
                    {canDelete && <DeleteCohortDialog cohortId={cohort.id} cohortName={cohort.name} triggerVariant="icon" />}
                    <Link href={`/c/${cohort.slug}`} className={buttonVariants({ variant: "secondary", size: "row" })}>
                      Open
                    </Link>
                  </span>
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={7} className="py-6 text-center text-ink-faint">
                No cohorts yet.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
