"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple } from "@phosphor-icons/react";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { updatePerson } from "@/lib/actions/people";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AppUser, Role } from "@/lib/domain/types";

const ROLES: Role[] = ["facilitator", "teacher", "leadership", "admin"];

/** Edit an existing person's name/role/cohort assignment — everything
 * invitePerson sets up front, editable after the fact. This is also how a
 * cohort gets handed from one facilitator to another: deactivate the old
 * one (via `RemovePersonDialog`), then add the cohort to the new one's
 * list here. Turning access off or deleting the account entirely lives in
 * that separate dialog, not this one — different enough consequences to
 * not share a single "Edit" action. */
export function EditPersonDialog({
  person,
  cohorts,
  currentCohortIds,
}: {
  person: AppUser;
  cohorts: { id: string; name: string }[];
  currentCohortIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState<Role>(person.role);
  const [cohortIds, setCohortIds] = useState<Set<string>>(new Set(currentCohortIds));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  const needsCohorts = role === "facilitator" || role === "teacher";

  function reset() {
    setName(person.name);
    setRole(person.role);
    setCohortIds(new Set(currentCohortIds));
    setError(null);
  }

  function toggleCohort(id: string) {
    setCohortIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await updatePerson({ id: person.id, name, role, cohortIds: [...cohortIds] });
      show(`Saved changes to ${name}.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
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
      <DialogTrigger
        className="grid size-7 flex-none place-items-center rounded-[7px] text-ink-faint hover:bg-hover hover:text-ink-secondary"
        aria-label={`Edit ${person.name}`}
      >
        <PencilSimple size={14} />
      </DialogTrigger>
      <DialogPopup width={440}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Edit person</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            Change their role or which cohorts they can see.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div>
            <Label htmlFor="edit-person-name">Name</Label>
            <Input id="edit-person-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Role</Label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "rounded-control border px-3 py-1.5 text-xs font-semibold",
                    role === r ? "border-accent bg-accent-100 text-accent-800" : "border-border bg-card text-ink-secondary hover:bg-hover"
                  )}
                >
                  {roleLabel(r)}
                </button>
              ))}
            </div>
          </div>

          {needsCohorts && (
            <div>
              <Label>Cohorts</Label>
              {cohorts.length === 0 ? (
                <div className="text-xs text-ink-muted">No cohorts exist yet — create one first.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {cohorts.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={cohortIds.has(c.id)}
                        onChange={() => toggleCohort(c.id)}
                        className="size-4 accent-accent"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="px-5 pb-1 text-xs font-medium text-accent-2-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={!name.trim() || pending} onClick={handleSave}>
            {pending && <Spinner />}
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
