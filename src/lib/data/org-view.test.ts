import { TEST_POLICY } from "@/lib/domain/test-policy";
import { describe, expect, it } from "vitest";
import { childComparison, childStatusRows, cohortComparisonRows, comparisonRows, growthPoints, levelExceptions, levelMetrics } from "./org-view";
import type { UnitReport } from "./org";
import { cohortFacts } from "@/lib/domain/rollup";
import { cohortNavFor } from "@/lib/authz/nav";
import { capabilitiesOn, type Responsibility, type Target } from "@/lib/authz/policy";
import { buildWorkspaces } from "@/lib/authz/workspaces";
import { type Cohort, type LessonEventView, type OrgUnit, type Student } from "@/lib/domain/types";

const TODAY = "2026-03-20";

function unit(id: string, type: OrgUnit["type"], name: string, parentId: string | null, path: string): OrgUnit {
  return { id, type, name, slug: id, parentId, path, details: {} };
}
const units = [
  unit("hq", "hq", "Global HQ", null, "hq"),
  unit("rw", "country", "Rwanda", "hq", "hq.rw"),
  unit("p1", "promotion", "Promotion 2026", "rw", "hq.rw.p1"),
  unit("p2", "promotion", "Promotion 2026", "hq", "hq.p2"),
];

function student(id: string): Student {
  return {
    id, cohortId: "c1", fullName: `Student ${id}`, email: null, emailVerified: false, whatsapp: null, country: null, countryRaw: null,
    dobDay: null, dobMonth: null, city: null, extra: null, contactedAt: null, followUpAssignee: null, followUpNextOn: null,
    registeredAt: null, enrolledAt: "2026-01-01T00:00:00Z", leftAt: null,
  };
}
const lesson = (i: number, date: string, attendance: Record<string, "present" | "absent"> | null): LessonEventView => ({
  eventId: `e${i}`, cohortId: "c1", date, globalIndex: i, classNumber: 1, classIndex: 0, lessonRef: `L${i + 1}`, lessonTitle: "", edited: false,
  register: { eventId: `e${i}`, attendance: attendance ?? {}, recordedBy: null, recordedAt: attendance ? `${date}T10:00:00Z` : null, updatedBy: null, updatedAt: null },
});
const cohort: Cohort = {
  id: "c1", slug: "cohort-01", name: "Cohort 01", city: null, startDate: "2026-01-05", teachingDays: [1], facilitatorName: null,
  status: "running", lessonsPerSession: 1, intervalWeeks: 1, orgUnitId: "p1", createdAt: "2026-01-01T00:00:00Z",
};
const facts = cohortFacts({
  cohort,
  students: [student("a"), student("b")],
  lessonEvents: [lesson(0, "2026-03-02", { a: "absent", b: "present" }), lesson(1, "2026-03-09", { a: "absent", b: "present" }), lesson(2, "2026-03-16", null)],
  segments: [], latestOutcomeKind: new Map(), facilitatorNames: [], policies: TEST_POLICY, today: TODAY,
});
const report: UnitReport = {
  unit: units[1],
  ancestors: [units[0]],
  children: [{ kind: "unit", unit: units[2] }],
  facts: [facts],
  factsByChild: new Map([["p1", [facts]]]),
  pathBelow: new Map([["c1", ["Promotion 2026", "Cohort 01"]]]),
  chainBelow: new Map([["c1", [units[2]]]]),
  today: TODAY,
};

describe("level dashboards", () => {
  it("exceptions are counts that link to scoped pages — never student names", () => {
    const items = levelExceptions(report, "rw");
    expect(items.map((i) => i.key)).toEqual(expect.arrayContaining(["atrisk", "records"]));
    expect(items.find((i) => i.key === "atrisk")).toMatchObject({ count: 1, href: "/u/rw/attention?kind=atrisk", severity: "urgent" });
    expect(items.find((i) => i.key === "records")).toMatchObject({ count: 1, href: "/u/rw/attention?kind=records" });
    expect(JSON.stringify(items)).not.toMatch(/Student a|Student b/);
  });

  it("comparison rows are organizational and drill down", () => {
    const [row] = comparisonRows(report, 30);
    expect(row).toMatchObject({ name: "Promotion 2026", href: "/u/p1", students: 2, atRisk: 1, registersMissing: 1 });
    // Attendance counts recorded lessons only: 2 of 4 seats.
    expect(row.attendance).toBe(50);
  });

  it("a church compares every cohort, labelled with its promotion", () => {
    const [row] = cohortComparisonRows(report, 30);
    expect(row).toMatchObject({ name: "Promotion 2026 · Cohort 01", href: "/c/cohort-01", lessonText: "Lesson 2 / 3" });
  });
});

describe("a parent monitors its children — and stops there", () => {
  const bands = { activeThreshold: 85, helpThreshold: 60 };
  const ctx = (leaders: Map<string, { userId: string; name: string; email: string }[]>) => ({
    leaders,
    cohortStaff: new Map(),
    staffCounts: new Map([["p1", 3]]),
    cohortHref: () => null,
  });
  const joshua = { userId: "u1", name: "Joshua", email: "j@example.org" };

  it("each child has a status in words — never a score or an operational percentage", () => {
    const [row] = childStatusRows(report, bands, ctx(new Map()));
    // 2 active students: too small to judge, but not "no activity".
    expect(row).toMatchObject({ status: "quiet", statusText: "Not enough data yet", reason: null, students: 2, active: 2 });
    expect(row).not.toHaveProperty("score");
    expect(row).not.toHaveProperty("attendance");
    expect(row).not.toHaveProperty("delivery");
    expect(JSON.stringify(row)).not.toMatch(/%/);
  });

  it("names who is responsible and how to reach them; a staffed child doesn't open", () => {
    const [row] = childStatusRows(report, bands, ctx(new Map([["p1", [joshua]]])));
    expect(row.responsible).toEqual({ kind: "people", role: "Promotion leader", people: [joshua] });
    expect(row.href).toBeNull();
    expect(row.staff).toBe(3);
  });

  it("an unstaffed child is managed from here — so it opens", () => {
    const [row] = childStatusRows(report, bands, ctx(new Map()));
    expect(row.responsible).toEqual({ kind: "managed", by: "Rwanda" });
    expect(row.href).toBe("/u/p1");
  });

  it("nothing below a child is surfaced (no grandchild or cohort names)", () => {
    const [row] = childStatusRows(report, bands, ctx(new Map()));
    expect(JSON.stringify(row)).not.toMatch(/Cohort 01/);
  });

  it("the main chart compares the direct children as they are now", () => {
    expect(childComparison(report)).toEqual([{ id: "p1", name: "Promotion 2026", value: 2 }]);
  });

  it("a cohort is linked only for people who work in it", () => {
    const [row] = cohortComparisonRows(report, 30, () => null);
    expect(row.href).toBeNull();
  });
});

describe("dashboard cards (view-model)", () => {
  const byKey = (k: string) => levelMetrics(report, 30, 4).find((m) => m.key === k)!;

  it("organisational levels show reach, activity, graduation and staff — nothing operational", () => {
    expect(levelMetrics(report, 30, 4).map((m) => m.key)).toEqual(["students", "active", "graduated", "staff"]);
  });

  it("each card says exactly what its number is — no ambiguous 'new'", () => {
    expect(byKey("students")).toMatchObject({ label: "Total students", value: "2", context: "0 new enrolments in the last 30 days" });
    expect(byKey("staff")).toMatchObject({ label: "Staff", value: "4", change: null });
  });

  it("graduated comes from the cohort graduation rule, with no change while nothing finished", () => {
    expect(byKey("graduated")).toMatchObject({ value: "0", change: null, context: "No cohort has finished yet" });
  });
});
