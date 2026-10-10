import { describe, expect, it } from "vitest";
import { changedDetails, cleanUnitDetails, mergeUnitDetails } from "./unit-details";

describe("a level's own details", () => {
  it("every level can have a general email, phone and description", () => {
    for (const type of ["continent", "country", "region", "site", "promotion"] as const) {
      const extra = type === "promotion" ? { startYear: 2026, endYear: 2027 } : {};
      expect(cleanUnitDetails(type, { email: " Office@BCC.org ", phone: "+250 788 123 456", description: "Main office", ...extra })).toMatchObject({
        email: "office@bcc.org",
        phone: "+250 788 123 456",
        description: "Main office",
      });
    }
  });

  it("keeps only the fields that level has", () => {
    expect(cleanUnitDetails("region", { area: "Gasabo", city: "Kigali", startYear: 2027 })).toEqual({ area: "Gasabo" });
  });

  it("checks email, phone and description", () => {
    expect(() => cleanUnitDetails("country", { email: "not-an-email" })).toThrow(/email/);
    expect(() => cleanUnitDetails("country", { phone: "call me" })).toThrow(/phone/);
    expect(() => cleanUnitDetails("country", { phone: "123" })).toThrow(/phone/);
    expect(() => cleanUnitDetails("country", { description: "x".repeat(501) })).toThrow(/500/);
  });

  it("a promotion still needs sensible years", () => {
    expect(() => cleanUnitDetails("promotion", { startYear: 2027 })).toThrow(/End year/);
    expect(() => cleanUnitDetails("promotion", { startYear: 2027, endYear: 2025 })).toThrow(/End year/);
  });
});

describe("editing details", () => {
  const current = { city: "Kigali", address: "KN 5 Rd", phone: "+250 788 000 000" };

  it("a field left out keeps its value; an empty one is cleared", () => {
    const next = mergeUnitDetails("site", current, { email: "church@bcc.org", address: "" });
    expect(next).toEqual({ city: "Kigali", phone: "+250 788 000 000", email: "church@bcc.org" });
  });

  it("stored values the level doesn't edit are left alone", () => {
    expect(mergeUnitDetails("region", { area: "Gasabo", timeZone: "Africa/Kigali" }, { area: "Kicukiro" })).toEqual({ area: "Kicukiro", timeZone: "Africa/Kigali" });
  });

  it("an invalid value is refused and nothing changes", () => {
    expect(() => mergeUnitDetails("site", current, { email: "nope" })).toThrow(/email/);
  });

  it("a promotion's years can't be cleared", () => {
    expect(() => mergeUnitDetails("promotion", { startYear: 2026, endYear: 2027 }, { endYear: "" })).toThrow(/End year/);
  });

  it("reports exactly what changed, for the audit log", () => {
    expect(changedDetails(current, { ...current, address: undefined, email: "a@b.co" } as never)).toEqual({ address: null, email: "a@b.co" });
  });
});
