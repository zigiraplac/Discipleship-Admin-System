// Server code only: regions.json is ~200 KB and never needs to reach the browser.
import GEO from "./countries.json";
import REGIONS from "./regions.json";
import type { OrgUnit } from "@/lib/domain/types";

/** An official place a level can be: a continent, a country or a region. */
export interface GeoPlace {
  code: string;
  name: string;
}

const CONTINENTS: GeoPlace[] = GEO.continents;
const COUNTRIES = GEO.countries as (GeoPlace & { numeric: string; continent: string })[];
const REGIONS_BY_COUNTRY = REGIONS as Record<string, (GeoPlace & { type: string })[]>;

/** Compares names loosely: accents, case, punctuation and filler words
 * ("City of Kigali" = "Kigali City", "Eastern Province" = "Eastern"). */
const FILLER = new Set(["the", "of", "city", "province", "region", "state", "district", "county", "department", "republic"]);
function key(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w))
    .sort()
    .join(" ");
}

function findIn(list: GeoPlace[], unit: Pick<OrgUnit, "name" | "details">): GeoPlace | null {
  const code = unit.details?.geoCode;
  if (code) return list.find((p) => p.code === code) ?? null;
  const k = key(unit.name);
  return list.find((p) => key(p.name) === k) ?? null;
}

/** The official places that belong directly inside a level — continents in
 * Global HQ, a continent's countries, a country's top-level regions — or
 * null where there's no official list (below a region). */
export function placesInside(unit: Pick<OrgUnit, "type" | "name" | "details">): GeoPlace[] | null {
  if (unit.type === "hq") return CONTINENTS;
  if (unit.type === "continent") {
    const continent = findIn(CONTINENTS, unit);
    return continent ? COUNTRIES.filter((c) => c.continent === continent.code) : null;
  }
  if (unit.type === "country") {
    const country = findIn(COUNTRIES, unit);
    return country ? (REGIONS_BY_COUNTRY[country.code] ?? []) : null;
  }
  return null;
}

/** Those official places inside a level that nobody has set up yet. */
export function placesNotSetUp(unit: Pick<OrgUnit, "type" | "name" | "details">, children: Pick<OrgUnit, "name" | "details">[]): GeoPlace[] {
  const all = placesInside(unit);
  if (!all) return [];
  const taken = new Set(children.map((c) => findIn(all, c)?.code).filter(Boolean));
  return all.filter((p) => !taken.has(p.code));
}

/** Every country, with its continent's name — for world-wide tables. */
export function allCountries(): (GeoPlace & { continent: string; continentName: string })[] {
  const names = new Map(CONTINENTS.map((c) => [c.code, c.name]));
  return COUNTRIES.map((c) => ({ code: c.code, name: c.name, continent: c.continent, continentName: names.get(c.continent) ?? c.continent }));
}

/** The official country a country-level box is, if it matches one. */
export function officialCountry(unit: Pick<OrgUnit, "name" | "details">): GeoPlace | null {
  return findIn(COUNTRIES, unit);
}
