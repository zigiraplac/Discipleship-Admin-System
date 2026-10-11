import { describe, expect, it } from "vitest";
import { placesInside, placesNotSetUp } from "./reference";

const unit = (type: "hq" | "continent" | "country" | "region", name: string, geoCode?: string) => ({
  type,
  name,
  details: geoCode ? { geoCode } : {},
});

describe("official places inside a level", () => {
  it("lists continents at HQ, a continent's countries, a country's regions", () => {
    expect(placesInside(unit("hq", "Global HQ"))?.map((p) => p.name)).toContain("Africa");
    expect(placesInside(unit("continent", "Africa"))?.some((p) => p.code === "RW")).toBe(true);
    expect(placesInside(unit("country", "Rwanda"))?.map((p) => p.code)).toEqual(["RW-01", "RW-02", "RW-03", "RW-05", "RW-04"]);
    expect(placesInside(unit("region", "Eastern"))).toBeNull();
  });

  it("finds a level by its code when its name doesn't match", () => {
    expect(placesInside(unit("country", "Pays des mille collines", "RW"))?.length).toBe(5);
  });

  it("treats small wording differences as the same place", () => {
    const left = placesNotSetUp(unit("country", "Rwanda"), [
      { name: "Kigali City", details: {} },
      { name: "Eastern Province", details: {} },
    ]);
    expect(left.map((p) => p.code).sort()).toEqual(["RW-03", "RW-04", "RW-05"]);
  });
});
