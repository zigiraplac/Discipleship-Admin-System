import Papa from "papaparse";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Parsing and de-duplication for a cohort's registration-form export
 * (Google Forms or similar). The guiding rule: never silently discard a
 * person; only exact test rows are dropped, everything else is imported
 * (messy email, messy DOB and all) and shown to a human to untick.
 *
 * Columns are matched by **header name**, not position — confirmed against
 * a real cohort's export (`Names, Gender, dob, marital status, Age range,
 * tel, email, church, country, city`), which doesn't match the previous
 * fixed 8-column assumption at all (no timestamp, a single "Names" field,
 * extra columns this app has no dedicated field for). Every cohort's form
 * can word/order its columns differently — matching by name is what makes
 * that safe instead of silently mis-mapping fields.
 */

/** Recognized column → the header text (lowercased, trimmed, punctuation
 * stripped) that identifies it. First matching header wins if more than
 * one column matches the same alias. */
const HEADER_ALIASES: Record<string, string[]> = {
  timestamp: ["timestamp", "submitted at", "submission date", "submission time"],
  fullName: ["names", "name", "full name", "fullname", "student name"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "e mail", "email address"],
  whatsapp: ["tel", "phone", "whatsapp", "contact", "phone number", "telephone", "mobile"],
  countryRaw: ["country", "nation", "country of residence"],
  city: ["city", "town"],
  dobRaw: ["dob", "date of birth", "birthday", "birth date"],
};

/** The same recognized-column info `parseRegistrationsCsv` matches
 * against, reshaped for display (the upload step's "accepted columns"
 * guide) — one source of truth, so that list can never drift out of sync
 * with what the parser actually accepts. */
export const CSV_COLUMN_GUIDE: { label: string; required: boolean; aliases: string[] }[] = [
  { label: "Full name", required: true, aliases: HEADER_ALIASES.fullName },
  { label: "— or First name + Last name", required: false, aliases: [...HEADER_ALIASES.firstName, ...HEADER_ALIASES.lastName] },
  { label: "Email", required: false, aliases: HEADER_ALIASES.email },
  { label: "WhatsApp / phone", required: false, aliases: HEADER_ALIASES.whatsapp },
  { label: "Country", required: false, aliases: HEADER_ALIASES.countryRaw },
  { label: "City", required: false, aliases: HEADER_ALIASES.city },
  { label: "Date of birth", required: false, aliases: HEADER_ALIASES.dobRaw },
  { label: "Submission time", required: false, aliases: HEADER_ALIASES.timestamp },
];

/** A starter CSV, matching this system's own recognized headers, for
 * whoever's building the actual sign-up form — a real column-name
 * mismatch is much easier to avoid up front than to debug after an
 * import. Any extra/renamed column beyond these still imports fine (see
 * `extra` on `RawRegistrationRow`); this is a helpful starting point, not
 * a strict schema. */
export function buildTemplateCsv(): string {
  const rows = [
    ["Full Name", "Email", "WhatsApp", "Country", "City", "Date of Birth"],
    ["Jane Uwase", "jane@example.com", "0788123456", "Rwanda", "Kigali", "14/03"],
  ];
  return rows.map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RawRegistrationRow {
  timestamp: string;
  fullName: string;
  email: string;
  whatsapp: string;
  countryRaw: string;
  city: string;
  dobRaw: string;
  /** Every column that didn't match a known field, keyed by its original
   * (as-written) header — nothing from the file is silently thrown away,
   * even though nothing reads this yet beyond storing it verbatim. */
  extra: Record<string, string>;
}

export interface DedupedRegistrant {
  id: string;
  fullName: string; // title-cased, for display
  fullNameRaw: string; // as submitted, for matching/audit
  email: string | null;
  emailVerified: boolean;
  whatsapp: string | null;
  /** True when `whatsapp` couldn't be confidently normalized (country not
   * recognized, or the number just doesn't parse for it) — surfaced in
   * the wizard so a human fixes it rather than an inconsistent format
   * silently going in. Always false when there's no number at all. */
  phoneNeedsReview: boolean;
  country: string; // normalised
  countryRaw: string;
  city: string;
  dobDay: number | null;
  dobMonth: number | null;
  dobRaw: string;
  registeredAt: string; // ISO — earliest timestamp in the merged group, or import time if the file has no timestamp column
  mergedCount: number;
  extra: Record<string, string>;
}

export interface DedupeResult {
  registrants: DedupedRegistrant[];
  totalRows: number;
  duplicatesMerged: number;
  testRowsDropped: number;
}

export function parseRegistrationsCsv(raw: string): RawRegistrationRow[] {
  const { data } = Papa.parse<string[]>(raw, { skipEmptyLines: true });
  if (data.length < 2) return [];
  const header = data[0];
  const body = data.slice(1);

  // Map each recognized field to the column index whose header matches one
  // of its aliases — first header in the file wins if more than one matches.
  const indexFor: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  const matchedIndexes = new Set<number>();
  header.forEach((raw, i) => {
    const normalized = normalizeHeader(raw ?? "");
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (field in indexFor) continue; // already matched an earlier column
      if (aliases.includes(normalized)) {
        indexFor[field as keyof typeof HEADER_ALIASES] = i;
        matchedIndexes.add(i);
      }
    }
  });

  const cell = (cols: string[], key: keyof typeof HEADER_ALIASES): string => {
    const i = indexFor[key];
    return i == null ? "" : (cols[i] ?? "").trim();
  };

  return body
    .filter((cols) => cols.some((c) => c && c.trim()))
    .map((cols) => {
      const fullNameCol = cell(cols, "fullName");
      const fullName =
        fullNameCol || [cell(cols, "firstName"), cell(cols, "lastName")].filter(Boolean).join(" ");

      const extra: Record<string, string> = {};
      header.forEach((h, i) => {
        if (matchedIndexes.has(i)) return;
        const value = (cols[i] ?? "").trim();
        if (value && h) extra[h.trim()] = value;
      });

      return {
        timestamp: cell(cols, "timestamp"),
        fullName,
        email: cell(cols, "email"),
        whatsapp: cell(cols, "whatsapp"),
        countryRaw: cell(cols, "countryRaw"),
        city: cell(cols, "city"),
        dobRaw: cell(cols, "dobRaw"),
        extra,
      };
    });
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Trim, collapse spaces, lowercase, strip diacritics, sort tokens — so
 * word order ("Cyuzuzo Raissa" vs "Raissa Cyuzuzo") never breaks a match. */
export function normalizeNameKey(fullName: string): string {
  const flat = stripDiacritics(fullName.trim().toLowerCase()).replace(/[^a-z\s]/g, " ");
  return flat.split(/\s+/).filter(Boolean).sort().join(" ");
}

function parseTimestamp(raw: string): number {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM) GMT([+-]\d+)$/.exec(
    raw.trim()
  );
  if (!m) return 0;
  const [, y, mo, d, h, mi, s, ap, off] = m;
  let hour = Number(h) % 12;
  if (ap === "PM") hour += 12;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, Number(mi), Number(s));
  return utcMs - Number(off) * 3600000;
}

const WELLFORMED_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

function monthFromName(s: string): number | null {
  const i = MONTH_NAMES.indexOf(s.toLowerCase().slice(0, 3));
  return i >= 0 ? i + 1 : null;
}

function clampMonth(n: number): number | null {
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

function clampDay(n: number, month: number | null): number | null {
  if (!Number.isFinite(n) || n < 1) return null;
  const max = month ? new Date(2001, month, 0).getDate() : 31; // non-leap reference year
  return n <= max ? n : null;
}

/**
 * Best-effort day+month parse for a mess of real-world formats
 * (`22/06/`, `2026-07-17`, `24/12/2001`, `5 October`, `17/–3/2009`,
 * `1/1/2082`, `05-07`, ...). Years are never trusted (one submission is
 * 2082; several are just the submission year) — only day and month are
 * kept, matching the product decision in 02-domain-model.md.
 *
 * Where a value has no separator hint (`05-07`) there is no way to know
 * day-first vs month-first from the string alone; this diaspora community's
 * forms skew European, so ambiguous two-number values are read day-first.
 * That is a documented convention, not a guarantee — a wrong read here
 * only ever affects a birthday reminder, never attendance or standing.
 */
export function parseDob(raw: string): { day: number | null; month: number | null } {
  const s = raw.trim();
  if (!s) return { day: null, month: null };

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const month = clampMonth(Number(iso[2]));
    return { day: clampDay(Number(iso[3]), month), month };
  }

  const textFirst = /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)/.exec(s);
  if (textFirst) {
    const month = monthFromName(textFirst[2]);
    if (month) return { day: clampDay(Number(textFirst[1]), month), month };
  }
  const textSecond = /^([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2})/.exec(s);
  if (textSecond) {
    const month = monthFromName(textSecond[1]);
    if (month) return { day: clampDay(Number(textSecond[2]), month), month };
  }

  const groups = s.match(/\d+/g);
  if (groups && groups.length >= 2) {
    const month = clampMonth(Number(groups[1]));
    const day = clampDay(Number(groups[0]), month);
    if (month && day) return { day, month };
    // try the reverse reading before giving up
    const altMonth = clampMonth(Number(groups[0]));
    const altDay = clampDay(Number(groups[1]), altMonth);
    if (altMonth && altDay) return { day: altDay, month: altMonth };
  }

  return { day: null, month: null };
}

const KNOWN_COUNTRIES = [
  "Belgium", "Ghana", "Morocco", "Burundi", "Rwanda", "Kenya", "Spain",
  "Canada", "Germany", "Mozambique", "USA", "Zambia", "Luxembourg", "France",
  "Finland",
];

/** ISO 3166-1 alpha-2 for each `KNOWN_COUNTRIES` entry — the one extra
 * thing `normalizeCountry`'s free-text matching doesn't give us, needed to
 * validate/normalize a phone number via libphonenumber-js. Deliberately
 * not looked up over the network at import time (unlike the interactive
 * Add/Edit Student country picker, src/lib/countries.ts) — a CSV import
 * previews instantly and offline today, and this ministry's registrants
 * only ever come from this same known set of countries in practice. */
const KNOWN_COUNTRY_ISO2: Record<string, CountryCode> = {
  Belgium: "BE",
  Ghana: "GH",
  Morocco: "MA",
  Burundi: "BI",
  Rwanda: "RW",
  Kenya: "KE",
  Spain: "ES",
  Canada: "CA",
  Germany: "DE",
  Mozambique: "MZ",
  USA: "US",
  Zambia: "ZM",
  Luxembourg: "LU",
  France: "FR",
  Finland: "FI",
};

/**
 * Best-effort E.164 normalization for one CSV row's phone number — only
 * when `country` resolved to one of `KNOWN_COUNTRIES` (an unrecognized
 * free-text country gives no ISO code to validate against). Returns the
 * original raw value and `needsReview: true` whenever normalization isn't
 * possible or the number doesn't parse as valid, so the row surfaces in
 * the wizard's review step instead of silently keeping an inconsistent
 * format — same "never silently guess" policy as the rest of this file.
 */
function normalizeRegistrantPhone(raw: string, country: string): { whatsapp: string | null; needsReview: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { whatsapp: null, needsReview: false };

  const iso2 = KNOWN_COUNTRY_ISO2[country];
  if (iso2) {
    const parsed = parsePhoneNumberFromString(trimmed, iso2);
    if (parsed?.isValid()) return { whatsapp: parsed.number, needsReview: false };
  }
  return { whatsapp: trimmed, needsReview: true };
}

const CITY_HINTS: Record<string, string> = {
  bruxelles: "Belgium",
  brussel: "Belgium",
  leuven: "Belgium",
  tetouan: "Morocco",
  bujumvura: "Burundi",
  tema: "Ghana",
  kigali: "Rwanda",
  nyamata: "Rwanda",
  barcelona: "Spain",
  myyrmaki: "Finland",
};

function stripEmoji(s: string): string {
  return s.replace(
    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,
    ""
  );
}

/** Normalise a free-text country field to a canonical country name, keeping
 * the raw value alongside for the human review step in the wizard. */
export function normalizeCountry(raw: string): string {
  let s = stripEmoji(raw).trim();
  if (!s) return "";

  const now = /\(now\)/i.exec(s);
  if (now) {
    const before = s.slice(0, now.index).trim();
    const parts = before.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) s = parts[parts.length - 1];
  }

  const flat = stripDiacritics(s.toLowerCase()).replace(/[^a-z\s]/g, " ");
  for (const [hint, country] of Object.entries(CITY_HINTS)) {
    if (flat.includes(hint)) return country;
  }
  for (const country of KNOWN_COUNTRIES) {
    if (flat.includes(country.toLowerCase())) return country;
  }
  const seg = s.split(/[,/]/)[0].trim();
  return titleCase(seg);
}

/**
 * De-duplicate raw rows into enrollable registrants.
 *
 * 1. Normalise email (trim/lowercase); group on it. An empty email never
 *    matches another empty email.
 * 2. Rows without a usable email group on a diacritic-stripped, sorted
 *    token set of the name, so word order doesn't matter.
 * 3. Within a group, the most recent submission's field values win (later
 *    rows tend to be corrections); the earliest timestamp is kept as the
 *    registration date.
 * 4. Rows whose name normalises to "test" are dropped.
 * 5. Everything else is imported — messy email, messy DOB and all — so a
 *    human can untick it in the wizard. Nobody is silently discarded.
 */
export function dedupeRegistrations(rows: RawRegistrationRow[]): DedupeResult {
  const groups = new Map<
    string,
    { rows: (RawRegistrationRow & { fullNameRaw: string })[]; tsList: number[] }
  >();
  let testRowsDropped = 0;
  // When the file has no timestamp column at all, there's no real "merge
  // order" — fall back to file order, so the last row for a given
  // person/email in the file wins, same intent as "latest submission wins"
  // when a real timestamp exists.
  let rowSeq = 0;

  for (const row of rows) {
    let email = row.email.trim();
    let whatsapp = row.whatsapp.trim();
    // Email and phone swapped between columns — detect by shape (`@` present).
    if (!email.includes("@") && whatsapp.includes("@")) {
      [email, whatsapp] = [whatsapp, email];
    }
    const fullNameRaw = row.fullName.replace(/\s+/g, " ").trim();
    const nameKey = normalizeNameKey(fullNameRaw);
    const tokens = nameKey.split(" ").filter(Boolean);
    if (tokens.length && tokens.every((t) => t === "test")) {
      testRowsDropped++;
      continue;
    }

    const normalizedEmail = email.toLowerCase();
    const key = normalizedEmail.includes("@") ? `email:${normalizedEmail}` : `name:${nameKey}`;

    const group = groups.get(key) ?? { rows: [], tsList: [] };
    group.rows.push({ ...row, email, whatsapp, fullNameRaw });
    const ts = parseTimestamp(row.timestamp);
    group.tsList.push(ts || rowSeq);
    rowSeq++;
    groups.set(key, group);
  }

  const registrants: DedupedRegistrant[] = [];
  let duplicatesMerged = 0;
  let idx = 0;

  for (const group of groups.values()) {
    duplicatesMerged += group.rows.length - 1;
    let latestI = 0;
    let earliestI = 0;
    for (let i = 1; i < group.tsList.length; i++) {
      if (group.tsList[i] > group.tsList[latestI]) latestI = i;
      if (group.tsList[i] < group.tsList[earliestI]) earliestI = i;
    }
    const latest = group.rows[latestI];
    const earliestTs = group.tsList[earliestI];
    const dob = parseDob(latest.dobRaw);
    const hasRealTimestamp = group.rows.some((r) => parseTimestamp(r.timestamp) > 0);
    const country = normalizeCountry(latest.countryRaw);
    const { whatsapp, needsReview } = normalizeRegistrantPhone(latest.whatsapp, country);

    registrants.push({
      id: `reg-${idx++}`,
      fullName: titleCase(latest.fullNameRaw),
      fullNameRaw: latest.fullNameRaw,
      email: latest.email.includes("@") ? latest.email.toLowerCase() : null,
      emailVerified: WELLFORMED_EMAIL.test(latest.email),
      whatsapp,
      phoneNeedsReview: needsReview,
      country,
      countryRaw: latest.countryRaw,
      city: latest.city ? titleCase(latest.city) : "",
      dobDay: dob.day,
      dobMonth: dob.month,
      dobRaw: latest.dobRaw,
      registeredAt: hasRealTimestamp ? new Date(earliestTs).toISOString() : new Date().toISOString(),
      mergedCount: group.rows.length,
      extra: latest.extra,
    });
  }

  return {
    registrants,
    totalRows: rows.length,
    duplicatesMerged,
    testRowsDropped,
  };
}
