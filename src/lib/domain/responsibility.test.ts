import { describe, expect, it } from "vitest";
import { cohortStewardOf, isResponsibleFor, responsibleFor, stewardOf } from "./responsibility";

// HQ › Africa (no leader) › Rwanda (Joshua) › Kigali City (Shalom) › Church (no leader)
const units = [
  { id: "hq", parentId: null },
  { id: "africa", parentId: "hq" },
  { id: "rwanda", parentId: "africa" },
  { id: "kigali", parentId: "rwanda" },
  { id: "church", parentId: "kigali" },
  { id: "asia", parentId: "hq" },
];
const byId = new Map(units.map((u) => [u.id, u]));
const leaders = new Set(["rwanda", "kigali", "asia"]);
const hasLeader = (id: string) => leaders.has(id);
const can = (own: string[], id: string) => isResponsibleFor(id, new Set(own), byId, hasLeader);

describe("responsibility-bounded access", () => {
  it("your own level", () => {
    expect(can(["rwanda"], "rwanda")).toBe(true);
  });

  it("a child with its own leader is theirs — the parent doesn't open it", () => {
    expect(can(["hq"], "asia")).toBe(false);
    expect(can(["rwanda"], "kigali")).toBe(false);
  });

  it("an unstaffed level is managed by the nearest responsible level above", () => {
    expect(can(["hq"], "africa")).toBe(true); // Africa has no leader → HQ manages it
    expect(can(["kigali"], "church")).toBe(true);
  });

  it("never skips past a level with its own leader", () => {
    expect(can(["hq"], "rwanda")).toBe(false); // Rwanda has Joshua
    expect(can(["hq"], "church")).toBe(false); // Kigali City has Shalom in between
  });

  it("names who answers for a level", () => {
    expect(responsibleFor(byId.get("church")!, byId, hasLeader)).toEqual({ unit: byId.get("kigali"), own: false });
    expect(responsibleFor(byId.get("rwanda")!, byId, hasLeader)).toEqual({ unit: byId.get("rwanda"), own: true });
  });
});

describe("who staffs a level", () => {
  it("the level above — or the nearest staffed level further up", () => {
    expect(stewardOf(byId.get("kigali")!, byId, hasLeader)).toBe("rwanda");
    expect(stewardOf(byId.get("rwanda")!, byId, hasLeader)).toBe("hq"); // Africa is unstaffed
    expect(stewardOf(byId.get("africa")!, byId, hasLeader)).toBe("hq");
    expect(stewardOf(byId.get("hq")!, byId, hasLeader)).toBeNull(); // the top is the system administrator's
  });
});

describe("who assigns a cohort's facilitators and teachers", () => {
  // HQ › Rwanda (leader) › Church (leader?) › Promotion (leader?)
  const tree = new Map(
    [
      { id: "hq", parentId: null, name: "HQ" },
      { id: "rw", parentId: "hq", name: "Rwanda" },
      { id: "ch", parentId: "rw", name: "Kigali East Church" },
      { id: "pr", parentId: "ch", name: "Promotion 2026–2027" },
    ].map((u) => [u.id, u])
  );
  const staffed = (ids: string[]) => (id: string) => ids.includes(id);

  it("the promotion leader when there is one", () => {
    expect(cohortStewardOf("pr", tree, staffed(["pr", "ch", "rw"]))).toEqual({ stewardId: "pr", skipped: [] });
  });

  it("the church leader when the promotion has none — and says why", () => {
    const r = cohortStewardOf("pr", tree, staffed(["ch", "rw"]));
    expect(r.stewardId).toBe("ch");
    expect(r.skipped.map((u) => u.name)).toEqual(["Promotion 2026–2027"]);
  });

  it("then the nearest staffed level, then the top", () => {
    expect(cohortStewardOf("pr", tree, staffed(["rw"])).stewardId).toBe("rw");
    expect(cohortStewardOf("pr", tree, staffed([])).stewardId).toBe("hq");
  });
});
