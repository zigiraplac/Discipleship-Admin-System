"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "@phosphor-icons/react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { isRecorded } from "@/lib/domain/metrics";
import { toggleLessonCatchup } from "@/lib/actions/catchup";
import { cn } from "@/lib/utils";
import type { LessonEventView } from "@/lib/domain/types";

/**
 * One row per lesson this student is still marked absent for — ticking a
 * row corrects that lesson's attendance to present (the same "correction"
 * mechanism a facilitator uses to fix a mistake) and the row disappears,
 * same as crossing an item off a todo list. Once every lesson is caught
 * up, the whole card disappears too.
 *
 * `variant="compact"` drops the card chrome and caps the row count (with a
 * link to the rest) — meant to sit inline on the Attention card, so ticking
 * a catch-up lesson doesn't require first navigating to the student's
 * profile just to find where that lives.
 */
export function CatchupChecklist({
  cohortId,
  studentId,
  lessonEvents,
  variant = "full",
  maxVisible,
  viewAllHref,
  label,
}: {
  cohortId: string;
  studentId: string;
  lessonEvents: LessonEventView[];
  variant?: "full" | "compact";
  maxVisible?: number;
  viewAllHref?: string;
  /** Compact mode only — small heading shown above the list, skipped
   * entirely (along with the list) when there's nothing to catch up on. */
  label?: string;
}) {
  const missed = useMemo(
    () =>
      lessonEvents
        .filter((e) => isRecorded(e) && e.register.attendance[studentId] !== "present")
        .sort((a, b) => b.globalIndex - a.globalIndex),
    [lessonEvents, studentId]
  );

  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function tick(eventId: string) {
    if (pendingId) return;
    setError(null);
    setPendingId(eventId);
    try {
      await toggleLessonCatchup({ studentId, cohortId, eventId, caughtUp: true });
      setResolved((prev) => new Set(prev).add(eventId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this lesson.");
    } finally {
      setPendingId(null);
    }
  }

  const visible = missed.filter((ev) => !resolved.has(ev.eventId));
  if (visible.length === 0) return null;

  const compact = variant === "compact";
  const rows = compact && maxVisible ? visible.slice(0, maxVisible) : visible;
  const hiddenCount = visible.length - rows.length;

  const list = (
    <div className="flex flex-col gap-1.5">
      {rows.map((ev) => {
        const busy = pendingId === ev.eventId;
        return (
          <button
            key={ev.eventId}
            type="button"
            disabled={busy}
            onClick={() => tick(ev.eventId)}
            className={cn(
              "flex items-center gap-2.5 rounded-[10px] border border-border-soft bg-subtle px-3 py-2 text-left transition-colors",
              busy && "opacity-60"
            )}
          >
            <span className="flex size-[18px] flex-none items-center justify-center rounded-[5px] border border-border bg-card">
              {busy ? <Spinner /> : <Check size={12} weight="bold" className="text-ink-faint" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {ev.lessonRef} · {ev.lessonTitle}
              </span>
              <span className="block text-[11px] text-ink-muted">{ev.date}</span>
            </span>
          </button>
        );
      })}
      {hiddenCount > 0 && viewAllHref && (
        <Link href={viewAllHref} className="mt-0.5 text-[11px] font-semibold text-accent-700 hover:underline">
          +{hiddenCount} more · Open full checklist
        </Link>
      )}
      {error && <div className="mt-1 text-xs font-medium text-accent-2-700">{error}</div>}
    </div>
  );

  if (compact) {
    return (
      <div>
        {label && <div className="mb-1.5 text-[11px] font-semibold text-ink-tertiary">{label}</div>}
        {list}
      </div>
    );
  }

  return (
    <Card id="catchup-checklist">
      <CardHeader>
        <div>
          <CardTitle>Catch-up checklist</CardTitle>
          <CardSubtitle>Tick a lesson once it&rsquo;s been made up with them</CardSubtitle>
        </div>
      </CardHeader>
      <div className="px-[18px] py-4">{list}</div>
    </Card>
  );
}
