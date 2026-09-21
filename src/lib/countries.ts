import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Country + city data for the Add/Edit Student country and city pickers —
 * from countriesnow.space (free, no key, CORS-open), not bundled locally,
 * so a country's actual list of cities doesn't need maintaining here.
 * Every call site treats a failed fetch as "no suggestions available" and
 * falls back to a plain free-text field — this is a UX nicety, never a
 * hard requirement to save a student.
 */
export interface CountryOption {
  name: string;
  iso2: string;
  /** e.g. "+250" — always has the leading "+", never internal spaces. */
  callingCode: string;
}

const COUNTRIES_URL = "https://countriesnow.space/api/v0.1/countries/codes";
const CITIES_URL = "https://countriesnow.space/api/v0.1/countries/cities/q";

let countriesPromise: Promise<CountryOption[]> | null = null;

/** Cached module-wide for the life of the tab — every dialog that opens
 * after the first shares the same fetch instead of re-requesting. */
export function fetchCountries(): Promise<CountryOption[]> {
  if (!countriesPromise) {
    countriesPromise = fetch(COUNTRIES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`countries fetch failed: ${res.status}`);
        return res.json() as Promise<{ data: { name: string; code: string; dial_code: string }[] }>;
      })
      .then((body) =>
        body.data
          .filter((c) => c.name && c.code && c.dial_code)
          .map((c) => ({ name: c.name, iso2: c.code, callingCode: c.dial_code.replace(/\s+/g, "") }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      .catch((err) => {
        countriesPromise = null; // don't cache a failure — the next dialog open retries
        throw err;
      });
  }
  return countriesPromise;
}

const cityCache = new Map<string, Promise<string[]>>();

/** Cached per country name for the life of the tab. */
export function fetchCitiesForCountry(countryName: string): Promise<string[]> {
  const key = countryName.trim();
  if (!key) return Promise.resolve([]);
  let cached = cityCache.get(key);
  if (!cached) {
    cached = fetch(`${CITIES_URL}?country=${encodeURIComponent(key)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`cities fetch failed: ${res.status}`);
        return res.json() as Promise<{ data: string[] }>;
      })
      .then((body) => [...(body.data ?? [])].sort((a, b) => a.localeCompare(b)))
      .catch((err) => {
        cityCache.delete(key);
        throw err;
      });
    cityCache.set(key, cached);
  }
  return cached;
}

/**
 * Best-effort E.164 normalization for a student's WhatsApp number, given
 * whatever country they've got on file — resolves the country to an ISO
 * code via the same cached list the picker uses, then hands off to
 * libphonenumber-js. Falls back to the raw trimmed value whenever the
 * country can't be resolved or the number doesn't parse as valid for it —
 * never blocks a save over this.
 */
export async function normalizeStudentPhone(raw: string, countryName: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const countries = await fetchCountries();
    const match = countries.find((c) => c.name.toLowerCase() === countryName.trim().toLowerCase());
    if (match) {
      const parsed = parsePhoneNumberFromString(trimmed, match.iso2 as CountryCode);
      if (parsed?.isValid()) return parsed.number;
    }
  } catch {
    // Network down, or the number just doesn't parse — the trimmed raw
    // value below is still a fine save, just not normalized.
  }
  return trimmed;
}
