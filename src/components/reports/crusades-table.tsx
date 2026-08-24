import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatShortDate } from "@/lib/utils";
import { crusadeWeekends } from "./report-utils";
import type { CrusadeEventView } from "@/lib/domain/types";

/** There is no real crusade-outcome data model yet (souls-reached /
 * conversions / follow-ups aren't tracked anywhere) — reached/converts/
 * assigned are rendered as "—" for every row rather than inventing a
 * plausible-looking formula. See the crusade report backlog. */
export function CrusadesTable({ crusadeEvents, today }: { crusadeEvents: CrusadeEventView[]; today: string }) {
  const weekends = crusadeWeekends(crusadeEvents).filter((w) => w.friday <= today);

  return (
    <Card className="overflow-hidden">
      <div className="px-[18px] pt-4 pb-3.5">
        <div className="text-[15px] font-bold text-ink">Weekend outreach after each class</div>
        <div className="mt-0.5 text-xs text-ink-muted">Not yet tracked — see the crusade report backlog.</div>
      </div>
      <Table>
        <THead>
          <TH>After</TH>
          <TH>Weekend</TH>
          <TH align="right">Reached</TH>
          <TH align="right">Converts</TH>
          <TH align="right">Assigned</TH>
        </THead>
        <tbody>
          {weekends.map((w) => (
            <TR key={w.afterClass}>
              <TD>Class {w.afterClass}</TD>
              <TD>
                {formatShortDate(w.friday)} – {formatShortDate(w.sunday)}
              </TD>
              <TD align="right">—</TD>
              <TD align="right">—</TD>
              <TD align="right">—</TD>
            </TR>
          ))}
          {weekends.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                No completed crusade weekends yet.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
