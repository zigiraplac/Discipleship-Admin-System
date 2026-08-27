import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pill } from "@/components/ui/pill";
import { formatShortDate } from "@/lib/utils";
import { crusadeWeekends } from "./report-utils";
import { CrusadeReportDialog } from "./crusade-report-dialog";
import type { CrusadeEventView } from "@/lib/domain/types";
import type { CrusadeReport } from "@/lib/data/crusades";

/** Recording a report *is* how a weekend gets marked as having happened —
 * there's no separate "done" flag. A weekend with no report yet still
 * shows here (so it isn't just missing), with a call to action instead of
 * a filled-in theme/preacher. */
export function CrusadesTable({
  cohortId,
  crusadeEvents,
  reportsByAfterClass,
  canRecord,
  today,
}: {
  cohortId: string;
  crusadeEvents: CrusadeEventView[];
  reportsByAfterClass: Map<number, CrusadeReport>;
  /** Only facilitator/admin can record or edit a report; leadership and
   * teacher see the same info read-only. */
  canRecord: boolean;
  today: string;
}) {
  // Every weekend shows here, not just ones that have already happened —
  // hiding future weekends entirely used to mean this table looked
  // completely empty for any cohort that hadn't reached its first one
  // yet, with no visible sign the feature existed at all.
  const weekends = crusadeWeekends(crusadeEvents);

  return (
    <Card className="overflow-hidden">
      <div className="px-[18px] pt-4 pb-3.5">
        <div className="text-[15px] font-bold text-ink">Weekend outreach after each class</div>
        <div className="mt-0.5 text-xs text-ink-muted">Theme, preacher, and notes for each crusade weekend.</div>
      </div>
      <Table>
        <THead>
          <TH>After</TH>
          <TH>Weekend</TH>
          <TH>Theme</TH>
          <TH>Preacher</TH>
          <TH align="right">Status</TH>
        </THead>
        <tbody>
          {weekends.map((w) => {
            const report = reportsByAfterClass.get(w.afterClass) ?? null;
            const upcoming = !report && w.friday > today;
            return (
              <TR key={w.afterClass}>
                <TD>Class {w.afterClass}</TD>
                <TD>
                  {formatShortDate(w.friday)} – {formatShortDate(w.saturday)}
                </TD>
                <TD className="text-ink-secondary">{report?.theme ?? "—"}</TD>
                <TD className="text-ink-secondary">{report?.preacher ?? "—"}</TD>
                <TD align="right">
                  {canRecord ? (
                    <CrusadeReportDialog
                      cohortId={cohortId}
                      afterClass={w.afterClass}
                      friday={w.friday}
                      saturday={w.saturday}
                      report={report}
                    />
                  ) : (
                    <Pill tone={report ? "green" : upcoming ? "grey" : "magenta"}>
                      {report ? "Done" : upcoming ? "Upcoming" : "Not done"}
                    </Pill>
                  )}
                </TD>
              </TR>
            );
          })}
          {weekends.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                No crusade weekends in this cohort&rsquo;s schedule.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
