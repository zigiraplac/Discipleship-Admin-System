import Papa from "papaparse";

/**
 * Parsing and de-duplication for the ministry's Google-Forms sign-up export
 * (`data/registrations.csv`). Rules are the ones agreed with the product
 * owner in 07-data-and-seeding.md — summarized inline below. The guiding
 * rule: never silently discard a person; only exact test rows are dropped,
 * everything else is imported (messy email, messy DOB and all) and shown
 * to a human to untick.
 */

export interface RawRegistrationRow {
  timestamp: string;
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  countryRaw: string;
  dobRaw: string;
  comment: string;
}

export interface DedupedRegistrant {
  id: string;
  fullName: string; // title-cased, for display
  fullNameRaw: string; // as submitted, for matching/audit
  email: string | null;
  emailVerified: boolean;
  whatsapp: string | null;
  country: string; // normalised
  countryRaw: string;
  dobDay: number | null;
  dobMonth: number | null;
  dobRaw: string;
  registeredAt: string; // ISO — earliest timestamp in the merged group
  mergedCount: number;
}

export interface DedupeResult {
  registrants: DedupedRegistrant[];
  totalRows: number;
  duplicatesMerged: number;
  testRowsDropped: number;
}

export function parseRegistrationsCsv(raw: string): RawRegistrationRow[] {
  const { data } = Papa.parse<string[]>(raw, { skipEmptyLines: true });
  const body = data.slice(1); // drop the header row
  return body
    .filter((cols) => cols.length >= 7 && cols.some((c) => c && c.trim()))
    .map((cols) => ({
      timestamp: cols[0] ?? "",
      firstName: cols[1] ?? "",
      lastName: cols[2] ?? "",
      email: cols[3] ?? "",
      whatsapp: cols[4] ?? "",
      countryRaw: cols[5] ?? "",
      dobRaw: cols[6] ?? "",
      comment: cols[7] ?? "",
    }));
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

  for (const row of rows) {
    let email = row.email.trim();
    let whatsapp = row.whatsapp.trim();
    // Email and phone swapped between columns — detect by shape (`@` present).
    if (!email.includes("@") && whatsapp.includes("@")) {
      [email, whatsapp] = [whatsapp, email];
    }
    const firstName = row.firstName.trim();
    const lastName = row.lastName.trim();
    const fullNameRaw = [firstName, lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const nameKey = normalizeNameKey(fullNameRaw);
    const tokens = nameKey.split(" ").filter(Boolean);
    if (tokens.length && tokens.every((t) => t === "test")) {
      testRowsDropped++;
      continue;
    }

    const normalizedEmail = email.toLowerCase();
    const key = normalizedEmail.includes("@") ? `email:${normalizedEmail}` : `name:${nameKey}`;

    const group = groups.get(key) ?? { rows: [], tsList: [] };
    group.rows.push({ ...row, firstName, lastName, email, whatsapp, fullNameRaw });
    group.tsList.push(parseTimestamp(row.timestamp));
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

    registrants.push({
      id: `reg-${idx++}`,
      fullName: titleCase(latest.fullNameRaw),
      fullNameRaw: latest.fullNameRaw,
      email: latest.email.includes("@") ? latest.email.toLowerCase() : null,
      emailVerified: WELLFORMED_EMAIL.test(latest.email),
      whatsapp: latest.whatsapp || null,
      country: normalizeCountry(latest.countryRaw),
      countryRaw: latest.countryRaw,
      dobDay: dob.day,
      dobMonth: dob.month,
      dobRaw: latest.dobRaw,
      registeredAt: new Date(earliestTs || Date.now()).toISOString(),
      mergedCount: group.rows.length,
    });
  }

  return {
    registrants,
    totalRows: rows.length,
    duplicatesMerged,
    testRowsDropped,
  };
}
