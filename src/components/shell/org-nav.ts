import { GearSix, SquaresFour, TreeStructure, UsersThree, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { OrgUnitType } from "@/lib/domain/types";
import type { Workspace } from "@/lib/authz/nav";

/** The sections of a level page (/u/[unit]/...). The Overview is the
 * dashboard; "children" manages the boxes (or cohorts) directly inside;
 * Staff manages the people leading them; Needs attention only exists
 * on every level, linking to the scoped pages behind each number; Settings
 * (leaders only) holds the rules everything below follows. */
export type UnitSectionId = "overview" | "children" | "staff" | "attention" | "settings";

export interface UnitSection {
  id: UnitSectionId;
  label: string;
  /** Appended to /u/[unit]. */
  path: string;
  icon: Icon;
  /** Only these levels get the section (all levels when omitted). */
  levels?: OrgUnitType[];
  /** Only shown to the level's leader. */
  leaderOnly?: boolean;
}

export const UNIT_SECTIONS: UnitSection[] = [
  { id: "overview", label: "Overview", path: "", icon: SquaresFour },
  // Labelled per level ("Continents", "Countries", … "Cohorts") — see childrenLabelFor.
  { id: "children", label: "Inside", path: "/inside", icon: TreeStructure },
  // Every level has staff to look after — a promotion its cohorts' facilitators and teachers.
  { id: "staff", label: "Staff", path: "/staff", icon: UsersThree },
  // Exception-first at every level (counts only above the cohort).
  { id: "attention", label: "Needs attention", path: "/attention", icon: WarningCircle },
  { id: "settings", label: "Settings", path: "/settings", icon: GearSix, leaderOnly: true },
];

/** What a level calls the things directly inside it. */
export function childrenLabelFor(type: OrgUnitType): string {
  return { hq: "Continents", continent: "Countries", country: "Regions", region: "Churches", site: "Promotions", promotion: "Cohorts" }[type];
}

export function sectionsFor(type: OrgUnitType, isLeader = false): UnitSection[] {
  return UNIT_SECTIONS.filter((s) => (!s.levels || s.levels.includes(type)) && (!s.leaderOnly || isLeader)).map((s) =>
    s.id === "children" ? { ...s, label: childrenLabelFor(type) } : s
  );
}

export function unitHref(slug: string, section: UnitSectionId = "overview"): string {
  const s = UNIT_SECTIONS.find((x) => x.id === section)!;
  return `/u/${slug}${s.path}`;
}

/** Plain data the server hands the (client) sidebar — no icons, no functions. */
export interface OrgNav {
  /** What the page is about: a level (its sections) or a cohort (its pages). */
  context: "unit" | "cohort";
  /** Page ids this person may open here (cohort pages + Cohorts/Accounts),
   * from their capabilities — see authz/nav.ts. */
  allowedNav: string[];
  /** Every place this person works, with their role there. */
  workspaces: Workspace[];
  /** href of the workspace currently shown, if it's one of theirs. */
  activeWorkspace: string | null;
  /** The boxes this person has a role on, highest first. */
  units: { slug: string; name: string; levelLabel: string }[];
  /** The box being shown — on a level page, or the person's own top box
   * everywhere else, so its menu never disappears. */
  current: null | {
    slug: string;
    name: string;
    type: OrgUnitType;
    levelLabel: string;
    /** "Africa › Rwanda" — the boxes above it, for context. */
    partOf: string;
    sections: { id: UnitSectionId; label: string }[];
    attention: { count: number; urgent: boolean };
  };
}
