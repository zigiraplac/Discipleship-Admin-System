import type { OrgUnitDetails, OrgUnitType } from "./types";

/**
 * A level's own details (stored in org_unit.details): optional general
 * contact — email, phone, description — for every level, plus a few
 * level-specific fields. These are the *unit's* contact details; a
 * leader's name and email come from their account, never from here.
 */

export type DetailKey = keyof OrgUnitDetails;

/** Every level may have these. */
export const CONTACT_FIELDS: DetailKey[] = ["email", "phone", "description"];

/** And these, depending on the level. */
export const LEVEL_FIELDS: Record<OrgUnitType, DetailKey[]> = {
  hq: [],
  continent: [],
  country: ["timeZone", "languages"],
  region: ["area"],
  site: ["city", "address"],
  promotion: ["startYear", "endYear"],
};

export const fieldsFor = (type: OrgUnitType): DetailKey[] => [...LEVEL_FIELDS[type], ...CONTACT_FIELDS];

const TEXT_MAX = 120;
const DESCRIPTION_MAX = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with the usual separators; 6–15 digits (E.164 allows 15). */
const PHONE = /^\+?[\d\s().-]+$/;

/** One field's value, checked; undefined = empty. Throws a message fit for the form. */
function cleanField(key: DetailKey, raw: unknown): string | number | undefined {
  if (raw == null) return undefined;
  if (key === "startYear" || key === "endYear") {
    if (raw === "") return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new Error(`${key === "startYear" ? "Start" : "End"} year should be a four-digit year, like 2027.`);
    return n;
  }
  const text = String(raw).trim().replace(/\s+/g, " ");
  if (!text) return undefined;
  if (key === "email") {
    if (text.length > 254 || !EMAIL.test(text)) throw new Error("That email address doesn't look right.");
    return text.toLowerCase();
  }
  if (key === "phone") {
    const digits = text.replace(/\D/g, "").length;
    if (!PHONE.test(text) || digits < 6 || digits > 15) throw new Error("That phone number doesn't look right.");
    return text;
  }
  if (key === "description") {
    if (text.length > DESCRIPTION_MAX) throw new Error(`Keep the description under ${DESCRIPTION_MAX} characters.`);
    return text;
  }
  return text.slice(0, TEXT_MAX);
}

function checkPromotionYears(d: OrgUnitDetails) {
  if (d.startYear == null) throw new Error("Start year should be a four-digit year, like 2027.");
  if (d.endYear == null || d.endYear < d.startYear || d.endYear > d.startYear + 10) throw new Error("End year can't be before the start year.");
}

/** Details for a new level: only the fields that level has, each checked. */
export function cleanUnitDetails(type: OrgUnitType, input: Partial<Record<DetailKey, unknown>>): OrgUnitDetails {
  const out: Record<string, string | number> = {};
  for (const key of fieldsFor(type)) {
    const v = cleanField(key, input[key]);
    if (v !== undefined) out[key] = v;
  }
  if (type === "promotion") checkPromotionYears(out as OrgUnitDetails);
  return out as OrgUnitDetails;
}

/**
 * Editing a level's details. A field left out of `patch` keeps its current
 * value; an empty one is cleared; anything else is checked and replaces
 * it. Fields this level doesn't have are ignored, and stored values the
 * form doesn't show are kept as they are.
 */
export function mergeUnitDetails(type: OrgUnitType, current: OrgUnitDetails, patch: Partial<Record<DetailKey, unknown>>): OrgUnitDetails {
  const out: Record<string, unknown> = { ...current };
  for (const key of fieldsFor(type)) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const v = cleanField(key, patch[key]);
    if (v === undefined) delete out[key];
    else out[key] = v;
  }
  if (type === "promotion") checkPromotionYears(out as OrgUnitDetails);
  return out as OrgUnitDetails;
}

/** Which fields actually changed — for the audit entry. */
export function changedDetails(before: OrgUnitDetails, after: OrgUnitDetails): Record<string, string | null> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as DetailKey[]);
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    if (before[k] !== after[k]) out[k] = after[k] == null ? null : String(after[k]);
  }
  return out;
}
