"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { cn, formatShortDate } from "@/lib/utils";
import { lastLessonDate, type GeneratedEvent } from "@/lib/domain/generator";
import { StepCard } from "./step-card";
import { formatTeachingDays } from "./day-defs";

/** Step 4 — Review: nothing is written until Continue ("Create cohort")
 * is pressed by the parent, which calls the `createCohort` server action. */
export function StepReview({
  name,
  city,
  startDate,
  teachingDays,
  events,
  enrolledCount,
  creating,
  error,
  onBack,
  onContinue,
}: {
  name: string;
  city: string;
  startDate: string;
  teachingDays: number[];
  events: GeneratedEvent[];
  enrolledCount: number;
  creating: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const last = lastLessonDate(events);
  const firstYear = startDate.slice(0, 4);
  const lastYear = last ? last.slice(0, 4) : "";
  const daysLabel = formatTeachingDays(teachingDays);
  const eventsCreated = events.length + enrolledCount;

  const rows: [string, React.ReactNode][] = [
    ["Cohort", name || "—"],
    ["Base", city || "—"],
    ["First lesson", startDate ? `${formatShortDate(startDate)} ${firstYear}` : "—"],
    ["Last lesson", last ? `${formatShortDate(last)} ${lastYear}` : "—"],
    ["Teaching days", daysLabel || "—"],
    ["Students", enrolledCount],
    ["Events created", eventsCreated],
  ];

  return (
    <StepCard
      step={4}
      onBack={onBack}
      onContinue={onContinue}
      continueDisabled={creating}
      continueLabel={creating ? "Creating…" : "Create cohort"}
    >
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-accent text-white">
          <CheckCircle size={22} weight="fill" />
        </span>
        <div className="text-[16px] font-bold text-ink">Ready to create</div>
        <div className="text-xs text-ink-muted">Nothing is saved until you confirm.</div>
      </div>

      <div className="rounded-control border border-border">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={cn(
              "flex items-center justify-between px-3.5 py-2.5 text-sm",
              i > 0 && "border-t border-divider"
            )}
          >
            <span className="text-ink-muted">{label}</span>
            <span className="font-semibold text-ink tabular">{value}</span>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-control border border-accent-2-300 bg-accent-2-100 px-3.5 py-2.5 text-xs font-medium text-accent-2-700">
          {error}
        </p>
      )}
    </StepCard>
  );
}
