"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple, Trash } from "@phosphor-icons/react";
import { Dialog, DialogPopup, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { deleteUnit, renameUnit } from "@/lib/actions/org";
import { cn } from "@/lib/utils";

interface ManagedChild {
  id: string;
  name: string;
  levelLabel: string;
}

/** A leader's rename / remove for one level directly inside theirs. Sits
 * above a card's overview hit area so it stays clickable. */
export function ChildManageActions(item: ManagedChild) {
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  return (
    <span className="relative z-10 flex flex-none items-center gap-0.5">
      <IconButton label={`Rename ${item.name}`} onClick={() => setRenaming(true)}>
        <PencilSimple size={14} />
      </IconButton>
      <IconButton label={`Remove ${item.name}`} onClick={() => setRemoving(true)} danger>
        <Trash size={14} />
      </IconButton>
      {renaming && <RenameDialog item={item} onClose={() => setRenaming(false)} />}
      {removing && <RemoveDialog item={item} onClose={() => setRemoving(false)} />}
    </span>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-control text-ink-faint",
        danger ? "hover:bg-accent-2-100 hover:text-accent-2-700" : "hover:bg-hover hover:text-ink-secondary"
      )}
    >
      {children}
    </button>
  );
}

function useRun(onDone: () => void) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(work: () => Promise<void>, message: string) {
    setPending(true);
    setError(null);
    try {
      await work();
      show(message);
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error };
}

function RenameDialog({ item, onClose }: { item: ManagedChild; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const { run, pending, error } = useRun(onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={400}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => renameUnit({ unitId: item.id, name }), `Renamed to ${name.trim()}.`);
          }}
        >
          <div className="px-5 pt-5">
            <DialogTitle className="text-[15px] font-bold text-ink">Rename {item.levelLabel.toLowerCase()}</DialogTitle>
          </div>
          <div className="flex flex-col gap-2 px-5 py-4">
            <Label htmlFor="rename-unit">Name</Label>
            <Input id="rename-unit" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Spinner />}
              Save
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function RemoveDialog({ item, onClose }: { item: ManagedChild; onClose: () => void }) {
  const [confirm, setConfirm] = useState("");
  const { run, pending, error } = useRun(onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={420}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => deleteUnit({ unitId: item.id, confirmName: confirm }), `${item.name} removed.`);
          }}
        >
          <div className="px-5 pt-5">
            <DialogTitle className="text-[15px] font-bold text-ink">Remove {item.name}?</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-ink-muted">
              Only an empty {item.levelLabel.toLowerCase()} can be removed. Type its name to confirm.
            </DialogDescription>
          </div>
          <div className="flex flex-col gap-2 px-5 py-4">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={item.name} aria-label="Type the name to confirm" autoFocus />
            {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || confirm.trim().toLowerCase() !== item.name.toLowerCase()} className="bg-accent-2-500 hover:bg-accent-2-700">
              {pending && <Spinner />}
              Remove
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
