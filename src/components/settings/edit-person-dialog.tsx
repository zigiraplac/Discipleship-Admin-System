"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple, Prohibit, ArrowCounterClockwise } from "@phosphor-icons/react";
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
import { updatePerson, deactivatePerson, reactivatePerson } from "@/lib/actions/people";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AppUser, Role } from "@/lib/domain/types";

const ROLES: Role[] = ["facilitator", "teacher", "leadership", "admin"];

/** Edit an existing person's name/role/cohort assignment, and
 * deactivate/reactivate their access — everything invitePerson sets up
 * front, editable after the fact. This is also how a cohort gets handed
 * from one facilitator to another: deactivate the old one, then add the
 * cohort to the new one's list here. */
export function EditPersonDialog({
  person,
  cohorts,
  currentCohortIds,
  isSelf,
}: {
  person: AppUser;
  cohorts: { id: string; name: string }[];
  currentCohortIds: string[];
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState<Role>(person.role);
  const [cohortIds, setCohortIds] = useState<Set<string>>(new Set(currentCohortIds));
  const [pending, setPending] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  const needsCohorts = role === "facilitator" || role === "teacher";
  const isDeactivated = person.state === "deactivated";

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

  async function handleToggleStatus() {
    setStatusPending(true);
    setError(null);
    try {
      if (isDeactivated) {
        await reactivatePerson(person.id);
        show(`${person.name} can sign in again.`);
      } else {
        await deactivatePerson(person.id);
        show(`${person.name}'s access has been turned off.`);
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setStatusPending(false);
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
            Change their role or which cohorts they can see, or turn their access off.
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

          <div className="rounded-[10px] border border-border-soft bg-subtle p-3.5">
            <div className="text-xs font-semibold text-ink">
              {isDeactivated ? "This person is deactivated" : "Access"}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              {isDeactivated
                ? "They can't sign in until reactivated. Nothing they recorded before was affected."
                : "Turning this off signs them out and blocks sign-in, without deleting anything they've recorded."}
            </div>
            {isSelf ? (
              <div className="mt-2.5 text-[11px] text-ink-faint">You can&rsquo;t deactivate your own account.</div>
            ) : (
              <Button
                type="button"
                variant={isDeactivated ? "secondary" : "outlineAccent"}
                size="sm"
                disabled={statusPending}
                onClick={handleToggleStatus}
                className={cn("mt-2.5", !isDeactivated && "border-accent-2-200 text-accent-2-700 hover:border-accent-2-700")}
              >
                {statusPending ? (
                  <Spinner />
                ) : isDeactivated ? (
                  <ArrowCounterClockwise size={13} weight="bold" />
                ) : (
                  <Prohibit size={13} weight="bold" />
                )}
                {statusPending ? "Working…" : isDeactivated ? "Reactivate" : "Deactivate access"}
              </Button>
            )}
          </div>
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
