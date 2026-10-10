import { describe, expect, it } from "vitest";
import { buildIdealSchedule, type ScheduleSegment } from "./generator";
import { computePace, earlierUnrecorded, laterRecorded } from "./metrics";
import type { LessonEventView } from "./types";

// Mondays only, one lesson a session, from Monday 5 January 2026.
const cohort = { startDate: "2026-01-05", teachingDays: [1], lessonsPerSession: 1, intervalWeeks: 1 };
// On 2 February the cohort moves to Mondays and Thursdays.
const change: ScheduleSegment = { startsAtPosition: 3, effectiveFrom: "2026-02-02", teachingDays: [1, 4], lessonsPerSession: 1, intervalWeeks: 1 };

const lessons = (events: ReturnType<typeof buildIdealSchedule>) => events.filter((e) => e.kind === "lesson");

describe("schedule history", () => {
  it("leaves the plan before a change exactly as it was", () => {
    const before = buildIdealSchedule(cohort, []).filter((e) => e.date < change.effectiveFrom);
    const after = buildIdealSchedule(cohort, [change]).filter((e) => e.date < change.effectiveFrom);
    expect(after).toEqual(before);
  });

  it("applies the new cadence only from the day it took effect", () => {
    const planned = lessons(buildIdealSchedule(cohort, [change])).filter((e) => e.date >= change.effectiveFrom);
    expect(planned[0].date).toBe("2026-02-02");
    // Mondays (1) and Thursdays (4) from then on.
    expect(new Set(planned.slice(0, 6).map((e) => new Date(`${e.date}T00:00:00Z`).getUTCDay()))).toEqual(new Set([1, 4]));
  });

  it("a change never alters what was expected by an earlier date", () => {
    expect(computePace(cohort, [change], 0, "2026-01-31").expectedByNow).toBe(computePace(cohort, [], 0, "2026-01-31").expectedByNow);
  });

  it("a change decided late doesn't erase how far behind the cohort already was", () => {
    // Behind (nothing recorded) when the change is made on 2 February: the
    // plan still expects the January lessons, so the gap is still there.
    const pace = computePace(cohort, [change], 0, "2026-02-03");
    expect(pace.expectedByNow).toBe(lessons(buildIdealSchedule(cohort, [])).filter((e) => e.date < "2026-02-02").length + 1);
    expect(pace.gap).toBe(pace.expectedByNow);
  });

  it("is the same whatever order the changes are listed in", () => {
    const later: ScheduleSegment = { startsAtPosition: 9, effectiveFrom: "2026-03-02", teachingDays: [3], lessonsPerSession: 2, intervalWeeks: 1 };
    expect(buildIdealSchedule(cohort, [later, change])).toEqual(buildIdealSchedule(cohort, [change, later]));
  });
});

describe("recording out of order", () => {
  const ev = (i: number, date: string, recorded: boolean): LessonEventView => ({
    eventId: `e${i}`, cohortId: "c1", date, globalIndex: i, classNumber: 1, classIndex: 0, lessonRef: `L${i + 1}`, lessonTitle: "",
    edited: false,
    register: { eventId: `e${i}`, attendance: {}, recordedBy: null, recordedAt: recorded ? `${date}T10:00:00Z` : null, updatedBy: null, updatedAt: null },
  });
  const list = [ev(0, "2026-01-05", true), ev(1, "2026-01-12", false), ev(2, "2026-01-19", false), ev(3, "2026-01-26", true), ev(4, "2026-02-02", false)];

  it("names earlier lessons that are due but unrecorded", () => {
    expect(earlierUnrecorded(list, list[3], "2026-01-30").map((e) => e.lessonRef)).toEqual(["L2", "L3"]);
    expect(earlierUnrecorded(list, list[1], "2026-01-30")).toEqual([]);
  });

  it("names later lessons already recorded", () => {
    expect(laterRecorded(list, list[1]).map((e) => e.lessonRef)).toEqual(["L4"]);
  });
});
