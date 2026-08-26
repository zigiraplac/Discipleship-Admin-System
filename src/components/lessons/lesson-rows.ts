import { isRecorded, lessonStats } from "@/lib/domain/metrics";
import { toneForRate } from "@/components/ui/progress-bar";
import type { LessonEventView, Bands } from "@/lib/domain/types";
import type { LessonPublicView } from "@/lib/data/lessons";
import type { LessonRow } from "./lessons-browser";

/**
 * The one place `LessonRow[]` gets built from either the full register
 * view (facilitator/admin) or the public aggregate view (teacher) —
 * shared by the Lessons page's table and heatmap, and the Dashboard's
 * heatmap, so all three read the exact same real attendance data instead
 * of three independent copies of this mapping that could quietly drift.
 */
export function buildLessonRows(
  lessonEvents: LessonEventView[],
  activeIds: Set<string>,
  bands: Bands,
  today: string
): LessonRow[] {
  return lessonEvents.map((ev) => {
    const recorded = isRecorded(ev);
    const status: LessonRow["status"] = recorded ? "recorded" : ev.date <= today ? "missing" : "upcoming";
    const stats = lessonStats(ev, activeIds);
    const ratePct = stats ? stats.rate : null;
    return {
      eventId: ev.eventId,
      date: ev.date,
      globalIndex: ev.globalIndex,
      classNumber: ev.classNumber,
      lessonRef: ev.lessonRef,
      lessonTitle: ev.lessonTitle,
      status,
      presentText: stats ? `${stats.present}/${activeIds.size}` : "—",
      ratePct,
      tone: ratePct !== null ? toneForRate(ratePct, bands.activeThreshold, bands.helpThreshold) : "grey",
      edited: ev.edited,
    };
  });
}

export function buildLessonRowsPublic(pub: LessonPublicView[], bands: Bands, today: string): LessonRow[] {
  return pub.map((p) => {
    const status: LessonRow["status"] = p.recorded ? "recorded" : p.date <= today ? "missing" : "upcoming";
    const ratePct = p.recorded ? p.rate : null;
    return {
      eventId: p.eventId,
      date: p.date,
      globalIndex: p.globalIndex,
      classNumber: p.classNumber,
      lessonRef: p.lessonRef,
      lessonTitle: p.lessonTitle,
      status,
      presentText: p.recorded ? `${p.present}/${p.enrolled}` : "—",
      ratePct,
      tone: ratePct !== null ? toneForRate(ratePct, bands.activeThreshold, bands.helpThreshold) : "grey",
      // The public view doesn't carry `edited` — a documented gap
      // consistent with teacher already being the lighter-data role.
      edited: false,
    };
  });
}
