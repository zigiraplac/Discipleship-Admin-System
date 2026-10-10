import { describe, expect, it } from "vitest";
import { aggregateCohort, attendanceSince, lessonSeats, lessonStats, seatTotals, studentMonthlyRates } from "./metrics";
import { classRateFrom, monthlyRatesFrom, reportSeats, type ReportLesson } from "@/components/reports/report-utils";
import { DEFAULT_BANDS, type LessonEventView, type Student } from "./types";

const TODAY = "2026-03-20";

function student(id: string, enrolledAt = "2026-01-01T00:00:00Z"): Student {
  return {
    id, cohortId: "c1", fullName: id, email: null, emailVerified: false, whatsapp: null, country: null, countryRaw: null,
    dobDay: null, dobMonth: null, city: null, extra: null, contactedAt: null, followUpAssignee: null, followUpNextOn: null,
    registeredAt: null, enrolledAt, leftAt: null,
  };
}

function lesson(i: number, date: string, attendance: Record<string, "present" | "absent"> | null): LessonEventView {
  return {
    eventId: `e${i}`, cohortId: "c1", date, globalIndex: i, classNumber: 1, classIndex: 0,
    lessonRef: `C1 · L${i + 1}`, lessonTitle: `Lesson ${i + 1}`, edited: false,
    register: {
      eventId: `e${i}`, attendance: attendance ?? {}, recordedBy: null,
      recordedAt: attendance ? `${date}T10:00:00Z` : null, updatedBy: null, updatedAt: null,
    },
  };
}

// a, b joined at the start; c joined on 1 Feb (after the first two lessons).
const students = [student("a"), student("b"), student("c", "2026-02-01T00:00:00Z")];
const lessons = [
  lesson(0, "2026-01-10", { a: "present", b: "absent", c: "present" }), // c's mark predates joining
  lesson(1, "2026-01-20", { a: "present", b: "present" }),
  lesson(2, "2026-02-10", { a: "present", b: "absent", c: "present" }),
  lesson(3, "2026-03-01", null), // due, never recorded
  lesson(4, "2026-04-01", null), // future
];

describe("lessonSeats", () => {
  it("only counts students who had joined by the lesson date", () => {
    expect(lessonSeats(lessons[0], students, TODAY)).toMatchObject({ due: true, recorded: true, expected: 2, present: 1 });
    expect(lessonSeats(lessons[2], students, TODAY)).toMatchObject({ expected: 3, present: 2 });
  });

  it("leaves a due lesson with no register out of attendance (a missing register, not an absence)", () => {
    expect(lessonSeats(lessons[3], students, TODAY)).toMatchObject({ due: true, recorded: false, eligible: 3, expected: 0, present: 0 });
  });

  it("marks a future lesson as not due", () => {
    expect(lessonSeats(lessons[4], students, TODAY).due).toBe(false);
  });
});

describe("seatTotals", () => {
  it("returns null, not 0%, when nothing is due", () => {
    expect(seatTotals([]).rate).toBeNull();
  });

  it("counts recorded lessons only", () => {
    const rows = lessons.map((l) => lessonSeats(l, students, TODAY));
    // recorded: L0 1/2, L1 2/2, L2 2/3 → 5/7; L3 (no register) and L4 (future) add nothing
    expect(seatTotals(rows)).toEqual({ present: 5, expected: 7, rate: 71 });
  });
});

describe("one definition everywhere", () => {
  it("the cohort rate equals the sum of every lesson's seats", () => {
    const agg = aggregateCohort(students, lessons, DEFAULT_BANDS, TODAY);
    const seats = seatTotals(lessons.map((l) => lessonSeats(l, students, TODAY)));
    expect(agg.rate).toBe(seats.rate);
    expect(agg.totalPresent).toBe(seats.present);
    expect(agg.totalExpected).toBe(seats.expected);
  });

  it("Reports' class and monthly rates use the same seats", () => {
    const report: ReportLesson[] = lessons.map((l) => {
      const s = lessonSeats(l, students, TODAY);
      const st = lessonStats(l, students);
      return {
        eventId: l.eventId, date: l.date, globalIndex: l.globalIndex, classIndex: l.classIndex, classNumber: 1,
        lessonRef: l.lessonRef, lessonTitle: l.lessonTitle, due: s.due, recorded: s.recorded, expected: s.expected,
        present: st?.present ?? null, absent: st?.absent ?? null, rate: st?.rate ?? null,
      };
    });
    expect(classRateFrom(report, 0)).toBe(71);
    expect(seatTotals(report.map(reportSeats)).rate).toBe(71);
    // Jan: 3/4 = 75, Feb: 2/3 = 67; March's only lesson has no register, April isn't due.
    expect(monthlyRatesFrom(report)).toEqual([
      { month: "2026-01", rate: 75 },
      { month: "2026-02", rate: 67 },
    ]);
  });
});

describe("per-student figures", () => {
  it("attendanceSince ignores a due lesson with no register", () => {
    const since = attendanceSince(students[0], lessons, "2026-01-31T09:00:00Z", TODAY);
    expect(since).toEqual({ attended: 1, expected: 1, rate: 100 });
  });

  it("monthly trend skips months before the student joined and months with no register", () => {
    expect(studentMonthlyRates(students[2], lessons, TODAY).map((m) => m.month)).toEqual(["2026-02"]);
  });
});
