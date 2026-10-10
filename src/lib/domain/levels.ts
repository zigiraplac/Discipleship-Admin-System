import type { OrgUnit, OrgUnitType } from "./types";

/** Top to bottom. Cohorts sit below "promotion" (or directly in a site). */
export const LEVEL_ORDER: OrgUnitType[] = ["hq", "continent", "country", "region", "site", "promotion"];

interface LevelInfo {
  label: string;
  plural: string;
  /** The question this level's Overview answers. */
  question: string;
}

/** "site" is stored as site and shown as "Church" everywhere. */
export const LEVELS: Record<OrgUnitType, LevelInfo> = {
  hq: { label: "HQ", plural: "HQ", question: "How is the whole network doing?" },
  continent: { label: "Continent", plural: "Continents", question: "How is this continent doing, and which countries need attention?" },
  country: { label: "Country", plural: "Countries", question: "How is this country doing, and which regions need attention?" },
  region: { label: "Region", plural: "Regions", question: "Which churches, promotions and cohorts need attention?" },
  site: { label: "Church", plural: "Churches", question: "What is happening at this church today, and who needs attention?" },
  promotion: { label: "Promotion", plural: "Promotions", question: "How are this promotion's cohorts progressing?" },
};

export function levelRank(type: OrgUnitType): number {
  return LEVEL_ORDER.indexOf(type);
}

/** The level a new box created inside `type` gets — always exactly the
 * next one (HQ › continent › country › region › church › promotion ›
 * cohort); levels are never skipped. */
export function nextLevel(type: OrgUnitType): OrgUnitType | "cohort" {
  return type === "promotion" ? "cohort" : LEVEL_ORDER[levelRank(type) + 1];
}

/** May a `child` be placed directly inside a `parent`? Only the next level
 * down — a country under a continent, a cohort under a promotion. The one
 * rule the server enforces for every new box and cohort. */
export function canSitInside(child: OrgUnitType | "cohort", parent: OrgUnitType): boolean {
  return child !== "hq" && nextLevel(parent) === child;
}

/** Label for "the things directly inside" a box — the type most of its
 * children actually are (levels can be skipped), else the next level. */
export function childrenLabel(unit: OrgUnit, children: OrgUnit[], hasCohorts: boolean): { label: string; plural: string } {
  if (unit.type === "promotion" || (!children.length && hasCohorts)) return { label: "Cohort", plural: "Cohorts" };
  const counts = new Map<OrgUnitType, number>();
  for (const c of children) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const type = top ?? (nextLevel(unit.type) as OrgUnitType);
  return { label: LEVELS[type].label, plural: LEVELS[type].plural };
}

export function isDescendant(unit: OrgUnit, ancestor: OrgUnit): boolean {
  return unit.path.startsWith(`${ancestor.path}.`);
}

/** Every box inside `unit` (not including itself). */
export function descendantsOf(unit: OrgUnit, all: OrgUnit[]): OrgUnit[] {
  return all.filter((u) => isDescendant(u, unit));
}

/** `unit` and every box above it, top first. */
export function ancestryOf(unit: OrgUnit, all: OrgUnit[]): OrgUnit[] {
  const byId = new Map(all.map((u) => [u.id, u]));
  const out: OrgUnit[] = [];
  let cur: OrgUnit | undefined = unit;
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** Turn a name into a URL-safe slug. */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "box"
  );
}
