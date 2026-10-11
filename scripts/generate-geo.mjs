// Builds the reference lists of continents, countries and their top-level
// regions (provinces, states…) that the app offers and compares against:
//   src/lib/geo/countries.json  — continents, and every country with its continent
//   src/lib/geo/regions.json    — each country's top-level regions (server only)
// The app only reads these files; nothing here runs in the app.
//
// Sources (both free):
//   - ISO 3166-1 / 3166-2 lists from Debian's iso-codes package
//     (LGPL-2.1; on Debian/Ubuntu: apt install iso-codes → /usr/share/iso-codes/json)
//   - which continent each country is in, from countries-list (MIT)
//
// To regenerate: install countries-list in a throwaway folder outside the
// project, then run this with that folder and the iso-codes folder:
//
//   mkdir -p /tmp/geo-tools && cd /tmp/geo-tools && npm init -y && npm i countries-list@3
//   cd <project> && node scripts/generate-geo.mjs /tmp/geo-tools /usr/share/iso-codes/json
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [toolsDir, isoDir] = process.argv.slice(2);
if (!toolsDir || !isoDir) {
  console.error("Usage: node scripts/generate-geo.mjs <tools folder> <iso-codes json folder>");
  process.exit(1);
}
const require = createRequire(`${toolsDir}/package.json`);
const { countries: lookup, continents: continentNames } = require("countries-list");
const iso1 = JSON.parse(readFileSync(`${isoDir}/iso_3166-1.json`, "utf8"))["3166-1"];
const iso2 = JSON.parse(readFileSync(`${isoDir}/iso_3166-2.json`, "utf8"))["3166-2"];

// Antarctica has no people, so no BCC: left out.
const CONTINENT_ORDER = ["AF", "AS", "EU", "NA", "SA", "OC"];

const countries = iso1
  .map((c) => {
    const info = lookup[c.alpha_2];
    if (!info || !CONTINENT_ORDER.includes(info.continent)) return null;
    return {
      code: c.alpha_2,
      // ISO 3166-1 numeric — the world map's country ids.
      numeric: c.numeric,
      // The everyday name ("Tanzania", not "Tanzania, United Republic of").
      name: info.name || c.common_name || c.name,
      continent: info.continent,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

// Top-level regions only (a region inside another one is left out).
const regions = {};
for (const r of iso2) {
  if (r.parent) continue;
  const country = r.code.split("-")[0];
  if (!countries.some((c) => c.code === country)) continue;
  (regions[country] ??= []).push({ code: r.code, name: r.name, type: r.type });
}
for (const list of Object.values(regions)) list.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync("src/lib/geo", { recursive: true });
writeFileSync(
  "src/lib/geo/countries.json",
  JSON.stringify({ continents: CONTINENT_ORDER.map((code) => ({ code, name: continentNames[code] })), countries })
);
writeFileSync("src/lib/geo/regions.json", JSON.stringify(regions));

const perContinent = CONTINENT_ORDER.map((k) => `${k} ${countries.filter((c) => c.continent === k).length}`).join(", ");
const regionCount = Object.values(regions).reduce((n, l) => n + l.length, 0);
console.log(`${countries.length} countries (${perContinent}); ${regionCount} regions in ${Object.keys(regions).length} countries`);
