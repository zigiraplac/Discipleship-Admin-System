"use client";

import { Input, Label } from "@/components/ui/input";
import { formatShortDate, cn } from "@/lib/utils";
import { lastLessonDate, type GeneratedEvent } from "@/lib/domain/generator";
import { StepCard } from "./step-card";
import { DAY_DEFS, LESSONS_PER_SESSION_OPTIONS, INTERVAL_OPTIONS } from "./day-defs";

/**
 * Step 1 — Cohort: name, first lesson date, base city, teaching days.
 * The "N lessons a week..." preview recomputes on every keystroke/toggle
 * via `buildEvents`, which is pure and cheap enough (<=80 iterations) to
 * call directly on every render. Same cadence options (lessons/session,
 * frequency) as the schedule-change panel a cohort gets later
 * (`schedule-settings-card.tsx`) — set here once at creation, changeable
 * there afterward.
 */
export function StepCohort({
  name,
  setName,
  city,
  setCity,
  startDate,
  setStartDate,
  teachingDays,
  toggleDay,
  lessonsPerSession,
  setLessonsPerSession,
  intervalWeeks,
  setIntervalWeeks,
  events,
  onContinue,
}: {
  name: string;
  setName: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  teachingDays: number[];
  toggleDay: (day: number) => void;
  lessonsPerSession: number;
  setLessonsPerSession: (n: number) => void;
  intervalWeeks: number;
  setIntervalWeeks: (n: number) => void;
  events: GeneratedEvent[];
  onContinue: () => void;
}) {
  const last = lastLessonDate(events);
  const year = last ? last.slice(0, 4) : "";
  const canContinue = teachingDays.length > 0;

  return (
    <StepCard step={1} onContinue={onContinue} continueDisabled={!canContinue}>
      <div>
        <Label htmlFor="cohort-name">Cohort name</Label>
        <Input
          id="cohort-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kigali — August 2026"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cohort-start">First lesson</Label>
          <input
            id="cohort-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-control border border-border bg-subtle px-3 py-2.5 text-sm text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>
        <div>
          <Label htmlFor="cohort-city">Base city</Label>
          <Input
            id="cohort-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Kigali"
          />
        </div>
      </div>

      <div>
        <Label>Teaching days</Label>
        <div className="flex flex-wrap gap-2">
          {DAY_DEFS.map((d) => {
            const active = teachingDays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={cn(
                  "rounded-control border px-3.5 py-2 text-xs font-semibold transition-colors",
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-card text-ink-secondary hover:bg-hover"
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Lessons per session</Label>
        <div className="flex flex-wrap gap-2">
          {LESSONS_PER_SESSION_OPTIONS.map((n) => {
            const active = lessonsPerSession === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setLessonsPerSession(n)}
                className={cn(
                  "rounded-control border px-3.5 py-2 text-xs font-semibold transition-colors",
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-card text-ink-secondary hover:bg-hover"
                )}
              >
                {n} {n === 1 ? "lesson" : "lessons"}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          The target pace. If a session only gets through part of this, postpone the rest from
          the Lessons screen — it shifts forward instead of getting stuck.
        </p>
      </div>

      <div>
        <Label>Frequency</Label>
        <div className="flex flex-wrap gap-2">
          {INTERVAL_OPTIONS.map((o) => {
            const active = intervalWeeks === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setIntervalWeeks(o.value)}
                className={cn(
                  "rounded-control border px-3.5 py-2 text-xs font-semibold transition-colors",
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-card text-ink-secondary hover:bg-hover"
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        {teachingDays.length === 0
          ? "Pick at least one day."
          : `${teachingDays.length * lessonsPerSession} lessons ${intervalWeeks === 1 ? "a week" : `every ${intervalWeeks} weeks`}. 80 lessons finish ${last ? formatShortDate(last) : "—"} ${year}.`}
      </p>
    </StepCard>
  );
}
