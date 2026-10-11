"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash, X } from "@phosphor-icons/react";
import { DialogTitle, DialogClose } from "@/components/ui/dialog";
import { DrawerPopup } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { saveActivity, deleteActivity } from "@/lib/actions/activities";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_LABELS, normalizeActivityKind, type ActivityStatus } from "@/lib/domain/activities";
import type { Activity } from "@/lib/data/activities";

const NEW_KIND = "__new";

/** Right-hand drawer to add an activity, or edit one (`activity` set). */
export function ActivityDrawer({
  cohortId,
  activity,
  kinds,
  defaultKind,
  today,
  onSaved,
}: {
  cohortId: string;
  activity: Activity | null;
  /** Kinds to offer: built-in ones plus any this cohort already uses. */
  kinds: string[];
  /** Pre-selected kind when adding (the open tab). */
  defaultKind: string;
  today: string;
  /** Called after a save or delete with the saved kind, to close the drawer. */
  onSaved: (kind: string | null) => void;
}) {
  const [kind, setKind] = useState(activity?.kind ?? defaultKind);
  const [newKind, setNewKind] = useState("");
  const [date, setDate] = useState(activity?.date ?? today);
  const [theme, setTheme] = useState(activity?.theme ?? "");
  const [preacher, setPreacher] = useState(activity?.preacher ?? "");
  const [status, setStatus] = useState<ActivityStatus>(activity?.status ?? "planned");
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  const chosenKind = kind === NEW_KIND ? normalizeActivityKind(newKind) : kind;

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await saveActivity({ cohortId, id: activity?.id, kind: chosenKind, date, theme, preacher, status, notes });
      show(activity ? "Activity updated." : `${chosenKind} added.`);
      onSaved(chosenKind);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!activity) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteActivity({ cohortId, id: activity.id });
      show("Activity deleted.");
      onSaved(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DrawerPopup>
      <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
        <DialogTitle className="text-[15px] font-bold text-ink">
          {activity ? `Edit ${activity.kind.toLowerCase()}` : "Add activity"}
        </DialogTitle>
        <DialogClose aria-label="Close" className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-hover">
          <X size={16} />
        </DialogClose>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div>
          <Label htmlFor="activity-kind">Type</Label>
          <NativeSelect id="activity-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-full py-2.5 text-sm">
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            <option value={NEW_KIND}>New type…</option>
          </NativeSelect>
          {kind === NEW_KIND && (
            <Input
              id="activity-new-kind"
              aria-label="New activity type"
              className="mt-2"
              maxLength={40}
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              placeholder="e.g. Prayer night, Outing"
              autoFocus
            />
          )}
        </div>
        <div>
          <Label htmlFor="activity-date">Date</Label>
          <Input id="activity-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="activity-theme">Theme</Label>
          <Input id="activity-theme" value={theme} onChange={(e) => setTheme(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="activity-preacher">Preacher</Label>
          <Input id="activity-preacher" value={preacher} onChange={(e) => setPreacher(e.target.value)} />
        </div>
        <div>
          <Label>Status</Label>
          <Segmented
            options={ACTIVITY_STATUSES.map((s) => ({ value: s, label: ACTIVITY_STATUS_LABELS[s] }))}
            value={status}
            onChange={setStatus}
            className="w-fit"
          />
        </div>
        <div>
          <Label htmlFor="activity-notes">Comment</Label>
          <Textarea id="activity-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {error && <div className="px-5 pb-2 text-xs font-medium text-accent-2-700">{error}</div>}

      <div className="flex items-center justify-between gap-2 border-t border-divider px-5 py-4">
        {activity ? (
          <Button type="button" variant="ghost" disabled={deleting || pending} onClick={handleDelete} className="text-accent-2-700">
            {deleting ? <Spinner /> : <Trash size={13} weight="bold" />}
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={pending || deleting || !chosenKind || !date} onClick={handleSave}>
            {pending && <Spinner />}
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </DrawerPopup>
  );
}
