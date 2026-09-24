"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn, formatShortDate } from "@/lib/utils";
import { DAY_DEFS, formatTeachingDays, LESSONS_PER_SESSION_OPTIONS, INTERVAL_OPTIONS } from "@/components/wizard/day-defs";
import { changeCohortSchedule } from "@/lib/actions/schedule";
import { buildIdealSchedule, curriculumScheduleItems, lastLessonDate, type ScheduleSegment } from "@/lib/domain/generator";

interface BaseCadence {
  startDate: string;
  teachingDays: number[];
  lessonsPerSession: number;
  intervalWeeks: number;
}

/** "Current" cadence is the latest recorded change, if any, else the
 * cohort's own original (creation-time) columns — see `cohort_schedule_period`
 * (0023_cohort_schedule_periods.sql) and `buildIdealSchedule`. */
function currentCadence(cohort: BaseCadence, segments: ScheduleSegment[]) {
  const latest = segments[segments.length - 1];
  return latest
    ? { teachingDays: latest.teachingDays, lessonsPerSession: latest.lessonsPerSession, intervalWeeks: latest.intervalWeeks }
    : { teachingDays: cohort.teachingDays, lessonsPerSession: cohort.lessonsPerSession, intervalWeeks: cohort.intervalWeeks };
}

/**
 * Shows the cadence actually in effect right now, and — for a facilitator
 * or admin — a way to change it starting from the next not-yet-recorded
 * lesson. A cohort that's completed every lesson has no "next" one to
 * anchor a change to, so the action is disabled rather than pretending a
 * change could take effect somewhere.
 */
export function ScheduleSettingsCard({
  cohort,
  segments,
  cohortId,
  nextLesson,
}: {
  cohort: BaseCadence;
  segments: ScheduleSegment[];
  cohortId: string;
  nextLesson: { eventId: string; lessonRef: string; globalIndex: number } | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const current = currentCadence(cohort, segments);

  const [editing, setEditing] = useState(false);
  const [teachingDays, setTeachingDays] = useState<number[]>(current.teachingDays);
  const [lessonsPerSession, setLessonsPerSession] = useState(current.lessonsPerSession);
  const [intervalWeeks, setIntervalWeeks] = useState(current.intervalWeeks);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The finish date under whatever's actually in effect today — shown
  // alongside the live preview below so a change's real effect (does this
  // push the finish out, or barely move it) is visible before saving, not
  // just after.
  const currentFinish = useMemo(() => lastLessonDate(buildIdealSchedule(cohort, segments)), [cohort, segments]);

  // Recomputed on every toggle in the edit form (same cheap-enough-to-run-
  // on-every-keystroke idea as the creation wizard's own live preview) —
  // appends a hypothetical trailing segment, starting at the next
  // not-yet-recorded lesson's own curriculum position, using whatever the
  // form currently holds.
  const previewFinish = useMemo(() => {
    if (!nextLesson || teachingDays.length === 0) return null;
    const items = curriculumScheduleItems();
    const startsAtPosition = items.findIndex((it) => it.kind === "lesson" && it.globalIndex === nextLesson.globalIndex);
    if (startsAtPosition < 0) return null;
    const hypothetical: ScheduleSegment = { startsAtPosition, teachingDays, lessonsPerSession, intervalWeeks };
    return lastLessonDate(buildIdealSchedule(cohort, [...segments, hypothetical]));
  }, [cohort, segments, nextLesson, teachingDays, lessonsPerSession, intervalWeeks]);

  function toggleDay(day: number) {
    setTeachingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function startEditing() {
    setTeachingDays(current.teachingDays);
    setLessonsPerSession(current.lessonsPerSession);
    setIntervalWeeks(current.intervalWeeks);
    setReason("");
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    if (!nextLesson) return;
    if (teachingDays.length === 0) {
      setError("Pick at least one teaching day.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await changeCohortSchedule({
          cohortId,
          fromEventId: nextLesson.eventId,
          teachingDays,
          lessonsPerSession,
          intervalWeeks,
          reason: reason || undefined,
        });
        show("Schedule updated.");
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update the schedule.");
      }
    });
  }

  return (
    <Card className="w-full max-w-[560px] overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Teaching schedule</CardTitle>
          <CardSubtitle>
            {segments.length > 0
              ? `Changed ${segments.length} time${segments.length === 1 ? "" : "s"} — full history on Reports.`
              : "Set once at creation, still the original plan."}
          </CardSubtitle>
        </div>
      </CardHeader>

      {!editing ? (
        <div className="flex flex-col gap-3.5 px-[18px] py-4">
          <div className="flex flex-col gap-2.5 rounded-[10px] border border-divider bg-subtle px-3 py-3 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">Teaching days</span>
              <span className="font-semibold text-ink">{formatTeachingDays(current.teachingDays) || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">Lessons per session</span>
              <span className="font-semibold text-ink">{current.lessonsPerSession}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">Frequency</span>
              <span className="font-semibold text-ink">
                {INTERVAL_OPTIONS.find((o) => o.value === current.intervalWeeks)?.label ?? `Every ${current.intervalWeeks} weeks`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">First lesson</span>
              <span className="font-semibold text-ink">{formatShortDate(cohort.startDate)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">Tentative finish</span>
              <span className="font-semibold text-ink">{currentFinish ? formatShortDate(currentFinish) : "—"}</span>
            </div>
          </div>

          {nextLesson ? (
            <Button type="button" variant="secondary" onClick={startEditing} className="w-full">
              Change schedule
            </Button>
          ) : (
            <p className="text-[11px] text-ink-faint">
              Every lesson in this cohort has been recorded — there&rsquo;s nothing upcoming left to reschedule.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 px-[18px] py-4">
          <p className="text-xs text-ink-muted">
            Applies from <span className="font-semibold text-ink">{nextLesson?.lessonRef}</span> onward — every lesson
            already recorded, and its own scheduled date, stays exactly as it was.
          </p>

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
                      active ? "border-accent bg-accent text-white" : "border-border bg-card text-ink-secondary hover:bg-hover"
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
                      active ? "border-accent bg-accent text-white" : "border-border bg-card text-ink-secondary hover:bg-hover"
                    )}
                  >
                    {n} {n === 1 ? "lesson" : "lessons"}
                  </button>
                );
              })}
            </div>
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
                      active ? "border-accent bg-accent text-white" : "border-border bg-card text-ink-secondary hover:bg-hover"
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-[10px] border border-divider bg-subtle px-3 py-3 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">Tentative finish today</span>
              <span className="font-semibold text-ink">{currentFinish ? formatShortDate(currentFinish) : "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">With this change</span>
              <span className={cn("font-semibold", previewFinish ? "text-accent-700" : "text-ink-faint")}>
                {previewFinish ? formatShortDate(previewFinish) : "Pick at least one teaching day"}
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="schedule-reason">Reason (optional)</Label>
            <Textarea
              id="schedule-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Leadership decided to slow to every two weeks starting next month."
            />
          </div>

          {error && <div className="text-[12px] font-medium text-accent-2-700">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleSave} disabled={pending}>
              {pending && <Spinner />}
              {pending ? "Saving…" : "Save schedule"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
