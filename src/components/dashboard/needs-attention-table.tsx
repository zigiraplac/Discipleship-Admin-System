import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import type { StudentAggregate } from "@/lib/domain/types";

export function NeedsAttentionTable({
  cohortId,
  rows,
  bands,
  attentionHref,
}: {
  cohortId: string;
  rows: StudentAggregate[];
  bands: { activeThreshold: number; helpThreshold: number };
  /** null for a role that can't open the Attention page (e.g. leadership)
   * — omits the link entirely rather than pointing at a page that would
   * just 404 for them. */
  attentionHref: string | null;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-[18px] pt-4 pb-3.5">
        <div className="flex-1">
          <div className="text-[15px] font-bold text-ink">Needs attention</div>
          <div className="mt-0.5 text-xs text-ink-muted">Lowest attendance first</div>
        </div>
        {attentionHref && (
          <Link href={attentionHref} className="text-[13px] font-semibold text-accent-700 hover:underline">
            View all
          </Link>
        )}
      </div>
      <Table>
        <THead>
          <TH>Student</TH>
          <TH>Missed</TH>
          <TH>Attendance</TH>
          <TH>Status</TH>
          <TH align="right" />
        </THead>
        <tbody>
          {rows.map((s) => (
            <TR key={s.id}>
              <TD>
                <span className="flex items-center gap-2.5">
                  <Avatar name={s.fullName} />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{s.fullName}</span>
                    <span className="block text-[11px] text-ink-muted">{s.country}</span>
                  </span>
                </span>
              </TD>
              <TD className="tabular">{s.missed}</TD>
              <TD>
                <span className="flex items-center gap-2.5">
                  <ProgressBar
                    pct={s.rate}
                    tone={toneForRate(s.rate, bands.activeThreshold, bands.helpThreshold)}
                    className="w-[62px]"
                  />
                  <span className="text-[12px] font-semibold tabular">{s.rate}%</span>
                </span>
              </TD>
              <TD>
                <StatusPill status={s.status} />
              </TD>
              <TD align="right">
                <Link href={`/c/${cohortId}/students/${s.id}`} className={buttonVariants({ variant: "secondary", size: "row" })}>
                  Open
                </Link>
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                Nobody needs attention right now.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
