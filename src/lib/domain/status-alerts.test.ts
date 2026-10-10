import { describe, expect, it } from "vitest";
import { alertStatus, nextStatusState, type StatusState } from "./status";
import { sumFacts } from "./rollup";
import { routeRecipients, type RoutingContext } from "./notify-routing";

const bands = { activeThreshold: 85, helpThreshold: 60 };
const totals = (over: Partial<ReturnType<typeof sumFacts>> = {}) => ({ ...sumFacts([], "2026-10-08"), running: 4, active: 100, onTrack: 100, ...over });
const att = (rate: number | null) => ({ present: 0, expected: rate == null ? 0 : 100, rate });

describe("alert status (finalised rules)", () => {
  const base = { attendancePrev: null, recordedLessons: 20, bands };

  it("leaves delivery out — an unrecorded register can't make a level red", () => {
    // Attendance on recorded lessons is fine; there's no delivery input at all.
    expect(alertStatus({ ...base, totals: totals(), attendance: att(92) }).status).toBe("good");
  });

  it("critical on at-risk attendance or a quarter of students at risk", () => {
    expect(alertStatus({ ...base, totals: totals(), attendance: att(55) }).status).toBe("critical");
    expect(alertStatus({ ...base, totals: totals({ atRisk: 30 }), attendance: att(90) }).status).toBe("critical");
  });

  it("leaves schedule out for now — it's counted from recorded lessons, so missing registers would fake 'behind'", () => {
    expect(alertStatus({ ...base, totals: totals({ behind: 4 }), attendance: att(90) }).status).toBe("good");
  });

  it("needs attention on attendance below target, 10%+ at risk, or a 5-point drop", () => {
    expect(alertStatus({ ...base, totals: totals(), attendance: att(80) }).status).toBe("attention");
    expect(alertStatus({ ...base, totals: totals({ atRisk: 12 }), attendance: att(90) }).status).toBe("attention");
    expect(alertStatus({ ...base, attendancePrev: 97, totals: totals(), attendance: att(90) }).status).toBe("attention");
  });

  it("ignores always-on noise: one cohort behind, overdue follow-ups, inactive students", () => {
    expect(alertStatus({ ...base, totals: totals({ behind: 1, overdueFollowUps: 9, inactive: 20 }), attendance: att(90) }).status).toBe("good");
  });

  it("stays quiet for a level too small to judge", () => {
    expect(alertStatus({ ...base, totals: totals({ active: 6 }), attendance: att(30) }).status).toBe("quiet");
    expect(alertStatus({ ...base, recordedLessons: 3, totals: totals(), attendance: att(30) }).status).toBe("quiet");
  });
});

describe("status transitions", () => {
  const s = (status: StatusState["status"], extra: Partial<StatusState> = {}): StatusState => ({
    status, pendingStatus: null, pendingSince: null, lastNotifiedStatus: null, lastNotifiedAt: null, ...extra,
  });

  it("first time seen: records a baseline, no alert", () => {
    expect(nextStatusState(null, "critical", "2026-10-08")).toMatchObject({ state: { status: "critical" }, transition: null });
  });

  it("a change must hold on two daily checks before anyone is told", () => {
    const day1 = nextStatusState(s("good"), "critical", "2026-10-08");
    expect(day1.transition).toBeNull();
    expect(day1.state).toMatchObject({ status: "good", pendingStatus: "critical" });
    const day2 = nextStatusState(day1.state, "critical", "2026-10-09");
    expect(day2.transition).toEqual({ from: "good", to: "critical", kind: "worse" });
    expect(day2.state).toMatchObject({ status: "critical", lastNotifiedStatus: "critical", lastNotifiedAt: "2026-10-09" });
  });

  it("flip-flopping never alerts", () => {
    const d1 = nextStatusState(s("good"), "attention", "2026-10-08");
    const d2 = nextStatusState(d1.state, "good", "2026-10-09");
    const d3 = nextStatusState(d2.state, "attention", "2026-10-10");
    expect([d1.transition, d2.transition, d3.transition]).toEqual([null, null, null]);
  });

  it("Critical → Needs attention is told as an improvement; Needs attention → Good is not", () => {
    const up = nextStatusState(s("critical", { pendingStatus: "attention", pendingSince: "2026-10-07" }), "attention", "2026-10-08");
    expect(up.transition).toEqual({ from: "critical", to: "attention", kind: "improved" });
    const fine = nextStatusState(s("attention", { pendingStatus: "good", pendingSince: "2026-10-07" }), "good", "2026-10-08");
    expect(fine.transition).toBeNull();
    expect(fine.state.status).toBe("good");
  });

  it("the same status is alerted at most once a week", () => {
    const again = nextStatusState(
      s("attention", { pendingStatus: "critical", pendingSince: "2026-10-07", lastNotifiedStatus: "critical", lastNotifiedAt: "2026-10-04" }),
      "critical",
      "2026-10-08"
    );
    expect(again.transition).toBeNull();
    expect(again.state.status).toBe("critical");
  });

  it("nothing about becoming or leaving 'no activity'", () => {
    expect(nextStatusState(s("quiet", { pendingStatus: "critical", pendingSince: "2026-10-07" }), "critical", "2026-10-08").transition).toBeNull();
  });
});

describe("who hears about a child's status: one level up only", () => {
  const ctx = (leaders: Record<string, string[]>): RoutingContext => ({
    units: new Map(
      [
        { id: "hq", parentId: null },
        { id: "africa", parentId: "hq" },
        { id: "rwanda", parentId: "africa" },
        { id: "kigali", parentId: "rwanda" },
      ].map((u) => [u.id, u])
    ),
    leaders: new Map(Object.entries(leaders)),
    topLeaders: ["admin"],
    cohorts: new Map(),
    allStaff: [],
  });
  const ids = (r: { userId: string }[]) => r.map((x) => x.userId);

  it("Kigali City changed → Rwanda's leader, not Africa or HQ", () => {
    expect(ids(routeRecipients({ type: "child_status", parentUnitId: "rwanda" }, ctx({ rwanda: ["joshua"], africa: ["tr"] })))).toEqual(["joshua"]);
  });

  it("if the parent has no leader, whoever is responsible for it", () => {
    expect(ids(routeRecipients({ type: "child_status", parentUnitId: "rwanda" }, ctx({ africa: ["tr"] })))).toEqual(["tr"]);
    expect(ids(routeRecipients({ type: "child_status", parentUnitId: "africa" }, ctx({})))).toEqual(["admin"]);
  });
});
