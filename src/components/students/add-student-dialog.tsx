"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, CaretDown, CaretRight } from "@phosphor-icons/react";
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
import { formatShortDate } from "@/lib/utils";
import { addStudent } from "@/lib/actions/students";

const EMPTY = { fullName: "", email: "", whatsapp: "", country: "", city: "", dobDay: "", dobMonth: "" };

export interface RecordedLessonOption {
  eventId: string;
  lessonRef: string;
  lessonTitle: string;
  date: string;
}

/** Admin-only trigger + form — the page decides whether to render this at
 * all (only for user.role === "admin"), this component doesn't re-check.
 * Covers the one gap the CSV import wizard leaves: a real student who
 * shows up after that import is already done — including one who was
 * actually there for some already-recorded lessons before anyone entered
 * them into the system. */
export function AddStudentDialog({
  cohortId,
  recordedLessons,
}: {
  cohortId: string;
  /** Already-recorded lessons, oldest first — the checklist a facilitator
   * ticks to backfill real attendance from before this student existed
   * in the system. */
  recordedLessons: RecordedLessonOption[];
}) {
  const router = useRouter();
  const { show } = useToast();
  // The Dashboard's "Add student" quick action links here with ?add=1 so
  // it actually opens the form, not just the page it lives on — otherwise
  // that shortcut leaves the user to go find the button themselves. A lazy
  // initializer (not an effect) so there's no extra render, and it reads
  // the URL directly rather than `useSearchParams` since this is a one-time
  // bootstrap check, not something that needs to re-run on navigation —
  // avoiding a Suspense boundary just for this.
  const [open, setOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("add"));
  const [form, setForm] = useState(EMPTY);
  const [showBackfill, setShowBackfill] = useState(false);
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && new URLSearchParams(window.location.search).has("add")) {
      router.replace(window.location.pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setForm(EMPTY);
      setShowBackfill(false);
      setAttendedIds(new Set());
      setError(null);
    }
  }

  function set<K extends keyof typeof EMPTY>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function toggleLesson(eventId: string) {
    setAttendedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function toggleAll() {
    setAttendedIds((prev) => (prev.size === recordedLessons.length ? new Set() : new Set(recordedLessons.map((l) => l.eventId))));
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
        attendedEventIds: attendedIds.size ? [...attendedIds] : undefined,
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
      <DialogPopup width={440}>
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

          {recordedLessons.length > 0 && (
            <div className="rounded-control border border-border-soft">
              <button
                type="button"
                onClick={() => setShowBackfill((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              >
                {showBackfill ? (
                  <CaretDown size={13} weight="bold" className="flex-none text-ink-faint" />
                ) : (
                  <CaretRight size={13} weight="bold" className="flex-none text-ink-faint" />
                )}
                <span className="flex-1 text-[13px] font-semibold text-ink">
                  This student already attended some lessons
                </span>
                {attendedIds.size > 0 && (
                  <span className="text-[11px] font-semibold text-accent-700 tabular">{attendedIds.size} ticked</span>
                )}
              </button>
              {showBackfill && (
                <div className="border-t border-divider">
                  <label className="flex cursor-pointer items-center gap-2 border-b border-divider px-3 py-2 text-xs font-semibold text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={attendedIds.size === recordedLessons.length}
                      onChange={toggleAll}
                      className="size-4 accent-accent"
                    />
                    Select all {recordedLessons.length} recorded lessons
                  </label>
                  <div className="max-h-[220px] overflow-y-auto">
                    {recordedLessons.map((lesson) => (
                      <label
                        key={lesson.eventId}
                        className="flex cursor-pointer items-center gap-2.5 border-b border-divider px-3 py-2 text-[12px] last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={attendedIds.has(lesson.eventId)}
                          onChange={() => toggleLesson(lesson.eventId)}
                          className="size-4 flex-none accent-accent"
                        />
                        <span className="min-w-0 flex-1 truncate text-ink">
                          {lesson.lessonRef} — {lesson.lessonTitle}
                        </span>
                        <span className="flex-none text-ink-faint">{formatShortDate(lesson.date)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="border-t border-divider px-3 py-2 text-[11px] text-ink-faint">
                    Sets their attendance start date to the earliest lesson ticked — anything recorded
                    in between that isn&rsquo;t ticked counts as a real miss.
                  </div>
                </div>
              )}
            </div>
          )}

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
