"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash, X } from "@phosphor-icons/react";
import { DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { DrawerPopup } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { saveCrusadeReport, clearCrusadeReport } from "@/lib/actions/crusades";
import { formatShortDate } from "@/lib/utils";
import { ACTIVITIES_MIGRATION_APPLIED } from "@/lib/domain/activities";
import type { CrusadeWeekend } from "@/components/reports/report-utils";
import type { CrusadeReport } from "@/lib/data/crusades";
import { PostponeCrusadeButton } from "./postpone-crusade-button";

type Status = CrusadeReport["status"];

/** Right-hand drawer for one crusade weekend: whether it happened, its
 * theme and preacher, and notes either way. Opens pre-filled when a
 * report exists (with Clear to remove it); blank otherwise. */
export function CrusadeDrawer({
  cohortId,
  weekend,
  report,
  onDone,
}: {
  cohortId: string;
  weekend: CrusadeWeekend;
  report: CrusadeReport | null;
  /** Called after a save, clear or postpone, to close the drawer. */
  onDone: () => void;
}) {
  const { afterClass, friday, saturday } = weekend;
  const [status, setStatus] = useState<Status>(report?.status ?? "done");
  const [theme, setTheme] = useState(report?.theme ?? "");
  const [preacher, setPreacher] = useState(report?.preacher ?? "");
  const [highlights, setHighlights] = useState(report?.highlights ?? "");
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [pending, setPending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await saveCrusadeReport({
        cohortId,
        afterClass,
        status,
        theme,
        preacher,
        notes,
        highlights,
      });
      show(status === "done" ? "Crusade marked done." : "Crusade marked not done.");
      onDone();
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
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <DrawerPopup>
      <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
        <div>
          <DialogTitle className="text-[15px] font-bold text-ink">Crusade after Class {afterClass}</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-ink-muted">
            {formatShortDate(friday)} – {formatShortDate(saturday)}
          </DialogDescription>
        </div>
        <DialogClose aria-label="Close" className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-hover">
          <X size={16} />
        </DialogClose>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* Before migration 0045, saving a report always means done. */}
        {ACTIVITIES_MIGRATION_APPLIED && (
          <div>
            <Label>Status</Label>
            <Segmented
              options={[
                { value: "done", label: "Done" },
                { value: "not_done", label: "Not done" },
              ]}
              value={status}
              onChange={setStatus}
              className="w-fit"
            />
          </div>
        )}
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
        {status === "done" && (
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
        )}
        <div>
          <Label htmlFor="crusade-notes">Notes</Label>
          <Textarea
            id="crusade-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={status === "done" ? "Anything worth remembering" : "Why it didn't happen"}
          />
        </div>

        {report?.status !== "done" && (
          <div className="rounded-control border border-divider p-3">
            <div className="text-xs font-semibold text-ink">Need to move it?</div>
            <p className="mt-0.5 mb-2.5 text-xs text-ink-muted">
              Postponing moves this weekend, and everything after it, one week later.
            </p>
            <PostponeCrusadeButton cohortId={cohortId} afterClass={afterClass} friday={friday} onPostponed={onDone} />
          </div>
        )}
      </div>

      {error && <div className="px-5 pb-2 text-xs font-medium text-accent-2-700">{error}</div>}

      <div className="flex items-center justify-between gap-2 border-t border-divider px-5 py-4">
        {report ? (
          <Button
            type="button"
            variant="ghost"
            disabled={clearing || pending}
            onClick={handleClear}
            className="text-accent-2-700"
          >
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
    </DrawerPopup>
  );
}
