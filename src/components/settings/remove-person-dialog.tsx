"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, Prohibit, ArrowCounterClockwise, CaretDown, CaretRight, Trash } from "@phosphor-icons/react";
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
import {
  deactivatePerson,
  reactivatePerson,
  getPersonDeletionFootprint,
  deletePersonPermanently,
} from "@/lib/actions/people";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/lib/domain/types";
import type { PersonFootprintItem } from "@/lib/data/people";

/**
 * Everything that changes whether/how this person can use the app —
 * split out from `EditPersonDialog` (which only edits identity/scope: name,
 * role, cohorts) since those are a different kind of change than turning
 * access off or erasing the account. Two options, deliberately kept apart:
 * "Deactivate" (reversible, the everyday choice) and the Danger Zone's
 * permanent delete (irreversible, gated by a live pre-flight check — see
 * `getPersonFootprint`, src/lib/data/people.ts).
 */
export function RemovePersonDialog({ person, isSelf }: { person: AppUser; isSelf: boolean }) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dangerOpen, setDangerOpen] = useState(false);
  const [footprintLoading, setFootprintLoading] = useState(false);
  const [footprint, setFootprint] = useState<PersonFootprintItem[] | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isDeactivated = person.state === "deactivated";

  function reset() {
    setError(null);
    setDangerOpen(false);
    setFootprint(null);
    setConfirmEmail("");
    setDeleteError(null);
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

  async function toggleDangerZone() {
    const next = !dangerOpen;
    setDangerOpen(next);
    if (next && footprint === null) {
      setFootprintLoading(true);
      try {
        setFootprint(await getPersonDeletionFootprint(person.id));
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "Couldn't check this account's activity.");
      } finally {
        setFootprintLoading(false);
      }
    }
  }

  const canConfirmDelete = footprint?.length === 0 && confirmEmail.trim().toLowerCase() === person.email.toLowerCase();

  async function handleDelete() {
    if (!canConfirmDelete) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deletePersonPermanently(person.id);
      show(`${person.name}'s account was permanently deleted.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Couldn't delete this account.");
    } finally {
      setDeletePending(false);
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
        className="grid size-7 flex-none place-items-center rounded-[7px] text-ink-faint hover:bg-hover hover:text-accent-2-700"
        aria-label={`Deactivate or delete ${person.name}`}
      >
        <UserMinus size={14} />
      </DialogTrigger>
      <DialogPopup width={440}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Deactivate or delete {person.name}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            Turn their access off, or remove the account entirely.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          {isSelf ? (
            <div className="rounded-[10px] border border-border-soft bg-subtle p-3.5 text-[11px] text-ink-faint">
              You can&rsquo;t deactivate or delete your own account.
            </div>
          ) : (
            <>
              <div className="rounded-[10px] border border-border-soft bg-subtle p-3.5">
                <div className="text-xs font-semibold text-ink">
                  {isDeactivated ? "This person is deactivated" : "Deactivate access"}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-muted">
                  {isDeactivated
                    ? "They can't sign in until reactivated. Nothing they recorded before was affected."
                    : "Turning this off signs them out and blocks sign-in, without deleting anything they've recorded. Reversible any time."}
                </div>
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
              </div>

              <div className="rounded-[10px] border border-accent-2-200 p-3.5">
                <button type="button" onClick={toggleDangerZone} className="flex w-full items-center gap-2 text-left">
                  {dangerOpen ? (
                    <CaretDown size={13} weight="bold" className="flex-none text-accent-2-700" />
                  ) : (
                    <CaretRight size={13} weight="bold" className="flex-none text-accent-2-700" />
                  )}
                  <span className="text-xs font-semibold text-accent-2-700">Danger zone — delete permanently</span>
                </button>

                {dangerOpen && (
                  <div className="mt-3 flex flex-col gap-3">
                    {footprintLoading ? (
                      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                        <Spinner /> Checking what&rsquo;s still attached to this account…
                      </div>
                    ) : footprint && footprint.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        <div className="text-[11px] text-ink-secondary">
                          This account still has recorded activity — deleting it will fail until this clears,
                          usually by deleting the related cohort(s):
                        </div>
                        <ul className="flex flex-col gap-1 text-[11px] text-ink-muted">
                          {footprint.map((f) => (
                            <li key={f.label}>
                              <span className="font-semibold text-ink">{f.count}</span> {f.label.toLowerCase()}
                              {f.cohortNames.length > 0 && ` (${f.cohortNames.join(", ")})`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : footprint && footprint.length === 0 ? (
                      <>
                        <div className="text-[11px] text-ink-secondary">
                          No recorded activity found for this account — safe to delete permanently. This
                          can&rsquo;t be undone.
                        </div>
                        <div>
                          <Label htmlFor="delete-person-confirm">
                            Type <span className="font-semibold text-ink">{person.email}</span> to confirm
                          </Label>
                          <Input
                            id="delete-person-confirm"
                            value={confirmEmail}
                            onChange={(e) => setConfirmEmail(e.target.value)}
                            autoComplete="off"
                          />
                        </div>
                        {deleteError && <div className="text-[11px] font-medium text-accent-2-700">{deleteError}</div>}
                        <Button
                          type="button"
                          disabled={!canConfirmDelete || deletePending}
                          onClick={handleDelete}
                          className="bg-accent-2-500 hover:bg-accent-2-700 active:bg-accent-2-700 disabled:bg-page"
                        >
                          <Trash size={13} weight="bold" />
                          {deletePending ? "Deleting…" : "Delete permanently"}
                        </Button>
                      </>
                    ) : (
                      deleteError && <div className="text-[11px] font-medium text-accent-2-700">{deleteError}</div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {error && <div className="px-5 pb-1 text-xs font-medium text-accent-2-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Close</DialogClose>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
