import { describe, expect, it } from "vitest";
import { aggregateCohort, catchupConflicts, lessonSeats, registerHealth, studentClassMarks } from "./metrics";
import { enrolledOn } from "./enrolment";
import { recordedMissStreak } from "./rollup";
import { studentIntervention, studentLifecycle } from "./student-state";
import { DEFAULT_BANDS, type LessonEventView, type Student } from "./types";

const TODAY = "2026-03-20";

function student(id: string, extra: Partial<Student> = {}): Student {
  return {
    id, cohortId: "c1", fullName: id, email: null, emailVerified: false, whatsapp: null, country: null, countryRaw: null,
    dobDay: null, dobMonth: null, city: null, extra: null, contactedAt: null, followUpAssignee: null, followUpNextOn: null,
    registeredAt: null, enrolledAt: "2026-01-01T00:00:00Z", leftAt: null, ...extra,
  };
}

function lesson(
  i: number,
  date: string,
  attendance: Record<string, "present" | "absent"> | null,
  caughtUp: string[] = []
): LessonEventView {
  return {
    eventId: `e${i}`, cohortId: "c1", date, globalIndex: i, classNumber: 1, classIndex: 0, lessonRef: `L${i + 1}`,
    lessonTitle: `Lesson ${i + 1}`, edited: false,
    register: {
      eventId: `e${i}`, attendance: attendance ?? {}, recordedBy: null,
      recordedAt: attendance ? `${date}T10:00:00Z` : null, updatedBy: null, updatedAt: null, caughtUp,
    },
  };
}

const find = (agg: ReturnType<typeof aggregateCohort>, id: string) => agg.roster.find((r) => r.id === id)!;

describe("enrolment", () => {
  it("a lesson before the student joined isn't owed", () => {
    const s = student("a", { enrolledAt: "2026-01-10T00:00:00Z" });
    expect(enrolledOn(s, "2026-01-05")).toBe(false);
    expect(enrolledOn(s, "2026-01-15")).toBe(true);
    const agg = aggregateCohort([s], [lesson(0, "2026-01-05", { a: "absent" }), lesson(1, "2026-01-15", { a: "present" })], DEFAULT_BANDS, TODAY);
    expect(find(agg, "a")).toMatchObject({ expected: 1, attended: 1, rate: 100 });
  });

  it("leaving later keeps the lessons they were enrolled for", () => {
    const s = student("a", { leftAt: "2026-02-01T00:00:00Z" });
    const lessons = [lesson(0, "2026-01-10", { a: "present" }), lesson(1, "2026-01-20", { a: "present" }), lesson(2, "2026-02-10", {})];
    const agg = aggregateCohort([s], lessons, DEFAULT_BANDS, TODAY);
    // The cohort still shows the 2 lessons they attended; the one after they left isn't owed.
    expect(agg.totalExpected).toBe(2);
    expect(agg.totalPresent).toBe(2);
    expect(agg.enrolled).toBe(0);
  });

  it("a student who left and came back owes nothing for the time away", () => {
    const s = student("a", {
      enrolment: [
        { kind: "joined", on: "2026-01-01" },
        { kind: "left", on: "2026-01-15" },
        { kind: "returned", on: "2026-02-01" },
      ],
    });
    expect(enrolledOn(s, "2026-01-10")).toBe(true);
    expect(enrolledOn(s, "2026-01-15")).toBe(false);
    expect(enrolledOn(s, "2026-01-20")).toBe(false);
    expect(enrolledOn(s, "2026-02-01")).toBe(true);
  });
});

describe("attendance vs. missing registers", () => {
  const s = student("a");
  const lessons = [
    ...Array.from({ length: 19 }, (_, i) => lesson(i, `2026-01-${String(i + 1).padStart(2, "0")}`, { a: i === 4 ? "absent" : "present" })),
    lesson(19, "2026-03-20", null), // due today, nobody has taken the register
  ];

  it("a due lesson with no register is not an absence (18/19, not 18/20)", () => {
    const a = find(aggregateCohort([s], lessons, DEFAULT_BANDS, TODAY), "a");
    expect(a).toMatchObject({ attended: 18, expected: 19, absences: 1 });
    expect(a.rate).toBe(95);
  });

  it("the missing register shows up as register health instead", () => {
    expect(registerHealth(lessons, TODAY)).toEqual({ due: 20, recorded: 19, missing: 1, completion: 95 });
  });

  it("a recorded absence counts; a recorded present counts", () => {
    expect(lessonSeats(lesson(0, "2026-01-01", { a: "absent" }), [s], TODAY)).toMatchObject({ expected: 1, present: 0 });
    expect(lessonSeats(lesson(0, "2026-01-01", { a: "present" }), [s], TODAY)).toMatchObject({ expected: 1, present: 1 });
  });
});

describe("inactive", () => {
  const s = student("a");
  const recordedNewestFirst = (ls: LessonEventView[]) => ls.filter((l) => l.register.recordedAt).sort((x, y) => (x.date < y.date ? 1 : -1));

  it("three recorded absences in a row", () => {
    const ls = [lesson(0, "2026-01-01", { a: "present" }), lesson(1, "2026-01-08", { a: "absent" }), lesson(2, "2026-01-15", { a: "absent" }), lesson(3, "2026-01-22", { a: "absent" })];
    expect(recordedMissStreak(s, recordedNewestFirst(ls))).toBe(3);
  });

  it("missing registers never add to the streak", () => {
    const ls = [lesson(0, "2026-01-01", { a: "present" }), lesson(1, "2026-01-08", null), lesson(2, "2026-01-15", null), lesson(3, "2026-01-22", null)];
    expect(recordedMissStreak(s, recordedNewestFirst(ls))).toBe(0);
    expect(find(aggregateCohort([s], ls, DEFAULT_BANDS, TODAY), "a").currentMissStreak).toBe(0);
  });
});

describe("catch-up", () => {
  const s = student("a");
  const lessons = [
    lesson(0, "2026-01-01", { a: "present" }),
    lesson(1, "2026-01-08", { a: "absent" }, ["a"]), // made up later
    lesson(2, "2026-01-15", { a: "absent" }),
    lesson(3, "2026-01-22", { a: "present" }),
  ];

  it("keeps the original absence and counts the recovery separately", () => {
    const a = find(aggregateCohort([s], lessons, DEFAULT_BANDS, TODAY), "a");
    expect(a).toMatchObject({ attended: 2, absences: 2, recovered: 1, missed: 1, rate: 50, effectiveRate: 75 });
    // The cohort's attendance is what happened on the day.
    expect(aggregateCohort([s], lessons, DEFAULT_BANDS, TODAY).rate).toBe(50);
  });

  it("shows the lesson as absent → caught up, not as present", () => {
    expect(studentClassMarks("a", lessons, 0).map((m) => m.status)).toEqual(["present", "caught-up", "absent", "present"]);
  });

  it("a register save can't mark a caught-up student present", () => {
    expect(catchupConflicts({ a: "present", b: "absent" }, ["a"])).toEqual(["a"]);
    expect(catchupConflicts({ a: "absent" }, ["a"])).toEqual([]);
  });
});

describe("lifecycle, performance and intervention stay separate", () => {
  const lessons = [lesson(0, "2026-01-01", { a: "absent", b: "absent", c: "present" }), lesson(1, "2026-01-08", { a: "absent", b: "absent", c: "present" })];

  it("ACTIVE + AT RISK + follow-up", () => {
    const a = find(aggregateCohort([student("a")], lessons, DEFAULT_BANDS, TODAY), "a");
    const life = studentLifecycle(a, false);
    expect(life).toBe("active");
    expect(a.performance).toBe("At risk");
    expect(studentIntervention(a, null, TODAY)).toEqual({ kind: "follow-up", overdue: false, contacted: false });
  });

  it("ACTIVE + AT RISK + CATCH-UP", () => {
    const b = find(aggregateCohort([student("b")], lessons, DEFAULT_BANDS, TODAY), "b");
    expect(studentLifecycle(b, false)).toBe("active");
    expect(b.performance).toBe("At risk");
    expect(studentIntervention(b, "catchup", TODAY)).toEqual({ kind: "catch-up", recovered: 0, toRecover: 2, complete: false });
  });

  it("LEFT has no performance or intervention; COMPLETED when the cohort finished", () => {
    const left = find(aggregateCohort([student("a", { leftAt: "2026-02-01T00:00:00Z" })], lessons, DEFAULT_BANDS, TODAY), "a");
    expect(studentLifecycle(left, false)).toBe("left");
    expect(studentIntervention(left, null, TODAY)).toEqual({ kind: "none" });
    const c = find(aggregateCohort([student("c")], lessons, DEFAULT_BANDS, TODAY), "c");
    expect(studentLifecycle(c, true)).toBe("completed");
    expect(c.performance).toBe("On track");
  });

  it("someone with no recorded lesson owed yet is registered and not judged", () => {
    const n = find(aggregateCohort([student("n", { enrolledAt: "2026-03-01T00:00:00Z" })], lessons, DEFAULT_BANDS, TODAY), "n");
    expect(studentLifecycle(n, false)).toBe("registered");
    expect(n.performance).toBe("Not started");
    expect(studentIntervention(n, null, TODAY)).toEqual({ kind: "none" });
  });
});
