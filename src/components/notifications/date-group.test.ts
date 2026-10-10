import { describe, expect, it } from "vitest";
import { dateGroup } from "./notifications-center";

describe("notification date groups", () => {
  // Saturday 10 October 2026, mid-afternoon.
  const now = new Date(2026, 9, 10, 15, 0);
  it("Today, Yesterday, Earlier this week (since Monday), Older", () => {
    expect(dateGroup(new Date(2026, 9, 10, 8, 0).toISOString(), now)).toBe("Today");
    expect(dateGroup(new Date(2026, 9, 9, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(dateGroup(new Date(2026, 9, 5, 9, 0).toISOString(), now)).toBe("Earlier this week");
    expect(dateGroup(new Date(2026, 9, 4, 9, 0).toISOString(), now)).toBe("Older");
  });
});
