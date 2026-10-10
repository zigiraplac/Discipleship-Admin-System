import { describe, expect, it } from "vitest";
import { canSitInside, nextLevel } from "./levels";

describe("the hierarchy is strict: each level sits directly in the one above", () => {
  const chain = [
    ["continent", "hq"],
    ["country", "continent"],
    ["region", "country"],
    ["site", "region"],
    ["promotion", "site"],
    ["cohort", "promotion"],
  ] as const;

  it("allows exactly the next level down", () => {
    for (const [child, parent] of chain) {
      expect(canSitInside(child, parent)).toBe(true);
      expect(nextLevel(parent)).toBe(child);
    }
  });

  it("never skips a level", () => {
    expect(canSitInside("region", "continent")).toBe(false); // region straight under a continent
    expect(canSitInside("site", "country")).toBe(false); // church without a region
    expect(canSitInside("promotion", "region")).toBe(false);
    expect(canSitInside("cohort", "site")).toBe(false); // cohort without a promotion
  });

  it("never goes upward, sideways, or creates another HQ", () => {
    expect(canSitInside("continent", "country")).toBe(false);
    expect(canSitInside("country", "country")).toBe(false);
    expect(canSitInside("hq", "hq")).toBe(false);
  });
});
