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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { addStudent } from "@/lib/actions/students";

const EMPTY = { fullName: "", email: "", whatsapp: "", country: "", city: "", dobDay: "", dobMonth: "" };

/** Admin-only trigger + form — the page decides whether to render this at
 * all (only for user.role === "admin"), this component doesn't re-check.
 * Covers the one gap the CSV import wizard leaves: a real student who
 * shows up after that import is already done. */
export function AddStudentDialog({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setForm(EMPTY);
      setError(null);
    }
  }

  function set<K extends keyof typeof EMPTY>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await addStudent({
        cohortId,
        fullName: form.fullName,
        email: form.email || null,
        whatsapp: form.whatsapp || null,
        country: form.country || null,
        city: form.city || null,
        dobDay: form.dobDay ? Number(form.dobDay) : null,
        dobMonth: form.dobMonth ? Number(form.dobMonth) : null,
      });
      show("Student added.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add this student.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={buttonVariants({ variant: "primary", size: "row" })}>
        <UserPlus size={13} />
        Add student
      </DialogTrigger>
      <DialogPopup width={420}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Add student</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            For someone who joins after the initial import — not a replacement for it.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <Label htmlFor="add-name">Full name</Label>
            <Input id="add-name" value={form.fullName} onChange={set("fullName")} />
          </div>
          <div>
            <Label htmlFor="add-email">Email</Label>
            <Input id="add-email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <Label htmlFor="add-whatsapp">WhatsApp</Label>
            <Input id="add-whatsapp" value={form.whatsapp} onChange={set("whatsapp")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="add-country">Country</Label>
              <Input id="add-country" value={form.country} onChange={set("country")} />
            </div>
            <div>
              <Label htmlFor="add-city">City</Label>
              <Input id="add-city" value={form.city} onChange={set("city")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="add-dob-day">Birthday day</Label>
              <Input
                id="add-dob-day"
                type="number"
                min={1}
                max={31}
                value={form.dobDay}
                onChange={set("dobDay")}
              />
            </div>
            <div>
              <Label htmlFor="add-dob-month">Birthday month</Label>
              <Input
                id="add-dob-month"
                type="number"
                min={1}
                max={12}
                value={form.dobMonth}
                onChange={set("dobMonth")}
              />
            </div>
          </div>
          {error && <div className="text-[12px] font-medium text-accent-2-700">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={pending} onClick={handleSave}>
            {pending && <Spinner />}
            {pending ? "Adding…" : "Add student"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
