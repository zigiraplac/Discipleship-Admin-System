"use client";

import { useEffect, useMemo, useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { fetchCitiesForCountry, fetchCountries, type CountryOption } from "@/lib/countries";

/**
 * Country (+ optional city) picker backed by a live API, and a WhatsApp
 * field whose placeholder reflects whichever country's currently typed —
 * shared by Add and Edit Student so the two don't drift into two
 * different behaviors for the same fields. Both the country and city
 * inputs stay genuine free text (via `<datalist>`, not a closed dropdown)
 * — this ministry's registrants include towns too small for any country/
 * city API to know about (see CITY_HINTS in registrations.ts), so a
 * strict picker would block real entries instead of just suggesting them.
 */
export function CountryCityPhoneFields({
  idPrefix,
  country,
  onCountryChange,
  city,
  onCityChange,
  whatsapp,
  onWhatsappChange,
}: {
  idPrefix: string;
  country: string;
  onCountryChange: (v: string) => void;
  /** Omit entirely to skip rendering the city field (Edit Student has no
   * city field at all today). */
  city?: string;
  onCityChange?: (v: string) => void;
  whatsapp: string;
  onWhatsappChange: (v: string) => void;
}) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCountries()
      .then((list) => {
        if (!cancelled) setCountries(list);
      })
      .catch(() => {
        // Offline or the API's down — country/city just stay plain
        // free-text inputs with no suggestions, nothing blocks the form.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matched = useMemo(
    () => countries.find((c) => c.name.toLowerCase() === country.trim().toLowerCase()) ?? null,
    [countries, country]
  );

  useEffect(() => {
    if (city === undefined || !matched) return;
    let cancelled = false;
    fetchCitiesForCountry(matched.name)
      .then((list) => {
        if (!cancelled) setCities(list);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [matched, city]);

  // Masked at render rather than cleared in the effect above — a stale
  // previous country's city list would otherwise flash before the new
  // fetch resolves, and clearing it there is exactly the "setState
  // synchronously in an effect" pattern React warns against.
  const visibleCities = matched ? cities : [];

  // Once a country's recognized, its calling code becomes a fixed prefix
  // — the input only ever holds what comes after it, so someone can't
  // accidentally edit or duplicate the code itself. Whatever was typed
  // before the country got recognized (often a locally-formatted number
  // starting with a trunk "0") gets that leading zero dropped, same
  // convention the CSV import already uses (registrations.ts).
  const nationalNumber = useMemo(() => {
    if (!matched) return whatsapp;
    return whatsapp.startsWith(matched.callingCode) ? whatsapp.slice(matched.callingCode.length) : whatsapp.replace(/^0+/, "");
  }, [matched, whatsapp]);

  return (
    <>
      <div className={city === undefined ? undefined : "grid grid-cols-2 gap-3"}>
        <div>
          <Label htmlFor={`${idPrefix}-country`}>Country</Label>
          <Input
            id={`${idPrefix}-country`}
            list={`${idPrefix}-country-list`}
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            autoComplete="off"
          />
          <datalist id={`${idPrefix}-country-list`}>
            {countries.map((c) => (
              <option key={c.iso2} value={c.name} />
            ))}
          </datalist>
        </div>
        {city !== undefined && onCityChange && (
          <div>
            <Label htmlFor={`${idPrefix}-city`}>City</Label>
            <Input
              id={`${idPrefix}-city`}
              list={`${idPrefix}-city-list`}
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              autoComplete="off"
            />
            <datalist id={`${idPrefix}-city-list`}>
              {visibleCities.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-whatsapp`}>WhatsApp</Label>
        {matched ? (
          <div className="flex">
            <span className="flex flex-none items-center rounded-l-control border border-r-0 border-border bg-subtle px-2.5 text-sm font-medium text-ink-muted">
              {matched.callingCode}
            </span>
            <Input
              id={`${idPrefix}-whatsapp`}
              value={nationalNumber}
              onChange={(e) => onWhatsappChange(matched.callingCode + e.target.value.replace(/\D/g, ""))}
              placeholder="788123456"
              className="rounded-l-none"
            />
          </div>
        ) : (
          <Input
            id={`${idPrefix}-whatsapp`}
            value={whatsapp}
            onChange={(e) => onWhatsappChange(e.target.value)}
            placeholder="e.g. +250788123456"
          />
        )}
      </div>
    </>
  );
}
