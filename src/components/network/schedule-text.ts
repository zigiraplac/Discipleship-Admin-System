import type { ScheduleState } from "@/lib/domain/rollup";
import { formatShortDate } from "@/lib/utils";

/** "3 lessons behind", "5 days ahead", "On schedule", ... */
export function scheduleText(f: {
  schedule: ScheduleState;
  daysBehind: number;
  lessonsBehind: number;
  startsOn?: string | null;
}): string {
  switch (f.schedule) {
    case "finished":
      return "Finished";
    case "upcoming":
      return f.startsOn ? `Starts ${formatShortDate(f.startsOn)}` : "Not started";
    case "ahead":
      return `${-f.daysBehind} day${f.daysBehind === -1 ? "" : "s"} ahead`;
    case "behind":
      return f.lessonsBehind >= 2
        ? `${f.lessonsBehind} lessons behind`
        : `${f.daysBehind} day${f.daysBehind === 1 ? "" : "s"} behind`;
    default:
      return "On schedule";
  }
}
