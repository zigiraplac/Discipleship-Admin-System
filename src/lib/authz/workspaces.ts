import { LEVELS } from "@/lib/domain/levels";
import type { Cohort, OrgUnit } from "@/lib/domain/types";
import type { Responsibility } from "./policy";
import type { Workspace } from "./nav";

/** Every workspace a person has. Names that repeat (three "Promotion
 * 2026"s) get the level above them for context. */
export function buildWorkspaces(responsibilities: Responsibility[], units: OrgUnit[], cohorts: Cohort[]): Workspace[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const nameCount = new Map<string, number>();
  for (const u of units) nameCount.set(u.name, (nameCount.get(u.name) ?? 0) + 1);
  const unitTitle = (u: OrgUnit) => {
    const parent = u.parentId ? byId.get(u.parentId) : undefined;
    return (nameCount.get(u.name) ?? 0) > 1 && parent ? `${u.name} · ${parent.name}` : u.name;
  };
  const out: Workspace[] = [];
  for (const r of responsibilities) {
    if (r.kind === "system") {
      const hq = units.find((u) => u.type === "hq" && !u.parentId);
      if (hq) out.push({ kind: "unit", href: `/u/${hq.slug}`, title: hq.name, role: r.role === "admin" ? "Administrator" : "Global viewer" });
    } else if (r.kind === "unit") {
      const u = byId.get(r.unitId);
      if (u) out.push({ kind: "unit", href: `/u/${u.slug}`, title: unitTitle(u), role: `${LEVELS[u.type].label} ${r.role}` });
    } else {
      const c = cohorts.find((x) => x.id === r.cohortId);
      if (c) out.push({ kind: "cohort", href: `/c/${c.slug}`, title: c.name.trim(), role: r.capacity === "facilitator" ? "Facilitator" : "Teacher" });
    }
  }
  return out;
}
