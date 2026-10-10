import { describe, expect, it } from "vitest";
import { compareStatus, managementReason, statusLabel, unitStatus } from "./status";
import { activeOn, deliveryBetween, monthlyDelivery, sumFacts, type CohortFacts } from "./rollup";

const bands = { activeThreshold: 85, helpThreshold: 60 };
const totals = (over: Partial<ReturnType<typeof sumFacts>> = {}) => ({ ...sumFacts([], "2026-10-07"), running: 4, active: 100, onTrack: 100, ...over });
const att = (rate: number | null) => ({ present: 0, expected: rate == null ? 0 : 100, rate });
const del = (rate: number | null, due = 100) => ({ due: rate == null ? 0 : due, recorded: rate == null ? 0 : Math.round((due * rate) / 100), rate });

describe("organisational status", () => {
  it("is Good when nothing is out of line — with no reasons to list", () => {
    expect(unitStatus({ totals: totals(), attendance: att(92), attendancePrev: 90, delivery: del(95), bands })).toEqual({ status: "good", signals: [] });
  });

  it("explains a Needs attention status", () => {
    const s = unitStatus({ totals: totals({ atRisk: 12, behind: 1 }), attendance: att(80), attendancePrev: 88, delivery: del(85), bands });
    expect(s.status).toBe("attention");
    expect(s.signals.map((x) => x.key)).toEqual(expect.arrayContaining(["attendance", "attendanceDrop", "atRisk", "behind"]));
    expect(s.signals.find((x) => x.key === "atRisk")?.text).toBe("12 of 100 students at risk");
  });

  it("is Critical on a serious signal, listed first", () => {
    const s = unitStatus({ totals: totals(), attendance: att(90), attendancePrev: null, delivery: del(25), bands });
    expect(s.status).toBe("critical");
    expect(s.signals[0]).toMatchObject({ key: "delivery", severity: "critical", text: "Delivery 25% — 75 registers not recorded" });
  });

  it("never treats missing registers as low attendance", () => {
    // Attendance on recorded lessons is fine; the problem is delivery.
    const s = unitStatus({ totals: totals(), attendance: att(95), attendancePrev: null, delivery: del(30), bands });
    expect(s.signals.map((x) => x.key)).toEqual(["delivery"]);
  });

  it("is quiet with nothing running", () => {
    expect(unitStatus({ totals: totals({ running: 0, active: 0, onTrack: 0 }), attendance: att(null), attendancePrev: null, delivery: del(null), bands }).status).toBe("quiet");
  });

  it("orders worst first", () => {
    const good = unitStatus({ totals: totals(), attendance: att(95), attendancePrev: null, delivery: del(95), bands });
    const bad = unitStatus({ totals: totals(), attendance: att(40), attendancePrev: null, delivery: del(20), bands });
    expect([good, bad].sort(compareStatus)[0]).toBe(bad);
  });
});

describe("delivery and growth", () => {
  const f = {
    lessonsDue: [
      { date: "2026-08-03", recorded: true },
      { date: "2026-08-10", recorded: false },
      { date: "2026-09-07", recorded: true },
    ],
    spans: [
      { enrolled: "2026-07-01", left: null },
      { enrolled: "2026-09-01", left: null },
      { enrolled: "2026-07-01", left: "2026-08-15" },
    ],
    finishedOn: null,
  } as unknown as CohortFacts;

  it("delivery is recorded ÷ due, by window and by month", () => {
    expect(deliveryBetween([f], null, "2026-10-07")).toEqual({ due: 3, recorded: 2, rate: 67 });
    expect(monthlyDelivery([f], "2026-10-07", 3).map((m) => m.rate)).toEqual([50, 100, null]);
  });

  it("counts students active on a date", () => {
    expect(activeOn([f], "2026-08-01")).toBe(2);
    expect(activeOn([f], "2026-09-15")).toBe(2);
  });
});

describe("what a parent is told about a child", () => {
  const keys = ["attendance", "attendanceDrop", "delivery", "atRisk", "behind", "inactive", "overdue"] as const;

  it("every reason is plain words — no figures, percentages or student detail", () => {
    for (const key of keys)
      for (const severity of ["critical", "attention"] as const) {
        const text = managementReason({ key, severity, text: "Attendance 83% (below 85%)" });
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/\d|%/);
      }
    expect(managementReason(undefined)).toBeNull();
  });

  it("a running level too small to judge isn't called inactive", () => {
    expect(statusLabel("quiet", 4)).toBe("Not enough data yet");
    expect(statusLabel("quiet", 0)).toBe("No activity");
    expect(statusLabel("critical", 40)).toBe("At risk");
  });
});
