import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pill } from "@/components/ui/pill";
import { formatShortDate } from "@/lib/utils";
import { crusadeWeekends } from "./report-utils";
import { CrusadeDoneButton } from "./crusade-done-button";
import type { CrusadeEventView } from "@/lib/domain/types";

/** There is no real crusade-outcome data model yet (souls-reached /
 * conversions / follow-ups aren't tracked anywhere) — reached/converts/
 * assigned are rendered as "—" for every row rather than inventing a
 * plausible-looking formula. See the crusade report backlog. Whether the
 * weekend actually happened, on the other hand, is tracked — that's
 * `completedAfterClasses`. */
export function CrusadesTable({
  cohortId,
  crusadeEvents,
  completedAfterClasses,
  canRecord,
  today,
}: {
  cohortId: string;
  crusadeEvents: CrusadeEventView[];
  completedAfterClasses: Set<number>;
  /** Only facilitator/admin can mark a weekend done — leadership and
   * teacher see the same status read-only. */
  canRecord: boolean;
  today: string;
}) {
  const weekends = crusadeWeekends(crusadeEvents).filter((w) => w.friday <= today);

  return (
    <Card className="overflow-hidden">
      <div className="px-[18px] pt-4 pb-3.5">
        <div className="text-[15px] font-bold text-ink">Weekend outreach after each class</div>
        <div className="mt-0.5 text-xs text-ink-muted">
          Reached/converts/follow-ups aren&rsquo;t tracked yet — see the crusade report backlog.
        </div>
      </div>
      <Table>
        <THead>
          <TH>After</TH>
          <TH>Weekend</TH>
          <TH align="right">Reached</TH>
          <TH align="right">Converts</TH>
          <TH align="right">Assigned</TH>
          <TH align="right">Status</TH>
        </THead>
        <tbody>
          {weekends.map((w) => {
            const completed = completedAfterClasses.has(w.afterClass);
            return (
              <TR key={w.afterClass}>
                <TD>Class {w.afterClass}</TD>
                <TD>
                  {formatShortDate(w.friday)} – {formatShortDate(w.sunday)}
                </TD>
                <TD align="right">—</TD>
                <TD align="right">—</TD>
                <TD align="right">—</TD>
                <TD align="right">
                  {canRecord ? (
                    <CrusadeDoneButton cohortId={cohortId} afterClass={w.afterClass} completed={completed} />
                  ) : (
                    <Pill tone={completed ? "green" : "grey"}>{completed ? "Done" : "Not done"}</Pill>
                  )}
                </TD>
              </TR>
            );
          })}
          {weekends.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-ink-faint">
                No crusade weekends yet.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
