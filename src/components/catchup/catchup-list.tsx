"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { OutcomeModal } from "@/components/outcome/outcome-modal";
import { outcomeShortLabel, outcomeTone } from "@/components/outcome/outcome-copy";
import { MarkOnTrackButton } from "@/components/outcome/mark-on-track-button";
import type { AttendanceSince } from "@/lib/domain/metrics";
import type { Bands, Outcome, StudentAggregate } from "@/lib/domain/types";

export interface CatchupEntry {
  student: StudentAggregate;
  outcome: Outcome;
  sinceProgress: AttendanceSince | null;
}

/** The same roster as the card grid, one glance-able row per student
 * instead — for comparing everyone on a catch-up plan at once rather than
 * scanning card by card. */
export function CatchupList({
  entries,
  cohortId,
  cohortSlug,
  bands,
  canRecord,
}: {
  entries: CatchupEntry[];
  cohortId: string;
  cohortSlug: string;
  bands: Bands;
  canRecord: boolean;
}) {
  return (
    <Table>
      <THead>
        <TH>Student</TH>
        <TH>Status</TH>
        <TH>Missed</TH>
        <TH>Since decision</TH>
        <TH align="right" />
      </THead>
      <tbody>
        {entries.map(({ student, outcome, sinceProgress }) => {
          const readyToUpdate = student.missed === 0;
          return (
            <TR key={student.id}>
              <TD>
                <Link
                  href={`/c/${cohortSlug}/students/${student.id}`}
                  className="flex items-center gap-2.5 hover:underline"
                >
                  <Avatar name={student.fullName} />
                  <span className="text-[13px] font-semibold text-ink">{student.fullName}</span>
                </Link>
              </TD>
              <TD>
                {readyToUpdate ? (
                  <Pill tone="yellow">Ready to update</Pill>
                ) : (
                  <Pill tone={outcomeTone(outcome.kind)}>{outcomeShortLabel(outcome.kind)}</Pill>
                )}
              </TD>
              <TD className="tabular">{student.missed}</TD>
              <TD>
                {sinceProgress?.rate == null ? (
                  <span className="text-xs text-ink-faint">Nothing recorded yet</span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    <ProgressBar
                      pct={sinceProgress.rate}
                      tone={toneForRate(sinceProgress.rate, bands.activeThreshold, bands.helpThreshold)}
                      className="w-[60px]"
                    />
                    <span className="text-[12px] font-semibold tabular">{sinceProgress.rate}%</span>
                  </span>
                )}
              </TD>
              <TD align="right">
                <span className="flex items-center justify-end gap-2">
                  {readyToUpdate && canRecord && (
                    <MarkOnTrackButton studentId={student.id} cohortId={cohortId} studentName={student.fullName} size="row" />
                  )}
                  {canRecord ? (
                    <OutcomeModal
                      studentId={student.id}
                      cohortId={cohortId}
                      studentName={student.fullName}
                      missedCount={student.missed}
                      currentOutcome={outcome.kind}
                      triggerClassName={buttonVariants({ variant: "secondary", size: "row" })}
                    >
                      Change
                    </OutcomeModal>
                  ) : (
                    <Link
                      href={`/c/${cohortSlug}/students/${student.id}`}
                      className={buttonVariants({ variant: "secondary", size: "row" })}
                    >
                      Open
                    </Link>
                  )}
                </span>
              </TD>
            </TR>
          );
        })}
        {entries.length === 0 && (
          <TR>
            <TD colSpan={5} className="py-6 text-center text-ink-faint">
              Nobody in this group.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}
