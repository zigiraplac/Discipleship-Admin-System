"use client";

import { useMemo, useRef, useState } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pill } from "@/components/ui/pill";
import { Spinner } from "@/components/ui/spinner";
import {
  parseMeetAttendanceCsv,
  meetingDurationMinutes,
  matchToRoster,
  attendanceFromMatches,
  type MeetParticipant,
  type RosterStudent,
} from "@/lib/domain/meet-attendance";
import { parseMeetAttendancePdf } from "@/lib/actions/meet-attendance";
import { cn } from "@/lib/utils";

/**
 * Pre-fills the register from a Google Meet attendance report — either
 * Google's own CSV export (parsed client-side, no network round trip) or
 * a PDF from a third-party report tool (parsed server-side, since the PDF
 * library needs Node — see `src/lib/actions/meet-attendance.ts`).
 * Deliberately does not save anything itself — "Apply" only sets the
 * caller's local attendance state, same as the "All present" shortcut it
 * sits next to, so the facilitator still reviews the now-prefilled tiles
 * and uses the normal Save button. Any student a name didn't match can
 * still be corrected there afterward, same as any manual entry.
 */
export function ImportMeetAttendanceDialog({
  roster,
  onApply,
  disabled,
}: {
  roster: RosterStudent[];
  onApply: (attendance: Record<string, "present" | "absent">) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MeetParticipant[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(70);
  const [meetingMinutes, setMeetingMinutes] = useState(0);
  const [manualAssign, setManualAssign] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFileName(null);
    setParticipants(null);
    setParsing(false);
    setParseError(null);
    setThreshold(70);
    setMeetingMinutes(0);
    setManualAssign({});
  }

  function onParsed(parsed: MeetParticipant[]) {
    if (parsed.length === 0) {
      setParseError("No participant rows found — check this is the actual attendance report, not a different file.");
      setParticipants(null);
      return;
    }
    setParticipants(parsed);
    setMeetingMinutes(Math.round(meetingDurationMinutes(parsed)));
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError(null);

    if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
      setParsing(true);
      const formData = new FormData();
      formData.set("file", file);
      parseMeetAttendancePdf(formData)
        .then(onParsed)
        .catch((e) => setParseError(e instanceof Error ? e.message : "Couldn't read that PDF."))
        .finally(() => setParsing(false));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        onParsed(parseMeetAttendanceCsv(String(reader.result ?? "")));
      } catch {
        setParseError("Couldn't read that file as CSV.");
        setParticipants(null);
      }
    };
    reader.onerror = () => setParseError("Couldn't read that file.");
    reader.readAsText(file);
  }

  const { matches, unmatchedParticipants } = useMemo(
    () => matchToRoster(participants ?? [], roster, meetingMinutes),
    [participants, roster, meetingMinutes]
  );

  // A manually-assigned participant overrides the automatic (name-key)
  // match for that one student — the only thing this dialog needs to let
  // a human do that the main register tiles can't: tell it "this Meet
  // name is actually this roster student."
  const effectiveMatches = useMemo(
    () =>
      matches.map((m) => {
        const assignedKey = manualAssign[m.studentId];
        if (m.matched || !assignedKey) return m;
        const p = participants?.find((p) => p.nameKey === assignedKey) ?? null;
        const pct = p ? (p.sourcePct ?? (meetingMinutes > 0 ? Math.round((p.durationMinutes / meetingMinutes) * 100) : null)) : null;
        return { ...m, matched: p, pct };
      }),
    [matches, manualAssign, participants, meetingMinutes]
  );

  const previewAttendance = useMemo(() => attendanceFromMatches(effectiveMatches, threshold), [effectiveMatches, threshold]);
  const presentCount = Object.values(previewAttendance).filter((v) => v === "present").length;
  // The PDF report already carries its own "Attended percentage" per
  // person — the meeting-length control only matters when a source
  // (Google's own CSV) doesn't, so it'd otherwise just be a confusing,
  // inert field.
  const needsMeetingMinutes = (participants ?? []).some((p) => p.sourcePct == null);

  function availableForRow(studentId: string): MeetParticipant[] {
    const assignedElsewhere = new Set(
      Object.entries(manualAssign)
        .filter(([id]) => id !== studentId)
        .map(([, key]) => key)
    );
    return unmatchedParticipants.filter((p) => !assignedElsewhere.has(p.nameKey));
  }

  function handleApply() {
    onApply(previewAttendance);
    setOpen(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        className={buttonVariants({ variant: "outlineAccent", size: "row" })}
        disabled={disabled}
      >
        Import from Google Meet
      </DialogTrigger>
      <DialogPopup width={620}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Import attendance from Google Meet</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            Upload the attendance report Google emails the meeting organizer — a CSV export, or a PDF from a
            report tool like Meet Attendance Tracker. This only pre-fills the tiles on the register screen,
            nothing saves until you do.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          {!participants ? (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={parsing}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed p-8 text-center",
                  "text-ink-muted hover:border-accent-300 hover:text-accent-700",
                  parsing && "cursor-default opacity-60"
                )}
                style={{ borderColor: "var(--color-dashed)" }}
              >
                {parsing ? <Spinner /> : <UploadSimple size={22} />}
                <span className="text-[13px] font-semibold">{parsing ? "Reading file…" : "Choose a CSV or PDF file"}</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv,.pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
              {parseError && (
                <div className="rounded-control border border-accent-2-200 bg-accent-2-100 px-3 py-2.5 text-[13px] text-accent-2-700">
                  {parseError}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 truncate text-xs text-ink-muted">{fileName}</div>
                {needsMeetingMinutes && (
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="meet-meeting-minutes" className="mb-0">
                      Meeting length
                    </Label>
                    <Input
                      id="meet-meeting-minutes"
                      type="number"
                      min={1}
                      value={meetingMinutes}
                      onChange={(e) => setMeetingMinutes(Math.max(1, e.target.valueAsNumber || 0))}
                      className="w-[70px]"
                    />
                    <span className="text-xs text-ink-faint">min</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="meet-threshold" className="mb-0">
                    Mark present at
                  </Label>
                  <Input
                    id="meet-threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={threshold}
                    onChange={(e) => setThreshold(Math.min(100, Math.max(0, e.target.valueAsNumber || 0)))}
                    className="w-[64px]"
                  />
                  <span className="text-xs text-ink-faint">% or more</span>
                </div>
              </div>

              <div className="max-h-[360px] overflow-y-auto rounded-control border border-border">
                <Table>
                  <THead>
                    <TH>Student</TH>
                    <TH>Matched Meet name</TH>
                    <TH align="right">%</TH>
                    <TH align="right">Mark</TH>
                  </THead>
                  <tbody>
                    {effectiveMatches.map((m) => (
                      <TR key={m.studentId}>
                        <TD className="text-[13px] font-semibold text-ink">{m.fullName}</TD>
                        <TD>
                          {m.matched ? (
                            <span className="text-[13px] text-ink-secondary">{m.matched.name}</span>
                          ) : (
                            <NativeSelect
                              value={manualAssign[m.studentId] ?? ""}
                              onChange={(e) =>
                                setManualAssign((prev) => ({ ...prev, [m.studentId]: e.target.value }))
                              }
                              className="w-full max-w-[220px]"
                            >
                              <option value="">No match — mark absent</option>
                              {availableForRow(m.studentId).map((p) => (
                                <option key={p.nameKey} value={p.nameKey}>
                                  {p.name}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        </TD>
                        <TD align="right" className="tabular text-[13px]">
                          {m.pct !== null ? `${m.pct}%` : "—"}
                        </TD>
                        <TD align="right">
                          <Pill tone={m.pct !== null && m.pct >= threshold ? "cyan" : "grey"}>
                            {m.pct !== null && m.pct >= threshold ? "Present" : "Absent"}
                          </Pill>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>

              {unmatchedParticipants.length > 0 && (
                <div className="text-[11px] text-ink-faint">
                  {unmatchedParticipants.length} name{unmatchedParticipants.length === 1 ? "" : "s"} in the
                  report didn&rsquo;t match anyone on the roster — assignable above, or just left out.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-divider px-5 py-4">
          <span className="text-xs text-ink-muted">
            {participants ? `${presentCount} of ${roster.length} would be marked present` : ""}
          </span>
          <div className="flex gap-2">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="button" variant="primary" disabled={!participants} onClick={handleApply}>
              Apply to register
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
