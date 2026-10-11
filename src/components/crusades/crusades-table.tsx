"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatShortDate } from "@/lib/utils";
import { crusadeWeekends, type CrusadeWeekend } from "@/components/reports/report-utils";
import { CrusadeDrawer } from "./crusade-drawer";
import type { CrusadeEventView } from "@/lib/domain/types";
import type { CrusadeReport } from "@/lib/data/crusades";

function crusadeStatus(report: CrusadeReport | null, friday: string, today: string): { label: string; tone: PillTone } {
  if (report?.status === "done") return { label: "Done", tone: "green" };
  if (report?.status === "not_done") return { label: "Not done", tone: "magenta" };
  if (friday > today) return { label: "Upcoming", tone: "grey" };
  return { label: "Not recorded", tone: "yellow" };
}

/** Every crusade weekend in the cohort's schedule, one per class. Dates
 * come from the schedule; clicking a row opens the drawer to record
 * theme, preacher, notes and whether it happened. */
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
  /** Only facilitator/admin can record a report or postpone a weekend;
   * leadership and teacher see the same info read-only. */
  canRecord: boolean;
  today: string;
}) {
  // Every weekend shows here, not just ones that have already happened —
  // hiding future weekends entirely used to mean this table looked
  // completely empty for any cohort that hadn't reached its first one
  // yet, with no visible sign the feature existed at all.
  const weekends = crusadeWeekends(crusadeEvents);
  const [open, setOpen] = useState(false);
  // Kept after closing so the drawer's content stays put while it slides out.
  const [selected, setSelected] = useState<CrusadeWeekend | null>(null);

  function openWeekend(w: CrusadeWeekend) {
    setSelected(w);
    setOpen(true);
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <TH>After</TH>
          <TH>Weekend</TH>
          <TH>Theme</TH>
          <TH>Preacher</TH>
          <TH>Notes</TH>
          <TH align="right">Status</TH>
        </THead>
        <tbody>
          {weekends.map((w) => {
            const report = reportsByAfterClass.get(w.afterClass) ?? null;
            const status = crusadeStatus(report, w.friday, today);
            return (
              <TR
                key={w.afterClass}
                className={cn(canRecord && "cursor-pointer hover:bg-hover focus-visible:bg-hover focus-visible:outline-none")}
                tabIndex={canRecord ? 0 : undefined}
                onClick={canRecord ? () => openWeekend(w) : undefined}
                onKeyDown={
                  canRecord
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openWeekend(w);
                        }
                      }
                    : undefined
                }
              >
                <TD className="font-semibold text-ink">Class {w.afterClass}</TD>
                <TD className="whitespace-nowrap">
                  {formatShortDate(w.friday)} – {formatShortDate(w.saturday)}
                </TD>
                <TD className="text-ink-secondary">{report?.theme ?? "—"}</TD>
                <TD className="text-ink-secondary">{report?.preacher ?? "—"}</TD>
                <TD className="max-w-[260px] truncate text-ink-muted">{report?.notes ?? "—"}</TD>
                <TD align="right">
                  <Pill tone={status.tone}>{status.label}</Pill>
                </TD>
              </TR>
            );
          })}
          {weekends.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-ink-faint">
                No crusade weekends in this cohort&rsquo;s schedule.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      {canRecord && (
        <Dialog open={open} onOpenChange={setOpen}>
          {selected && (
            <CrusadeDrawer
              key={selected.afterClass}
              cohortId={cohortId}
              weekend={selected}
              report={reportsByAfterClass.get(selected.afterClass) ?? null}
              onDone={() => setOpen(false)}
            />
          )}
        </Dialog>
      )}
    </Card>
  );
}
