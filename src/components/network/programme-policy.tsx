"use client";

import { useState, useTransition } from "react";
import { createPolicyVersion } from "@/lib/actions/policy";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { newVersionProblem, policyOn, type PolicyVersion } from "@/lib/domain/policy";
import { formatShortDate } from "@/lib/utils";

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-divider py-2 first:border-t-0">
      <span className="text-[13px] text-ink-secondary">{label}</span>
      <span className="text-[13px] font-bold tabular text-ink">{value}</span>
    </div>
  );
}

/**
 * The one programme policy for the whole network: attendance status bands,
 * the inactive rule and the graduation attendance threshold. Changing it
 * means adding a *new version from a date* — the version in force is never
 * edited, so earlier periods keep the rules they had. Administrators only.
 */
export function ProgrammePolicy({ versions, today, canEdit }: { versions: PolicyVersion[]; today: string; canEdit: boolean }) {
  const current = policyOn(versions, today);
  const upcoming = versions.filter((v) => v.effectiveFrom > today);
  const latest = versions[versions.length - 1];
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState({
    effectiveFrom: today > latest.effectiveFrom ? today : "",
    onTrack: latest.onTrack,
    needsHelp: latest.needsHelp,
    inactiveStreak: latest.inactiveStreak,
    graduationAttendance: latest.graduationAttendance,
    note: "",
  });
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.type === "number" ? e.target.valueAsNumber : e.target.value }));

  function save() {
    const problem = newVersionProblem(versions, draft, today);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      try {
        const { version } = await createPolicyVersion(draft);
        show(`Policy version ${version} saved — in force from ${formatShortDate(draft.effectiveFrom)}.`);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex-1">
          <CardTitle>Programme policy</CardTitle>
          <CardSubtitle>One policy for the whole network. Changes start from a date and never rewrite earlier periods.</CardSubtitle>
        </div>
        <Pill tone="cyan">Version {current.version}</Pill>
      </CardHeader>

      <div className="grid grid-cols-1 gap-4 px-[18px] py-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            In force since {formatShortDate(current.effectiveFrom)}
          </div>
          <Rule label="On track" value={`${current.onTrack}% and above`} />
          <Rule label="Needs help" value={`${current.needsHelp}–${current.onTrack - 1}%`} />
          <Rule label="At risk" value={`Below ${current.needsHelp}%`} />
          <Rule label="Inactive after" value={`${current.inactiveStreak} recorded absences in a row`} />
          <Rule label="Graduation attendance" value={`${current.graduationAttendance}% or more`} />
          <p className="mt-2 text-[11px] text-ink-muted">
            Graduated = every lesson delivered, attendance at or above this, and no open follow-up or catch-up.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {upcoming.map((v) => (
            <div key={v.version} className="rounded-[10px] border border-border bg-yellow-100 px-3 py-2.5 text-[12px] text-yellow-ink">
              <span className="font-semibold">Version {v.version} starts {formatShortDate(v.effectiveFrom)}</span> · On track ≥ {v.onTrack}% · Needs help ≥{" "}
              {v.needsHelp}% · Graduation ≥ {v.graduationAttendance}%
            </div>
          ))}
          {canEdit && !open && (
            <Button type="button" variant="secondary" className="self-start" onClick={() => setOpen(true)}>
              New policy version…
            </Button>
          )}
          {canEdit && open && (
            <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3.5">
              <div className="text-[13px] font-semibold text-ink">New version {latest.version + 1}</div>
              <p className="text-[12px] text-ink-muted">
                Applies from its start date. Version {current.version} stays as it is for everything before that.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="pv-from">Starts on</Label>
                  <Input id="pv-from" type="date" min={today} value={draft.effectiveFrom} onChange={set("effectiveFrom")} />
                </div>
                <div>
                  <Label htmlFor="pv-ontrack">On track ≥ %</Label>
                  <Input id="pv-ontrack" type="number" min={1} max={100} value={draft.onTrack} onChange={set("onTrack")} />
                </div>
                <div>
                  <Label htmlFor="pv-help">Needs help ≥ %</Label>
                  <Input id="pv-help" type="number" min={0} max={99} value={draft.needsHelp} onChange={set("needsHelp")} />
                </div>
                <div>
                  <Label htmlFor="pv-inactive">Inactive after</Label>
                  <Input id="pv-inactive" type="number" min={2} max={20} value={draft.inactiveStreak} onChange={set("inactiveStreak")} />
                </div>
                <div>
                  <Label htmlFor="pv-grad">Graduation ≥ %</Label>
                  <Input id="pv-grad" type="number" min={1} max={100} value={draft.graduationAttendance} onChange={set("graduationAttendance")} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="pv-note">Reason (optional)</Label>
                  <Input id="pv-note" value={draft.note} onChange={set("note")} placeholder="e.g. Leadership decision, March meeting" />
                </div>
              </div>
              {error && <div className="text-[12px] font-medium text-accent-2-700">{error}</div>}
              <div className="flex gap-2">
                <Button type="button" onClick={save} disabled={pending}>
                  {pending && <Spinner />}
                  Create version {latest.version + 1}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Table>
        <THead>
          <TH>Version</TH>
          <TH>In force</TH>
          <TH align="right">On track</TH>
          <TH align="right">Needs help</TH>
          <TH align="right">Inactive</TH>
          <TH align="right">Graduation</TH>
          <TH>Note</TH>
        </THead>
        <tbody>
          {[...versions].reverse().map((v, i, arr) => {
            const next = arr[i - 1];
            return (
              <TR key={v.version}>
                <TD className="text-[13px] font-semibold">
                  {v.version} {v.version === current.version && <Pill tone="cyan">Current</Pill>}
                </TD>
                <TD className="text-[12px] text-ink-secondary">
                  {formatShortDate(v.effectiveFrom)} – {next ? formatShortDate(next.effectiveFrom) : "now"}
                </TD>
                <TD align="right" className="tabular text-[13px]">{v.onTrack}%</TD>
                <TD align="right" className="tabular text-[13px]">{v.needsHelp}%</TD>
                <TD align="right" className="tabular text-[13px]">{v.inactiveStreak}</TD>
                <TD align="right" className="tabular text-[13px]">{v.graduationAttendance}%</TD>
                <TD className="text-[12px] text-ink-muted">
                  {v.note ?? "—"}
                  {v.createdBy && <span className="block text-[11px]">by {v.createdBy}</span>}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
