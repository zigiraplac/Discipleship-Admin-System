"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, PencilSimple } from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverPanel } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { setFollowUpPlan } from "@/lib/actions/students";
import { cn, formatShortDate, todayISO } from "@/lib/utils";

/**
 * Who follows up with a struggling student, and when to check again. Past
 * that date while they still need attention it reads "overdue" — here and
 * as an "overdue follow-ups" count on the levels above.
 */
export function FollowUpPlan({
  studentId,
  cohortId,
  assigneeId,
  nextOn,
  people,
  canEdit,
  className,
}: {
  studentId: string;
  cohortId: string;
  assigneeId: string | null;
  nextOn: string | null;
  people: { id: string; name: string }[];
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(assigneeId ?? "");
  const [when, setWhen] = useState(nextOn ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayISO();
  const overdue = !!nextOn && nextOn < today;
  const whoName = people.find((p) => p.id === assigneeId)?.name;
  const summary = nextOn
    ? `${overdue ? "Overdue · was due" : "Check again"} ${formatShortDate(nextOn)}${whoName ? ` · ${whoName}` : ""}`
    : whoName
      ? `Followed up by ${whoName}`
      : "No follow-up plan";

  async function save(clear = false) {
    setPending(true);
    setError(null);
    try {
      await setFollowUpPlan({ studentId, cohortId, assigneeId: clear ? null : who || null, nextOn: clear ? null : when || null });
      show(clear ? "Follow-up plan cleared." : "Follow-up plan saved.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  const text = (
    <span className={cn("flex items-center gap-1.5 text-xs", overdue ? "font-semibold text-accent-2-700" : "text-ink-secondary")}>
      <CalendarCheck size={14} className="flex-none" />
      <span className="truncate">{summary}</span>
    </span>
  );

  if (!canEdit) return <div className={className}>{text}</div>;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setWho(assigneeId ?? "");
          setWhen(nextOn ?? "");
          setError(null);
        }
      }}
    >
      <PopoverTrigger className={cn("group flex max-w-full items-center gap-1.5 rounded-control text-left", className)}>
        {text}
        <PencilSimple size={12} className="flex-none text-ink-faint group-hover:text-accent-700" />
      </PopoverTrigger>
      <PopoverPanel width={280} align="start">
        <form
          className="flex flex-col gap-3 p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="text-[13px] font-bold text-ink">Follow-up plan</div>
          <div>
            <Label htmlFor={`fu-who-${studentId}`}>Who follows up</Label>
            <NativeSelect id={`fu-who-${studentId}`} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Not assigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor={`fu-when-${studentId}`}>Check again on</Label>
            <input
              id={`fu-when-${studentId}`}
              type="date"
              value={when}
              min={today}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-control border border-border bg-subtle px-3 py-2 text-sm text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            />
          </div>
          {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending || (!assigneeId && !nextOn)} onClick={() => void save(true)}>
              Clear
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Spinner />}
              Save
            </Button>
          </div>
        </form>
      </PopoverPanel>
    </Popover>
  );
}
