/**
 * Responsibility-bounded access. Every leader is responsible for their own
 * scope; a parent monitors its direct children (status, who's responsible,
 * how to reach them) but doesn't open a child that has its own leader —
 * it asks that leader. A level with no leader of its own is managed by the
 * nearest level above it that has one (or that you hold), so it is yours
 * to open until someone is appointed.
 */

export interface UnitNode {
  id: string;
  parentId: string | null;
}

/** May this person open this level's pages? Their own levels, plus levels
 * below them with nobody responsible in between (unstaffed). */
export function isResponsibleFor(
  unitId: string,
  ownIds: Set<string>,
  byId: Map<string, UnitNode>,
  hasLeader: (unitId: string) => boolean
): boolean {
  if (ownIds.has(unitId)) return true;
  if (hasLeader(unitId)) return false;
  let p = byId.get(unitId)?.parentId ?? null;
  while (p) {
    if (ownIds.has(p)) return true;
    if (hasLeader(p)) return false;
    p = byId.get(p)?.parentId ?? null;
  }
  return false;
}

/** Who answers for a level: its own leaders, or — if it has none — the
 * nearest level above that has (null at the top with nobody). */
export function responsibleFor<U extends UnitNode>(
  unit: U,
  byId: Map<string, U>,
  hasLeader: (unitId: string) => boolean
): { unit: U; own: boolean } | null {
  let cur: U | undefined = unit;
  while (cur) {
    if (hasLeader(cur.id)) return { unit: cur, own: cur.id === unit.id };
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}

/**
 * Who staffs a level: the level above it — or, if that level has nobody
 * appointed, the nearest staffed level further up (the top level always
 * counts). A leader never appoints, moves or removes people on their own
 * level; that authority sits with the level that oversees it.
 */
export function stewardOf(unit: UnitNode, byId: Map<string, UnitNode>, hasLeader: (unitId: string) => boolean): string | null {
  let p = unit.parentId;
  while (p) {
    const node = byId.get(p);
    if (!node) return null;
    if (hasLeader(p) || !node.parentId) return p;
    p = node.parentId;
  }
  return null;
}

/**
 * Who assigns a cohort's facilitators and teachers: the leader of the
 * cohort's own level (normally its promotion); if it has none, its church;
 * then the nearest staffed level above; the top level (the system
 * administrator) only when nobody is appointed anywhere above. `skipped`
 * lists the unstaffed levels passed on the way, so the screen can say why
 * ("…because Promotion 2026–2027 and Kigali East Church have no leader").
 */
export function cohortStewardOf<U extends UnitNode>(
  cohortUnitId: string,
  byId: Map<string, U>,
  hasLeader: (unitId: string) => boolean
): { stewardId: string | null; skipped: U[] } {
  const skipped: U[] = [];
  let cur = byId.get(cohortUnitId);
  while (cur) {
    if (hasLeader(cur.id) || !cur.parentId) return { stewardId: cur.id, skipped };
    skipped.push(cur);
    cur = byId.get(cur.parentId);
  }
  return { stewardId: null, skipped };
}
