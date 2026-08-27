"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotePencil, Trash } from "@phosphor-icons/react";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { saveCrusadeReport, clearCrusadeReport } from "@/lib/actions/crusades";
import { formatShortDate } from "@/lib/utils";
import type { CrusadeReport } from "@/lib/data/crusades";

/**
 * Recording a report *is* how a weekend gets marked as having happened —
 * there's no separate boolean. Opens pre-filled when a report already
 * exists (editable, plus a Clear option); opens blank otherwise.
 */
export function CrusadeReportDialog({
  cohortId,
  afterClass,
  friday,
  saturday,
  report,
}: {
  cohortId: string;
  afterClass: number;
  friday: string;
  saturday: string;
  report: CrusadeReport | null;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(report?.theme ?? "");
  const [preacher, setPreacher] = useState(report?.preacher ?? "");
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [highlights, setHighlights] = useState(report?.highlights ?? "");
  const [pending, setPending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  function reset() {
    setTheme(report?.theme ?? "");
    setPreacher(report?.preacher ?? "");
    setNotes(report?.notes ?? "");
    setHighlights(report?.highlights ?? "");
    setError(null);
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await saveCrusadeReport({ cohortId, afterClass, theme, preacher, notes, highlights });
      show(report ? "Report updated." : "Marked as done.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      await clearCrusadeReport({ cohortId, afterClass });
      show("Report cleared.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" variant={report ? "secondary" : "outlineAccent"} size="row" />}>
        <NotePencil size={13} weight="bold" />
        {report ? "Edit report" : "Mark done"}
      </DialogTrigger>
      <DialogPopup width={460}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">
            Crusade weekend after Class {afterClass}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            {formatShortDate(friday)} – {formatShortDate(saturday)}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div>
            <Label htmlFor="crusade-theme">Theme</Label>
            <Input
              id="crusade-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. Restoration and new beginnings"
            />
          </div>
          <div>
            <Label htmlFor="crusade-preacher">Preacher</Label>
            <Input id="crusade-preacher" value={preacher} onChange={(e) => setPreacher(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="crusade-highlights">Highlights</Label>
            <Textarea
              id="crusade-highlights"
              rows={2}
              value={highlights}
              onChange={(e) => setHighlights(e.target.value)}
              placeholder="Standout moments — testimonies, decisions, turnout"
            />
          </div>
          <div>
            <Label htmlFor="crusade-notes">Notes</Label>
            <Textarea id="crusade-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {error && <div className="px-5 pb-1 text-xs font-medium text-accent-2-700">{error}</div>}

        <div className="flex items-center justify-between gap-2 border-t border-divider px-5 py-4">
          {report ? (
            <Button type="button" variant="ghost" disabled={clearing || pending} onClick={handleClear} className="text-accent-2-700">
              {clearing ? <Spinner /> : <Trash size={13} weight="bold" />}
              Clear
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="button" variant="primary" disabled={pending || clearing} onClick={handleSave}>
              {pending && <Spinner />}
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
