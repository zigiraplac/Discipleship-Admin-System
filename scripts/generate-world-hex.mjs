// Builds the hexagon world grid behind the Global HQ map
// (src/components/network/world-hex.json): which country each land hexagon
// is in, from Natural Earth country shapes (public domain, via world-atlas).
// The app only reads the JSON this writes; nothing here runs in the app.
//
// To regenerate (e.g. after changing the hexagon size R below), install the
// three tools in a throwaway folder outside the project, then run this with
// that folder and the output file:
//
//   mkdir -p /tmp/hexgen-tools && cd /tmp/hexgen-tools && npm init -y
//   npm i d3-geo@3 topojson-client@3 world-atlas@2
//   cd <project> && node scripts/generate-world-hex.mjs /tmp/hexgen-tools src/components/network/world-hex.json
//
// Every country gets at least one hexagon (tiny ones such as Rwanda and
// Burundi are placed at their centre without taking a neighbour's last one).
// Countries are stored with their ISO 3166-1 numeric code and name.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const [toolsDir, out] = process.argv.slice(2);
if (!toolsDir || !out) {
  console.error("Usage: node scripts/generate-world-hex.mjs <tools folder> <output.json>");
  process.exit(1);
}
const require = createRequire(`${toolsDir}/package.json`);
const d3 = await import(require.resolve("d3-geo"));
const topojson = require("topojson-client");
const world = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));

const W = 1000;
const R = 6.2; // hexagon radius (centre to corner), pointy-top
const DX = Math.sqrt(3) * R;
const DY = 1.5 * R;

const fc = topojson.feature(world, world.objects.countries);
const features = fc.features.filter((f) => f.properties.name !== "Antarctica");

// Mercator, cropped to 57°S–80°N like the reference picture.
const projection = d3.geoMercator().fitWidth(W, { type: "Sphere" });
const top = projection([0, 80])[1];
const bottom = projection([0, -57])[1];
projection.translate([projection.translate()[0], projection.translate()[1] - top]);
const H = Math.round(bottom - top);

const countries = features.map((f) => ({ id: String(f.id ?? f.properties.name), name: f.properties.name }));
const bounds = features.map((f) => d3.geoBounds(f));

function countryAt(lon, lat) {
  for (let i = 0; i < features.length; i++) {
    const [[x0, y0], [x1, y1]] = bounds[i];
    const inLon = x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1;
    if (!inLon || lat < y0 || lat > y1) continue;
    if (d3.geoContains(features[i], [lon, lat])) return i;
  }
  return -1;
}

const cells = [];
const taken = new Set();
for (let row = 0; row * DY <= H; row++) {
  const y = R + row * DY;
  const offset = row % 2 ? DX / 2 : 0;
  for (let col = 0; col * DX + offset <= W; col++) {
    const x = DX / 2 + col * DX + offset;
    const ll = projection.invert([x, y]);
    if (!ll) continue;
    const ci = countryAt(ll[0], ll[1]);
    if (ci >= 0) {
      cells.push([+x.toFixed(1), +y.toFixed(1), ci]);
      taken.add(`${col}:${row}`);
    }
  }
}

// Small countries no hexagon centre landed in: give them the nearest free
// spot to their centre, so every country can be shown.
const has = new Set(cells.map((c) => c[2]));
const pinned = new Set(); // spots already given to a tiny country
const count = new Map(); // hexagons per country
for (const c of cells) count.set(c[2], (count.get(c[2]) ?? 0) + 1);
const cellAt = (x, y) => cells.findIndex((c) => Math.abs(c[0] - x) < 0.5 && Math.abs(c[1] - y) < 0.5);
const spot = (col, row) => ({ x: DX / 2 + col * DX + (row % 2 ? DX / 2 : 0), y: R + row * DY });
for (let i = 0; i < features.length; i++) {
  if (has.has(i)) continue;
  const p = projection(d3.geoCentroid(features[i]));
  if (!p) continue;
  const row0 = Math.round((p[1] - R) / DY);
  const col0 = Math.round((p[0] - DX / 2 - (row0 % 2 ? DX / 2 : 0)) / DX);
  // Nearest spot to the centre that no other tiny country holds.
  const options = [];
  for (let dr = -2; dr <= 2; dr++)
    for (let dc = -2; dc <= 2; dc++) {
      const row = row0 + dr, col = col0 + dc;
      if (row < 0 || col < 0 || pinned.has(`${col}:${row}`)) continue;
      const s = spot(col, row);
      // Never take a country's last hexagon.
      const at = cellAt(s.x, s.y);
      if (at >= 0 && (count.get(cells[at][2]) ?? 0) <= 1) continue;
      options.push({ col, row, ...s, d: Math.hypot(s.x - p[0], s.y - p[1]) });
    }
  options.sort((a, b) => a.d - b.d);
  const best = options[0];
  if (!best) continue;
  pinned.add(`${best.col}:${best.row}`);
  const existing = cellAt(best.x, best.y);
  if (existing >= 0) {
    count.set(cells[existing][2], count.get(cells[existing][2]) - 1);
    cells[existing][2] = i;
  } else cells.push([+best.x.toFixed(1), +best.y.toFixed(1), i]);
  count.set(i, 1);
}

// Only keep countries that ended up with a hexagon, re-indexed.
const used = [...new Set(cells.map((c) => c[2]))].sort((a, b) => a - b);
const remap = new Map(used.map((old, i) => [old, i]));
const data = {
  width: W,
  height: H,
  radius: R,
  countries: used.map((i) => countries[i]),
  cells: cells.map(([x, y, ci]) => [x, y, remap.get(ci)]),
};
writeFileSync(out, JSON.stringify(data));
console.log(`${data.cells.length} hexagons, ${data.countries.length} countries, ${W}x${H}`);
