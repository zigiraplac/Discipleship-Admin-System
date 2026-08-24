"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "@phosphor-icons/react";
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
import { invitePerson } from "@/lib/actions/people";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/domain/types";

const ROLES: Role[] = ["facilitator", "teacher", "leadership", "admin"];

export function AddPersonDialog({ cohorts }: { cohorts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("facilitator");
  const [cohortIds, setCohortIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendLink, setResendLink] = useState<string | null>(null);
  const { show } = useToast();
  const router = useRouter();

  const needsCohorts = role === "facilitator" || role === "teacher";

  function reset() {
    setName("");
    setEmail("");
    setRole("facilitator");
    setCohortIds(new Set());
    setError(null);
    setResendLink(null);
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
      const result = await invitePerson({ name, email, role, cohortIds: [...cohortIds] });
      if (result.resendLink) {
        // This email already had an account with no profile attached
        // (removed by hand, or an earlier invite that didn't finish) —
        // Supabase won't auto-email a second invite to an existing
        // account, so hand the admin the link to send themselves.
        setResendLink(result.resendLink);
      } else {
        show(`Invited ${name} — they'll get an email to set up their account.`);
        setOpen(false);
        reset();
      }
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
        className={cn(
          "flex items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-600"
        )}
      >
        <UserPlus size={15} />
        Add person
      </DialogTrigger>
      <DialogPopup width={440}>
        {resendLink ? (
          <>
            <div className="px-5 pt-5">
              <DialogTitle className="text-[15px] font-bold text-ink">This person already has an account</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-ink-muted">
                {name} was invited before and never finished setting up — Supabase won&rsquo;t send
                a second automatic email to an existing account, so send them this link yourself.
              </DialogDescription>
            </div>
            <div className="flex flex-col gap-2 px-5 py-4">
              <Input readOnly value={resendLink} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(resendLink);
                  show("Link copied.");
                }}
              >
                Copy link
              </Button>
            </div>
            <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 pt-5">
              <DialogTitle className="text-[15px] font-bold text-ink">Add a person</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-ink-muted">
                They&rsquo;ll get an email invite to set their own password.
              </DialogDescription>
            </div>

            <div className="flex flex-col gap-3.5 px-5 py-4">
              <div>
                <Label htmlFor="add-person-name">Name</Label>
                <Input id="add-person-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="add-person-email">Email</Label>
                <Input
                  id="add-person-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
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
              <Button type="button" variant="primary" disabled={!name.trim() || !email.trim() || pending} onClick={handleSave}>
                {pending ? "Inviting…" : "Send invite"}
              </Button>
            </div>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
