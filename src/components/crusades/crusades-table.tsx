"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pill } from "@/components/ui/pill";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/utils";
import { postponeCrusadeWeekend } from "@/lib/actions/crusades";
import { crusadeWeekends } from "@/components/reports/report-utils";
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
                  <span className="flex items-center justify-end gap-2">
                    {canRecord ? (
                      <>
                        {/* Offered any time a weekend hasn't been marked
                            done yet — whether that's because it's still
                            upcoming (plans changed ahead of time) or it's
                            overdue with nothing recorded — never once a
                            report exists (see postponeCrusadeWeekend). */}
                        {!report && (
                          <PostponeCrusadeButton cohortId={cohortId} afterClass={w.afterClass} friday={w.friday} />
                        )}
                        <CrusadeReportDialog
                          cohortId={cohortId}
                          afterClass={w.afterClass}
                          friday={w.friday}
                          saturday={w.saturday}
                          report={report}
                        />
                      </>
                    ) : (
                      <Pill tone={report ? "green" : upcoming ? "grey" : "magenta"}>
                        {report ? "Done" : upcoming ? "Upcoming" : "Not done"}
                      </Pill>
                    )}
                  </span>
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

/**
 * "We didn't get to this after all" — same idea as a lesson's postpone
 * button (src/components/lessons/lessons-browser.tsx), applied to a whole
 * crusade weekend: it shifts to the following weekend, and every lesson
 * and crusade day after it that hasn't happened yet shifts with it. Only
 * offered for a weekend that hasn't been reported yet (see crusades.ts —
 * a reported weekend already happened, so there's nothing to postpone).
 */
function PostponeCrusadeButton({
  cohortId,
  afterClass,
  friday,
}: {
  cohortId: string;
  afterClass: number;
  friday: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await postponeCrusadeWeekend({ cohortId, afterClass, reason: reason.trim() || undefined });
      setOpen(false);
      show(
        result.shiftedCount > 1
          ? `Crusade weekend postponed — ${result.shiftedCount} lessons and crusade days shifted forward.`
          : "Crusade weekend postponed to the following weekend."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't postpone this weekend. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <DialogTrigger className={buttonVariants({ variant: "secondary", size: "row" })}>
        <CalendarX size={13} />
        Postpone
      </DialogTrigger>
      <DialogPopup width={400}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">
            Postpone the Class {afterClass} weekend?
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            Moves it (and everything after it that hasn&rsquo;t happened yet) to the weekend
            after {formatShortDate(friday)}.
          </DialogDescription>
        </div>
        <div className="px-5 pt-3">
          <Label htmlFor="crusade-postpone-reason">Reason (optional)</Label>
          <Textarea
            id="crusade-postpone-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Venue fell through, clashing with another event…"
          />
          <p className="mt-1 text-[11px] text-ink-faint">Shown on Reports&rsquo; What changed timeline.</p>
        </div>
        {error && <div className="px-5 pb-1 pt-3 text-xs font-medium text-accent-2-700">{error}</div>}
        <div className="mt-3 flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={pending} onClick={handleConfirm}>
            {pending && <Spinner />}
            {pending ? "Postponing…" : "Postpone"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
