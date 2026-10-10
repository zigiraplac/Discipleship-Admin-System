import { describe, expect, it } from "vitest";
import { bandsOf, newVersionProblem, policyOn, type PolicyVersion } from "./policy";
import { statusOf } from "./bands";
import { aggregateCohort } from "./metrics";
import { cohortFacts } from "./rollup";
import { graduationCheck, studentIntervention, studentLifecycle } from "./student-state";
import type { Cohort, LessonEventView, Student } from "./types";

const v = (version: number, effectiveFrom: string, onTrack: number, needsHelp: number, graduationAttendance = 85): PolicyVersion => ({
  version, effectiveFrom, onTrack, needsHelp, inactiveStreak: 3, graduationAttendance, note: null, createdAt: null, createdBy: null,
});
const ruleA = v(1, "2026-01-01", 85, 60);
const ruleB = v(2, "2027-01-01", 70, 50);
const versions = [ruleA, ruleB];
const statusAt = (date: string, rate: number) => statusOf(rate, bandsOf(policyOn(versions, date)));

describe("effective-dated policy", () => {
  it("applies the rule in force on each date", () => {
    expect(statusAt("2026-02-15", 80)).toBe("Needs help");
    expect(statusAt("2026-02-15", 90)).toBe("On track");
    expect(statusAt("2027-02-15", 80)).toBe("On track");
    expect(statusAt("2026-12-31", 75)).toBe("Needs help");
    expect(statusAt("2027-01-01", 75)).toBe("On track");
  });

  it("adding a new version never changes the earlier one", () => {
    const before = JSON.stringify(ruleA);
    policyOn(versions, "2027-06-01");
    expect(JSON.stringify(ruleA)).toBe(before);
    expect(policyOn(versions, "2026-06-01")).toBe(ruleA);
  });

  it("only allows forward-dated new versions, never edits or back-dating", () => {
    const draft = { effectiveFrom: "2027-01-01", onTrack: 70, needsHelp: 50, inactiveStreak: 3, graduationAttendance: 85 };
    expect(newVersionProblem([ruleA], draft, "2026-10-07")).toBeNull();
    expect(newVersionProblem([ruleA], { ...draft, effectiveFrom: "2026-09-01" }, "2026-10-07")).toMatch(/past/);
    expect(newVersionProblem([ruleA, ruleB], { ...draft, effectiveFrom: "2026-12-01" }, "2026-10-07")).toMatch(/after the latest/);
    expect(newVersionProblem([ruleA], { ...draft, needsHelp: 75 }, "2026-10-07")).toMatch(/lower/);
  });

  it("keeps the graduation threshold separate from On track", () => {
    const p = policyOn([v(1, "2026-01-01", 85, 60, 80)], "2026-05-01");
    expect(p.onTrack).toBe(85);
    expect(p.graduationAttendance).toBe(80);
  });
});

// ── graduation ──────────────────────────────────────────────────────────
const TODAY = "2026-10-07";
const student = (id: string, extra: Partial<Student> = {}): Student => ({
  id, cohortId: "c1", fullName: id, email: null, emailVerified: false, whatsapp: null, country: null, countryRaw: null,
  dobDay: null, dobMonth: null, city: null, extra: null, contactedAt: null, followUpAssignee: null, followUpNextOn: null,
  registeredAt: null, enrolledAt: "2026-01-01T00:00:00Z", leftAt: null, ...extra,
});
/** Ten lessons a week apart from 5 Jan; `absent` = indexes the student missed; `caught` = made up later. */
function lessons(absent: number[], caught: number[] = []): LessonEventView[] {
  return Array.from({ length: 10 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 5 + i * 7)).toISOString().slice(0, 10);
    return {
      eventId: `e${i}`, cohortId: "c1", date, globalIndex: i, classNumber: 1, classIndex: 0, lessonRef: `L${i + 1}`, lessonTitle: "", edited: false,
      register: {
        eventId: `e${i}`, attendance: { a: absent.includes(i) ? "absent" : "present" }, recordedBy: null, recordedAt: `${date}T10:00:00Z`,
        updatedBy: null, updatedAt: null, caughtUp: caught.includes(i) ? ["a"] : [],
      },
    };
  });
}
const check = (s: Student, ls: LessonEventView[], outcome: "catchup" | "resolved" | null, threshold = 85) => {
  const a = aggregateCohort([s], ls, bandsOf(ruleA), TODAY).roster[0];
  return graduationCheck(a, true, studentIntervention(a, outcome, TODAY), threshold);
};

describe("graduation", () => {
  it("graduates with every lesson delivered, attendance ≥ 85% and nothing open", () => {
    const g = check(student("a"), lessons([3]), null); // 9/10 = 90%
    expect(g).toMatchObject({ graduated: true, attendance: 90, lessonsComplete: true, interventionsResolved: true });
  });

  it("doesn't graduate below the threshold", () => {
    expect(check(student("a"), lessons([1, 2]), null).graduated).toBe(false); // 80%
  });

  it("an open catch-up blocks graduation; completing it lets them graduate — the absence still counts", () => {
    const open = check(student("a"), lessons([3]), "catchup"); // missed lesson 4, not yet made up
    expect(open).toMatchObject({ attendance: 90, attendanceMet: true, interventionsResolved: false, graduated: false });
    const done = check(student("a"), lessons([3], [3]), "catchup");
    expect(done).toMatchObject({ attendance: 90, interventionsResolved: true, graduated: true });
  });

  it("only counts lessons held while the student was enrolled", () => {
    // Joined before lesson 4: lessons 1–3 aren't owed, so 7/7 = 100%.
    const late = student("a", { enrolledAt: "2026-01-20T00:00:00Z" });
    const g = check(late, lessons([0, 1, 2]), null);
    expect(g).toMatchObject({ attendance: 100, graduated: true });
  });

  it("is a lifecycle milestone derived from the facts", () => {
    const s = aggregateCohort([student("a")], lessons([3]), bandsOf(ruleA), TODAY).roster[0];
    expect(studentLifecycle(s, true, true)).toBe("graduated");
    expect(studentLifecycle(s, true, false)).toBe("completed");
    expect(studentLifecycle({ ...s, leftAt: "2026-02-01" }, true, true)).toBe("left");
  });

  it("a finished cohort is judged by the policy in force when it finished", () => {
    const cohort: Cohort = {
      id: "c1", slug: "c1", name: "C1", city: null, startDate: "2026-01-05", teachingDays: [1], facilitatorName: null,
      status: "running", lessonsPerSession: 1, intervalWeeks: 1, orgUnitId: null, createdAt: "2026-01-01T00:00:00Z",
    };
    // 80% attendance; finished in March 2026. A later, looser policy (graduation 75%
    // from 2027) must not change who graduated in 2026.
    const facts = (today: string) =>
      cohortFacts({
        cohort, students: [student("a")], lessonEvents: lessons([1, 2]), segments: [], latestOutcomeKind: new Map(), facilitatorNames: [],
        policies: [ruleA, v(2, "2027-01-01", 70, 50, 75)], today,
      });
    expect(facts("2027-06-01").graduated).toBe(0);
    expect(facts("2027-06-01").phase).toBe("finished");
  });
});
