import { TEST_POLICY } from "@/lib/domain/test-policy";
import { describe, expect, it } from "vitest";
import { activeOn, attendanceBetween, cohortFacts, issuesFor, monthlyAttendance, monthSeries, periodAttendance, periodMovement, registeredOn, studentHistory, studentSpan, sumFacts } from "./rollup";
import { type Cohort, type LessonEventView, type Student } from "./types";

const TODAY = "2026-03-20";

function student(id: string, extra: Partial<Student> = {}): Student {
  return {
    id, cohortId: "c1", fullName: id, email: null, emailVerified: false, whatsapp: null, country: null, countryRaw: null,
    dobDay: null, dobMonth: null, city: null, extra: null, contactedAt: null, followUpAssignee: null, followUpNextOn: null,
    registeredAt: null, enrolledAt: "2026-01-05T00:00:00Z", leftAt: null, ...extra,
  };
}

function lesson(i: number, date: string, attendance: Record<string, "present" | "absent"> | null): LessonEventView {
  return {
    eventId: `e${i}`, cohortId: "c1", date, globalIndex: i, classNumber: 1, classIndex: 0, lessonRef: `L${i}`, lessonTitle: `L${i}`,
    edited: false,
    register: { eventId: `e${i}`, attendance: attendance ?? {}, recordedBy: null, recordedAt: attendance ? `${date}T10:00:00Z` : null, updatedBy: null, updatedAt: null },
  };
}

const cohort: Cohort = {
  id: "c1", slug: "c1", name: "Cohort 1 ", city: null, startDate: "2026-01-05", teachingDays: [1], facilitatorName: null,
  status: "running", lessonsPerSession: 1, intervalWeeks: 1, orgUnitId: "p1", createdAt: "2026-01-01T00:00:00Z",
};

const students = [
  student("a"),
  student("b"),
  student("c", { followUpNextOn: "2026-03-01" }),
  student("d", { leftAt: "2026-02-10T00:00:00Z" }),
];
const lessons = [
  lesson(0, "2026-01-05", { a: "present", b: "present", c: "absent", d: "present" }),
  lesson(1, "2026-01-12", { a: "present", b: "absent", c: "absent" }),
  lesson(2, "2026-01-19", { a: "present", b: "present", c: "absent" }),
  lesson(3, "2026-03-16", null),
  lesson(4, "2026-03-17", null),
  lesson(5, "2026-04-20", null),
];

function facts(overrides: Partial<Cohort> = {}, list = lessons) {
  return cohortFacts({
    cohort: { ...cohort, ...overrides }, students, lessonEvents: list, segments: [], latestOutcomeKind: new Map(),
    facilitatorNames: ["Ruth"], policies: TEST_POLICY, today: TODAY,
  });
}

describe("cohortFacts", () => {
  it("splits every registered student into exactly one of active, left, completed", () => {
    const f = facts();
    expect(f.registered).toBe(4);
    expect(f.active + f.left + f.completed).toBe(f.registered);
    expect(f.onTrack + f.needsHelp + f.atRisk).toBe(f.active);
  });

  it("counts a finished cohort's remaining students as completed, not active", () => {
    const f = facts({ status: "complete" });
    expect(f.phase).toBe("finished");
    expect(f.active).toBe(0);
    expect(f.completed).toBe(3);
  });

  it("treats a cohort as finished once every lesson is recorded", () => {
    const done = lessons.slice(0, 3);
    expect(facts({}, done).phase).toBe("finished");
  });

  it("flags inactive students, overdue follow-ups and unrecorded lessons", () => {
    const f = facts();
    // c was marked absent at all 3 recorded lessons in a row.
    expect(f.inactive).toBeGreaterThanOrEqual(1);
    expect(f.overdueFollowUps).toBe(1);
    expect(f.lessonsNotRecorded).toBe(2);
    expect(f.registersDue).toBe(5);
    expect(f.registersRecorded).toBe(3);
    expect(issuesFor(f, TODAY).map((i) => i.kind)).toEqual(expect.arrayContaining(["overdue", "contact", "records"]));
  });
});

describe("adding cohorts up", () => {
  it("sums counts and keeps the same identity", () => {
    const t = sumFacts([facts(), facts({ status: "complete" })], TODAY);
    expect(t.registered).toBe(8);
    expect(t.active + t.left + t.completed).toBe(t.registered);
    expect(t.running).toBe(1);
    expect(t.finished).toBe(1);
  });

  it("counts movement by date", () => {
    expect(periodMovement([facts()], TODAY, 90)).toEqual({ joined: 4, left: 1, completed: 0, graduated: 0 });
    const series = monthSeries([facts()], TODAY, 3);
    expect(series.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(series[0]).toMatchObject({ joined: 4, active: 4 });
    expect(series[1]).toMatchObject({ left: 1, active: 3 });
  });
});

describe("attendance across cohorts", () => {
  it("matches the cohort's own rate and adds up as seats", () => {
    const f = facts();
    // Recorded lessons 0–2, owed by a, b, c and by d (who left on 10 Feb,
    // after them): 3 + 1 + 2 present of 12 seats. The two March lessons have
    // no register and count for nothing.
    expect(attendanceBetween([f], null, TODAY)).toEqual({ present: 6, expected: 12, rate: 50 });
    expect(attendanceBetween([f], null, TODAY).rate).toBe(f.attendanceRate);
    const other = facts({ id: "c2" }, lessons.slice(0, 3));
    expect(attendanceBetween([f, other], null, TODAY)).toEqual({ present: 12, expected: 24, rate: 50 });
  });

  it("splits by period and by month", () => {
    const f = facts();
    // The last 30 days only hold March's two unrecorded lessons: no data, not 0%.
    const p = periodAttendance([f], TODAY, 30);
    expect(p.now).toEqual({ present: 0, expected: 0, rate: null });
    expect(p.before.rate).toBeNull();
    const months = monthlyAttendance([f], TODAY, 3);
    expect(months.map((m) => m.rate)).toEqual([50, null, null]);
  });
});


describe("student history over time", () => {
  const span = (s: { enrolledAt: string; leftAt: string | null; enrolment?: { kind: "joined" | "left" | "returned"; on: string }[] }) => studentSpan(s);

  it("someone who left and came back isn't active while they were away", () => {
    const s = span({
      enrolledAt: "2026-01-05",
      leftAt: null,
      enrolment: [
        { kind: "joined", on: "2026-01-05" },
        { kind: "left", on: "2026-03-10" },
        { kind: "returned", on: "2026-06-02" },
      ],
    });
    const facts = [{ spans: [s], finishedOn: null }];
    expect(activeOn(facts, "2026-02-28")).toBe(1);
    expect(activeOn(facts, "2026-04-30")).toBe(0);
    expect(activeOn(facts, "2026-06-30")).toBe(1);
    // Enrolments never shrink: they joined once.
    expect(registeredOn(facts, "2026-04-30")).toBe(1);
  });

  it("months before the first enrolment have no history (null) — a later zero is real", () => {
    const facts = [{ spans: [span({ enrolledAt: "2026-07-10", leftAt: null })], finishedOn: "2026-09-15" }];
    const h = studentHistory(facts, "2026-10-08", 6);
    expect(h.map((p) => p.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(h.map((p) => p.active)).toEqual([null, null, 1, 1, 0, 0]);
    expect(h.map((p) => p.enrolled)).toEqual([null, null, 1, 1, 1, 1]);
  });
});
