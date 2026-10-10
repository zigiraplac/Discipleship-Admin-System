import { cohortStewardOf, stewardOf, type UnitNode } from "./responsibility";

/**
 * Who hears about what — the one place notification recipients are
 * decided, using the same responsibility rules as access and staffing (no
 * second copy of the organisation's logic). Callers say *what happened*;
 * this says *who can reasonably act on it*.
 *
 *  - pastoral: something only follow-up staff may see (an outcome, a
 *    birthday digest) → the cohort's facilitators only — never its teachers,
 *    who can't open follow-up or pastoral pages.
 *  - operational: something happened in a cohort → its team. When it needs
 *    action ("students never contacted", "crusade next week"), also the
 *    leader responsible for the cohort (promotion → church → nearest
 *    staffed level: cohortStewardOf). Never "every admin" as a fallback.
 *  - staffing: someone's responsibility changed → that person; for a level
 *    leader, also the leaders of the level that oversees it.
 *  - network: a programme-wide change → every active staff member.
 *  - management: a child's status changed → the leaders of its parent, one
 *    level up only (a cohort's parent is its promotion). If the parent has
 *    no leader, whoever is responsible for the parent (nearest staffed
 *    level, then the top). Nothing goes further up.
 */

export type NotifyEvent =
  | { type: "cohort_operational"; cohortId: string }
  | { type: "cohort_attention"; cohortId: string }
  /** Pastoral detail — the cohort's facilitators only. */
  | { type: "cohort_pastoral"; cohortId: string }
  | { type: "staff_level"; personId: string; unitId: string; role: "leader" | "viewer" }
  | { type: "staff_cohort"; personId: string; cohortId: string }
  /** A child's alert status changed (status-alerts). */
  | { type: "child_status"; parentUnitId: string }
  /** Something for one person only (e.g. their welcome). */
  | { type: "person"; personId: string }
  | { type: "network" };

/** Why a person is receiving it — lets the message (and its link) fit
 * what they can actually open. */
export type Audience = "team" | "responsible" | "person" | "overseer" | "everyone";

export interface Recipient {
  userId: string;
  audience: Audience;
  /** For "responsible" / "overseer": the level they answer for (link target). */
  unitId?: string;
}

export interface RoutingContext {
  units: Map<string, UnitNode & { slug?: string }>;
  /** Leaders per level (explicit appointments). */
  leaders: Map<string, string[]>;
  /** The top level's leaders: the administrators (system authority acting as HQ). */
  topLeaders: string[];
  /** cohortId → its level, its team (facilitators + teachers), and which
   * of the team are facilitators (the only ones who see pastoral detail). */
  cohorts: Map<string, { unitId: string | null; team: string[]; facilitators?: string[] }>;
  /** Every active staff member (network messages). */
  allStaff: string[];
}

const leadersOf = (ctx: RoutingContext, unitId: string): string[] => {
  const explicit = ctx.leaders.get(unitId) ?? [];
  const isTop = !ctx.units.get(unitId)?.parentId;
  return explicit.length ? explicit : isTop ? ctx.topLeaders : [];
};
const staffed = (ctx: RoutingContext) => (id: string) => (ctx.leaders.get(id)?.length ?? 0) > 0;

export function routeRecipients(event: NotifyEvent, ctx: RoutingContext, exclude: string[] = []): Recipient[] {
  const out: Recipient[] = [];
  const add = (userId: string, audience: Audience, unitId?: string) => {
    if (exclude.includes(userId) || out.some((r) => r.userId === userId)) return; // first audience wins (team before responsible)
    out.push({ userId, audience, unitId });
  };

  switch (event.type) {
    case "cohort_operational":
    case "cohort_attention": {
      const c = ctx.cohorts.get(event.cohortId);
      if (!c) return out;
      c.team.forEach((id) => add(id, "team"));
      if (event.type === "cohort_attention" && c.unitId) {
        const { stewardId } = cohortStewardOf(c.unitId, ctx.units, staffed(ctx));
        if (stewardId) leadersOf(ctx, stewardId).forEach((id) => add(id, "responsible", stewardId));
      }
      return out;
    }
    case "cohort_pastoral": {
      ctx.cohorts.get(event.cohortId)?.facilitators?.forEach((id) => add(id, "team"));
      return out;
    }
    case "staff_level": {
      add(event.personId, "person", event.unitId);
      const unit = ctx.units.get(event.unitId);
      if (event.role === "leader" && unit) {
        const overseer = stewardOf(unit, ctx.units, staffed(ctx));
        if (overseer) leadersOf(ctx, overseer).forEach((id) => add(id, "overseer", overseer));
      }
      return out;
    }
    case "child_status": {
      const parent = ctx.units.get(event.parentUnitId);
      if (!parent) return out;
      // The parent's own leaders; if it has none, the level responsible for it.
      let cur: (UnitNode & { slug?: string }) | undefined = parent;
      while (cur) {
        const who = leadersOf(ctx, cur.id);
        if (who.length) {
          who.forEach((id) => add(id, "overseer", cur!.id));
          break;
        }
        cur = cur.parentId ? ctx.units.get(cur.parentId) : undefined;
      }
      return out;
    }
    case "staff_cohort":
    case "person":
      add(event.personId, "person");
      return out;
    case "network":
      ctx.allStaff.forEach((id) => add(id, "everyone"));
      return out;
  }
}
