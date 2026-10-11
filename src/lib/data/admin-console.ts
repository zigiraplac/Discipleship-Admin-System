import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllUnits, getUnitMembers, getUnitReport } from "@/lib/data/org";
import { getCohortScopesByUser, getPeople } from "@/lib/data/people";
import { allCountries, officialCountry } from "@/lib/geo/reference";
import { ancestryOf } from "@/lib/domain/levels";
import type { OrgUnit } from "@/lib/domain/types";

/*
 * The Super admin console's data: every account, country and promotion in
 * the world. Read with the service role.
 *
 * TODO(permissions): open to every signed-in user for now, on purpose —
 * permissions are to be added (pages under src/app/admin call this).
 */

export interface PlaceRef {
  continent: string;
  country: string;
}

export interface CountryRow {
  code: string;
  name: string;
  continent: string;
  /** Someone has set this country up as a level. */
  setUp: boolean;
  sites: number;
  promotions: number;
  /** Promotions with a cohort running now. */
  activePromotions: number;
  cohorts: number;
  students: number;
  accounts: number;
}

export interface PromotionRow {
  id: string;
  name: string;
  slug: string;
  continent: string;
  country: string;
  site: string;
  cohorts: number;
  runningCohorts: number;
  students: number;
  status: "running" | "finished" | "upcoming" | "empty";
}

/** Continent and country of a box (or of the box a cohort sits in). */
function placeOf(unitId: string | null, units: OrgUnit[], byId: Map<string, OrgUnit>): PlaceRef | null {
  const u = unitId ? byId.get(unitId) : undefined;
  if (!u) return null;
  const chain = [...ancestryOf(u, units), u];
  const continent = chain.find((x) => x.type === "continent");
  const country = chain.find((x) => x.type === "country");
  if (!continent && !country) return null;
  return {
    continent: continent?.name ?? "—",
    country: country ? (officialCountry(country)?.name ?? country.name) : "—",
  };
}

export const loadConsole = cache(async function loadConsole() {
  const admin = createAdminClient();
  const units = await getAllUnits();
  const byId = new Map(units.map((u) => [u.id, u]));
  const hq = units.find((u) => u.type === "hq" && !u.parentId);
  const [report, people, scopesByUser, unitMembers] = await Promise.all([
    hq ? getUnitReport(hq.id) : Promise.resolve(null),
    getPeople(admin),
    getCohortScopesByUser(admin),
    getUnitMembers(),
  ]);
  const facts = report?.facts ?? [];
  const cohortUnit = new Map(facts.map((f) => [f.cohortId, f.orgUnitId]));

  // Where each person serves: their levels, and the cohorts they're in.
  const placesByUser = new Map<string, PlaceRef[]>();
  const addPlace = (userId: string, p: PlaceRef | null) => {
    if (!p) return;
    const list = placesByUser.get(userId) ?? [];
    if (!list.some((x) => x.continent === p.continent && x.country === p.country)) list.push(p);
    placesByUser.set(userId, list);
  };
  for (const [unitId, members] of unitMembers) for (const m of members) addPlace(m.userId, placeOf(unitId, units, byId));
  for (const [userId, scopes] of scopesByUser) for (const s of scopes) addPlace(userId, placeOf(cohortUnit.get(s.cohortId) ?? null, units, byId));

  return { units, byId, facts, people, scopesByUser, unitMembers, placesByUser };
});

/** Every country in the world, with what BCC has there. */
export async function consoleCountries(): Promise<CountryRow[]> {
  const { units, facts, placesByUser } = await loadConsole();
  const countryUnits = units.filter((u) => u.type === "country");
  const insideOf = (root: OrgUnit) => (u: OrgUnit) => u.path.startsWith(`${root.path}.`);
  return allCountries().map((c) => {
    const unit = countryUnits.find((u) => officialCountry(u)?.code === c.code);
    const below = unit ? units.filter(insideOf(unit)) : [];
    const promotions = below.filter((u) => u.type === "promotion");
    const unitIds = new Set([unit?.id, ...below.map((u) => u.id)].filter(Boolean));
    const cohorts = facts.filter((f) => f.orgUnitId && unitIds.has(f.orgUnitId));
    const accounts = [...placesByUser.values()].filter((list) => list.some((p) => p.country === c.name)).length;
    return {
      code: c.code,
      name: c.name,
      continent: c.continentName,
      setUp: !!unit,
      sites: below.filter((u) => u.type === "site").length,
      promotions: promotions.length,
      activePromotions: new Set(cohorts.filter((f) => f.phase === "running").map((f) => f.orgUnitId)).size,
      cohorts: cohorts.length,
      students: cohorts.reduce((n, f) => n + f.registered, 0),
      accounts,
    };
  });
}

/** Every promotion in the world, with where it is and how it's going. */
export async function consolePromotions(): Promise<PromotionRow[]> {
  const { units, byId, facts } = await loadConsole();
  return units
    .filter((u) => u.type === "promotion")
    .map((u) => {
      const place = placeOf(u.id, units, byId);
      const site = u.parentId ? byId.get(u.parentId) : undefined;
      const cohorts = facts.filter((f) => f.orgUnitId === u.id);
      const running = cohorts.filter((f) => f.phase === "running").length;
      return {
        id: u.id,
        name: u.name,
        slug: u.slug,
        continent: place?.continent ?? "—",
        country: place?.country ?? "—",
        site: site && site.type === "site" ? site.name : "—",
        cohorts: cohorts.length,
        runningCohorts: running,
        students: cohorts.reduce((n, f) => n + f.registered, 0),
        status: !cohorts.length
          ? ("empty" as const)
          : running
            ? ("running" as const)
            : cohorts.every((f) => f.phase === "finished")
              ? ("finished" as const)
              : ("upcoming" as const),
      };
    })
    .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
}
