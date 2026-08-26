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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { updateStudent } from "@/lib/actions/students";
import type { Student } from "@/lib/domain/types";

/** Admin-only trigger + form — the page decides whether to render this at
 * all (only for user.role === "admin"), this component doesn't re-check. */
export function EditStudentDialog({ cohortId, student }: { cohortId: string; student: Student }) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(student.fullName);
  const [email, setEmail] = useState(student.email ?? "");
  const [whatsapp, setWhatsapp] = useState(student.whatsapp ?? "");
  const [country, setCountry] = useState(student.country ?? "");
  const [dobDay, setDobDay] = useState(student.dobDay?.toString() ?? "");
  const [dobMonth, setDobMonth] = useState(student.dobMonth?.toString() ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFullName(student.fullName);
      setEmail(student.email ?? "");
      setWhatsapp(student.whatsapp ?? "");
      setCountry(student.country ?? "");
      setDobDay(student.dobDay?.toString() ?? "");
      setDobMonth(student.dobMonth?.toString() ?? "");
      setError(null);
    }
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await updateStudent({
        studentId: student.id,
        cohortId,
        fullName,
        email: email || null,
        whatsapp: whatsapp || null,
        country: country || null,
        dobDay: dobDay ? Number(dobDay) : null,
        dobMonth: dobMonth ? Number(dobMonth) : null,
      });
      show("Student details updated.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save these changes.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={buttonVariants({ variant: "secondary", size: "row" })}>
        <PencilSimple size={13} />
        Edit
      </DialogTrigger>
      <DialogPopup width={420}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Edit student</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            Corrects what&rsquo;s on file — doesn&rsquo;t touch attendance or outcome history.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <Label htmlFor="edit-name">Full name</Label>
            <Input id="edit-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-whatsapp">WhatsApp</Label>
            <Input id="edit-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-country">Country</Label>
            <Input id="edit-country" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-dob-day">Birthday day</Label>
              <Input
                id="edit-dob-day"
                type="number"
                min={1}
                max={31}
                value={dobDay}
                onChange={(e) => setDobDay(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-dob-month">Birthday month</Label>
              <Input
                id="edit-dob-month"
                type="number"
                min={1}
                max={12}
                value={dobMonth}
                onChange={(e) => setDobMonth(e.target.value)}
              />
            </div>
          </div>
          {error && <div className="text-[12px] font-medium text-accent-2-700">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <Button type="button" variant="primary" disabled={pending} onClick={handleSave}>
            {pending && <Spinner />}
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
