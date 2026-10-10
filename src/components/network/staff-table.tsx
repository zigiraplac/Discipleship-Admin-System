"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash, UserPlus } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogPopup, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { inviteStaff, reassignStaff, removeUnitMember, setUnitMember, updateStaffName } from "@/lib/actions/org";
import type { OrgRole } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export interface StaffRow {
  userId: string;
  name: string;
  email: string;
  state: "active" | "invited" | "deactivated";
  unitId: string;
  unitName: string;
  levelLabel: string;
  /** Where the box sits below this level, e.g. "Kigali City › Kigali Central Church". */
  path: string;
  role: OrgRole;
}

export interface BoxOption {
  id: string;
  label: string;
  levelLabel: string;
}

/** A person in a place: avatar and name; viewers and pending invites are
 * marked. Tapping it opens edit (rename, move, change role, remove). */
function PersonChip({ r, onClick }: { r: StaffRow; onClick?: () => void }) {
  const body = (
    <>
      <Avatar name={r.name} size="sm" />
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-semibold leading-tight text-ink">{r.name}</span>
        <span className="block text-[11px] leading-tight text-ink-muted">
          {r.state === "invited" ? "Invited" : r.state === "deactivated" ? "Deactivated" : r.role === "leader" ? "Leader" : "Viewer"}
        </span>
      </span>
    </>
  );
  const cls = cn(
    "flex max-w-[220px] items-center gap-2 rounded-pill border border-border bg-card py-1 pl-1 pr-3",
    r.state === "deactivated" && "opacity-60"
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "hover:border-accent-300 hover:bg-hover")} title={`${r.email} · edit`}>
      {body}
    </button>
  ) : (
    <span className={cls} title={r.email}>
      {body}
    </span>
  );
}

/**
 * The levels this one staffs, grouped by kind (countries, regions, …),
 * each with the people appointed to it. A place with nobody shows that
 * plainly, with "Appoint" — gaps are what a leader needs to see.
 */
export function StaffTable({
  rows,
  boxes,
  people,
  canManage,
}: {
  rows: StaffRow[];
  boxes: BoxOption[];
  /** Existing active people who can be appointed. */
  people: { id: string; name: string; email: string }[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [removing, setRemoving] = useState<StaffRow | null>(null);
  const [adding, setAdding] = useState<{ box: string } | null>(null);

  const byLevel = useMemo(() => {
    const groups = new Map<string, { box: BoxOption; people: StaffRow[] }[]>();
    for (const box of boxes) {
      const list = groups.get(box.levelLabel) ?? [];
      list.push({ box, people: rows.filter((r) => r.unitId === box.id) });
      groups.set(box.levelLabel, list);
    }
    return [...groups];
  }, [rows, boxes]);
  const empty = boxes.filter((b) => !rows.some((r) => r.unitId === b.id)).length;
  const peopleCount = new Set(rows.map((r) => r.userId)).size;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-ink">Level staff</h2>
          <p className="text-[12px] text-ink-muted">
            {peopleCount} {peopleCount === 1 ? "person" : "people"} · {boxes.length} {boxes.length === 1 ? "place" : "places"}
            {empty ? <span className="text-yellow-ink"> · {empty} without anyone</span> : null}
          </p>
        </div>
        {canManage && (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setAdding({ box: "" })} disabled={!boxes.length}>
            <UserPlus size={15} />
            Add staff
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {byLevel.map(([level, places], gi) => (
          <div key={level} className={cn(gi && "border-t border-divider")}>
            <div className="bg-subtle px-[18px] py-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{level}</div>
            {places.map(({ box, people: here }) => (
              <div key={box.id} className="flex flex-col gap-2.5 border-t border-divider px-[18px] py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 sm:w-56 sm:flex-none">
                  <div className="truncate text-[13px] font-semibold text-ink">{box.label.split(" › ").at(-1)}</div>
                  {box.label.includes(" › ") && <div className="truncate text-[11px] text-ink-muted">{box.label.split(" › ").slice(0, -1).join(" › ")}</div>}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {here.map((r) => (
                    <PersonChip key={r.userId} r={r} onClick={canManage ? () => setEditing(r) : undefined} />
                  ))}
                  {!here.length && <span className="text-[12px] text-ink-muted">No one appointed</span>}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setAdding({ box: box.id })}
                      aria-label={`Appoint someone to ${box.label}`}
                      className="grid size-8 place-items-center rounded-full border border-dashed border-[var(--color-dashed)] text-ink-tertiary hover:border-accent hover:text-accent-700"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </Card>

      {editing && (
        <EditStaffDialog
          row={editing}
          boxes={boxes}
          onClose={() => setEditing(null)}
          onRemove={() => {
            setRemoving(editing);
            setEditing(null);
          }}
        />
      )}
      {removing && <RemoveStaffDialog row={removing} onClose={() => setRemoving(null)} />}
      {adding && <AddStaffDialog boxes={boxes} people={people} initialBox={adding.box} onClose={() => setAdding(null)} />}
    </section>
  );
}

function useRun(onDone: () => void) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** `work` returns true to keep the dialog open (e.g. to show a link). */
  async function run(work: () => Promise<boolean | void>, message: string) {
    setPending(true);
    setError(null);
    try {
      const keepOpen = await work();
      show(message);
      if (!keepOpen) onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error };
}

function BoxSelect({ id, boxes, value, onChange }: { id: string; boxes: BoxOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {boxes.map((b) => (
        <option key={b.id} value={b.id}>
          {b.label} ({b.levelLabel})
        </option>
      ))}
    </NativeSelect>
  );
}

function RoleSelect({ value, onChange }: { value: OrgRole; onChange: (v: OrgRole) => void }) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value as OrgRole)} aria-label="Role">
      <option value="leader">Leader — sees and manages</option>
      <option value="viewer">Viewer — sees only</option>
    </NativeSelect>
  );
}

function EditStaffDialog({ row, boxes, onClose, onRemove }: { row: StaffRow; boxes: BoxOption[]; onClose: () => void; onRemove: () => void }) {
  const [name, setName] = useState(row.name);
  const [box, setBox] = useState(row.unitId);
  const [role, setRole] = useState<OrgRole>(row.role);
  const { run, pending, error } = useRun(onClose);
  const changedName = name.trim() !== row.name;
  const changedPlace = box !== row.unitId || role !== row.role;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={440}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (changedName) await updateStaffName({ userId: row.userId, name });
              if (changedPlace) await reassignStaff({ userId: row.userId, fromUnitId: row.unitId, toUnitId: box, role });
            }, `${name.trim()} updated.`);
          }}
        >
          <div className="px-5 pt-5">
            <DialogTitle className="text-[15px] font-bold text-ink">Edit {row.name}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-ink-muted">{row.email}</DialogDescription>
          </div>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div>
              <Label htmlFor="staff-name">Name</Label>
              <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="staff-box">Leads</Label>
              <BoxSelect id="staff-box" boxes={boxes} value={box} onChange={setBox} />
            </div>
            <RoleSelect value={role} onChange={setRole} />
            {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-divider px-5 py-4">
            <button type="button" onClick={onRemove} className="mr-auto flex items-center gap-1.5 text-xs font-semibold text-accent-2-700 hover:underline">
              <Trash size={14} />
              Remove from {row.unitName}
            </button>
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || !box || !name.trim() || (!changedName && !changedPlace)}>
              {pending && <Spinner />}
              Save
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function RemoveStaffDialog({ row, onClose }: { row: StaffRow; onClose: () => void }) {
  const { run, pending, error } = useRun(onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={400}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Remove {row.name} from {row.unitName}?</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">Their account stays; they just stop seeing this level.</DialogDescription>
        </div>
        {error && <div className="px-5 pt-3 text-xs font-medium text-accent-2-700">{error}</div>}
        <div className="mt-4 flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button
            type="button"
            disabled={pending}
            className="bg-accent-2-500 hover:bg-accent-2-700"
            onClick={() => void run(() => removeUnitMember({ unitId: row.unitId, userId: row.userId }), `${row.name} removed from ${row.unitName}.`)}
          >
            {pending && <Spinner />}
            Remove
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function AddStaffDialog({ boxes, people, initialBox = "", onClose }: { boxes: BoxOption[]; people: { id: string; name: string; email: string }[]; initialBox?: string; onClose: () => void }) {
  const [mode, setMode] = useState<"existing" | "invite">("existing");
  const [personId, setPersonId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [box, setBox] = useState(initialBox);
  const [role, setRole] = useState<OrgRole>("leader");
  const [link, setLink] = useState<string | null>(null);
  const { run, pending, error } = useRun(onClose);

  const ready = box && (mode === "existing" ? personId : name.trim() && email.includes("@"));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup width={460}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (mode === "existing") {
                await setUnitMember({ unitId: box, userId: personId, role });
              } else {
                const res = await inviteStaff({ name, email, unitId: box, role });
                if (res.resendLink) {
                  setLink(res.resendLink);
                  return true;
                }
              }
            }, mode === "existing" ? "Staff added." : `Invite sent to ${email.trim()}.`);
          }}
        >
          <div className="px-5 pt-5">
            <DialogTitle className="text-[15px] font-bold text-ink">Add staff</DialogTitle>
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
            {mode === "existing" ? (
              <div>
                <Label htmlFor="add-staff-person">Person</Label>
                <NativeSelect id="add-staff-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  <option value="">Choose…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.email}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="add-staff-name">Name</Label>
                  <Input id="add-staff-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="add-staff-email">Email</Label>
                  <Input id="add-staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="add-staff-box">Leads</Label>
              <BoxSelect id="add-staff-box" boxes={boxes} value={box} onChange={setBox} />
            </div>
            <RoleSelect value={role} onChange={setRole} />
            {link && (
              <div className="flex flex-col gap-1.5 rounded-control border border-border bg-subtle p-3">
                <span className="text-xs text-ink-secondary">This email already had an account. Send them this link yourself:</span>
                <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
              </div>
            )}
            {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
            <DialogClose render={<Button type="button" variant="secondary" />}>{link ? "Done" : "Cancel"}</DialogClose>
            {!link && (
              <Button type="submit" disabled={pending || !ready}>
                {pending && <Spinner />}
                {mode === "existing" ? "Add" : "Send invite"}
              </Button>
            )}
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
