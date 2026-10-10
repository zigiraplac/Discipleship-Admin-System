"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { assignCohortStaff, inviteCohortStaff, removeCohortStaff } from "@/lib/actions/cohort-staff";
import type { CohortStaffMember } from "@/lib/data/org";
import { cn } from "@/lib/utils";

export interface CohortStaffGroup {
  id: string;
  name: string;
  /** Where it sits below this level, e.g. "Promotion 2026". */
  where: string;
  /** Set when this level manages it as a fallback: why. */
  managedBecause: string | null;
  staff: CohortStaffMember[];
}

type Capacity = "facilitator" | "teacher";

/**
 * The facilitators and teachers of the cohorts this level is responsible
 * for staffing (promotion → church → nearest staffed level), one row per
 * cohort. Tap a person to remove them, "+" to assign or invite — each
 * change is recorded.
 */
export function CohortStaffManager({ groups, people, canManage }: { groups: CohortStaffGroup[]; people: { id: string; name: string; email: string }[]; canManage: boolean }) {
  const [adding, setAdding] = useState<CohortStaffGroup | null>(null);
  const [removing, setRemoving] = useState<{ group: CohortStaffGroup; member: CohortStaffMember } | null>(null);
  if (!groups.length) return null;
  return (
    <>
      <Card className="overflow-hidden">
        {groups.map((g, i) => (
          <div key={g.id} className={cn("flex flex-col gap-2.5 px-[18px] py-3 sm:flex-row sm:items-center sm:gap-4", i && "border-t border-divider")}>
            <div className="min-w-0 sm:w-56 sm:flex-none">
              <div className="truncate text-[13px] font-semibold text-ink">{g.name}</div>
              <div className="truncate text-[11px] text-ink-muted" title={g.managedBecause ?? undefined}>
                {g.where}
                {g.managedBecause ? " · managed here" : ""}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {g.staff.map((s) => {
                const body = (
                  <>
                    <Avatar name={s.name} size="sm" />
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[13px] font-semibold leading-tight text-ink">{s.name}</span>
                      <span className={cn("block text-[11px] leading-tight", s.capacity === "facilitator" ? "text-accent-700" : "text-violet-700")}>
                        {s.capacity === "facilitator" ? "Facilitator" : "Teacher"}
                        {s.state === "invited" ? <span className="text-ink-muted"> · invited</span> : null}
                      </span>
                    </span>
                  </>
                );
                const cls = "flex max-w-[220px] items-center gap-2 rounded-pill border border-border bg-card py-1 pl-1 pr-3";
                return canManage ? (
                  <button
                    key={`${s.userId}-${s.capacity}`}
                    type="button"
                    onClick={() => setRemoving({ group: g, member: s })}
                    className={cn(cls, "hover:border-accent-300 hover:bg-hover")}
                    title={s.email}
                  >
                    {body}
                  </button>
                ) : (
                  <a key={`${s.userId}-${s.capacity}`} href={`mailto:${s.email}`} className={cls} title={s.email}>
                    {body}
                  </a>
                );
              })}
              {!g.staff.length && <span className="text-[12px] text-ink-muted">No facilitator or teacher yet</span>}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setAdding(g)}
                  aria-label={`Add staff to ${g.name}`}
                  className="grid size-8 place-items-center rounded-full border border-dashed border-[var(--color-dashed)] text-ink-tertiary hover:border-accent hover:text-accent-700"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>
      {adding && <AssignDialog group={adding} people={people} onClose={() => setAdding(null)} />}
      {removing && <RemoveDialog {...removing} onClose={() => setRemoving(null)} />}
    </>
  );
}

function useRun(onDone: () => void) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<unknown>, done: string) => {
    setError(null);
    start(async () => {
      try {
        const result = await work();
        const link = (result as { resendLink?: string } | undefined)?.resendLink;
        show(link ? `${done} Their invite link: ${link}` : done);
        onDone();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      }
    });
  };
  return { run, pending, error };
}

function AssignDialog({ group, people, onClose }: { group: CohortStaffGroup; people: { id: string; name: string; email: string }[]; onClose: () => void }) {
  const [mode, setMode] = useState<"existing" | "invite">("existing");
  const [capacity, setCapacity] = useState<Capacity>("facilitator");
  const [personId, setPersonId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const { run, pending, error } = useRun(onClose);
  const assigned = new Set(group.staff.map((s) => `${s.userId}:${s.capacity}`));
  const choices = people.filter((p) => !assigned.has(`${p.id}:${capacity}`));
  const ready = mode === "existing" ? !!personId : !!name.trim() && email.includes("@");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={440}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                mode === "existing"
                  ? assignCohortStaff({ cohortId: group.id, userId: personId, capacity })
                  : inviteCohortStaff({ cohortId: group.id, name, email, capacity }),
              mode === "existing" ? `Assigned to ${group.name}.` : `Invitation sent to ${email}.`
            );
          }}
        >
          <div className="px-5 pt-5">
            <DialogTitle className="text-[15px] font-bold text-ink">Add staff to {group.name}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-ink-muted">{group.managedBecause ? `${group.where} · ${group.managedBecause}` : group.where}</DialogDescription>
          </div>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <Segmented
              options={[
                { value: "existing", label: "Existing person" },
                { value: "invite", label: "Invite new" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as "existing" | "invite")}
              className="w-fit"
            />
            <div>
              <Label htmlFor="cohort-staff-role">Role</Label>
              <NativeSelect id="cohort-staff-role" value={capacity} onChange={(e) => setCapacity(e.target.value as Capacity)}>
                <option value="facilitator">Facilitator</option>
                <option value="teacher">Teacher</option>
              </NativeSelect>
            </div>
            {mode === "existing" ? (
              <div>
                <Label htmlFor="cohort-staff-person">Person</Label>
                <NativeSelect id="cohort-staff-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  <option value="">Choose…</option>
                  {choices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.email}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="cohort-staff-name">Name</Label>
                  <Input id="cohort-staff-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="cohort-staff-email">Email</Label>
                  <Input id="cohort-staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </>
            )}
            {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || !ready}>
              {pending && <Spinner />}
              {mode === "existing" ? "Assign" : "Send invite"}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function RemoveDialog({ group, member, onClose }: { group: CohortStaffGroup; member: CohortStaffMember; onClose: () => void }) {
  const { run, pending, error } = useRun(onClose);
  const role = member.capacity === "facilitator" ? "facilitator" : "teacher";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={400}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">{member.name}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            {role[0].toUpperCase() + role.slice(1)} of {group.name} ·{" "}
            <a href={`mailto:${member.email}`} className="text-accent-700 hover:underline">
              {member.email}
            </a>
          </DialogDescription>
        </div>
        {error && <div className="px-5 pt-3 text-xs font-medium text-accent-2-700">{error}</div>}
        <div className="mt-4 flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Close</DialogClose>
          <Button
            type="button"
            disabled={pending}
            className="bg-accent-2-500 hover:bg-accent-2-700"
            onClick={() => run(() => removeCohortStaff({ cohortId: group.id, userId: member.userId, capacity: member.capacity }), `${member.name} removed from ${group.name}.`)}
          >
            {pending && <Spinner />}
            Remove as {role}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
