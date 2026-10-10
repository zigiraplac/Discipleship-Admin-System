import { describe, expect, it } from "vitest";
import { routeRecipients, type RoutingContext } from "./notify-routing";

// HQ › Asia (leader "asia-lead") › Turkey › Ankara Church › Promotion (no leaders below Asia)
function ctx(leaders: Record<string, string[]>): RoutingContext {
  const units = [
    { id: "hq", parentId: null },
    { id: "asia", parentId: "hq" },
    { id: "turkey", parentId: "asia" },
    { id: "church", parentId: "turkey" },
    { id: "promo", parentId: "church" },
  ];
  return {
    units: new Map(units.map((u) => [u.id, u])),
    leaders: new Map(Object.entries(leaders)),
    topLeaders: ["admin"],
    cohorts: new Map([["c4", { unitId: "promo", team: ["fac", "teach"], facilitators: ["fac"] }]]),
    allStaff: ["admin", "asia-lead", "fac", "teach"],
  };
}
const ids = (rs: { userId: string; audience: string }[]) => rs.map((r) => `${r.userId}:${r.audience}`);

describe("pastoral notifications", () => {
  it("go to the cohort's facilitators only — never its teachers or any leader", () => {
    expect(ids(routeRecipients({ type: "cohort_pastoral", cohortId: "c4" }, ctx({ promo: ["esther"], asia: ["asia-lead"] })))).toEqual(["fac:team"]);
  });

  it("someone who is both facilitator and a leader hears once", () => {
    const c = ctx({ promo: ["fac"] });
    expect(ids(routeRecipients({ type: "cohort_attention", cohortId: "c4" }, c)).filter((x) => x.startsWith("fac:"))).toEqual(["fac:team"]);
  });
});

describe("operational notifications", () => {
  it("something happened in a cohort → its team only", () => {
    expect(ids(routeRecipients({ type: "cohort_operational", cohortId: "c4" }, ctx({ asia: ["asia-lead"] })))).toEqual(["fac:team", "teach:team"]);
  });

  it("needs action → team + the leader responsible for the cohort (nearest staffed level), never every admin", () => {
    const r = routeRecipients({ type: "cohort_attention", cohortId: "c4" }, ctx({ asia: ["asia-lead"] }));
    expect(ids(r)).toEqual(["fac:team", "teach:team", "asia-lead:responsible"]);
    expect(r.find((x) => x.userId === "asia-lead")?.unitId).toBe("asia");
  });

  it("the promotion leader when there is one — nobody above them", () => {
    expect(ids(routeRecipients({ type: "cohort_attention", cohortId: "c4" }, ctx({ promo: ["esther"], asia: ["asia-lead"] })))).toEqual([
      "fac:team",
      "teach:team",
      "esther:responsible",
    ]);
  });

  it("the top level (administrator) only when nobody is appointed anywhere above", () => {
    expect(ids(routeRecipients({ type: "cohort_attention", cohortId: "c4" }, ctx({})))).toEqual(["fac:team", "teach:team", "admin:responsible"]);
  });

  it("someone on the team who is also responsible hears once, as team; the actor is left out", () => {
    expect(ids(routeRecipients({ type: "cohort_attention", cohortId: "c4" }, ctx({ promo: ["fac"] }), ["teach"]))).toEqual(["fac:team"]);
  });
});

describe("staffing notifications", () => {
  it("a leader appointed → that person + the leaders of the level that oversees it", () => {
    expect(ids(routeRecipients({ type: "staff_level", personId: "new", unitId: "turkey", role: "leader" }, ctx({ asia: ["asia-lead"] })))).toEqual([
      "new:person",
      "asia-lead:overseer",
    ]);
  });

  it("a viewer appointed, or a cohort assignment → just that person", () => {
    expect(ids(routeRecipients({ type: "staff_level", personId: "v", unitId: "turkey", role: "viewer" }, ctx({ asia: ["asia-lead"] })))).toEqual(["v:person"]);
    expect(ids(routeRecipients({ type: "staff_cohort", personId: "fac", cohortId: "c4" }, ctx({})))).toEqual(["fac:person"]);
  });
});

describe("network notifications", () => {
  it("everyone, except whoever made the change", () => {
    expect(ids(routeRecipients({ type: "network" }, ctx({}), ["admin"]))).toEqual(["asia-lead:everyone", "fac:everyone", "teach:everyone"]);
  });
});
