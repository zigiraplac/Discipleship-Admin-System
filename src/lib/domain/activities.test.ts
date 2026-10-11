import { describe, expect, it } from "vitest";
import { activityKinds, normalizeActivityKind } from "./activities";

describe("normalizeActivityKind", () => {
  it("maps any spelling of a built-in kind onto it", () => {
    expect(normalizeActivityKind("  agape ")).toBe("Agape");
    expect(normalizeActivityKind("FELLOWSHIP")).toBe("Fellowship");
  });

  it("keeps a new kind as typed, with spaces tidied", () => {
    expect(normalizeActivityKind(" Prayer   night ")).toBe("Prayer night");
  });
});

describe("activityKinds", () => {
  it("lists built-in kinds first, then the cohort's own A–Z, once each", () => {
    expect(activityKinds(["Outing", "agape", "Prayer night", "Outing"])).toEqual(["Agape", "Fellowship", "Outing", "Prayer night"]);
  });
});
