"use client";

import { memo, useMemo, useState } from "react";
import { UsersThree } from "@phosphor-icons/react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import WORLD from "./world-hex.json";
import type { CountryPresence } from "./world-map-sample";

/* The world as hexagons — one per ~200 km at the equator, every country
 * (even the smallest) holding at least one. Built once from Natural Earth
 * (public domain); see world-hex.json. Cells are [x, y, country index]. */
const { width: W, height: H, radius: R } = WORLD;
const CELLS = WORLD.cells as [number, number, number][];
const COUNTRIES = WORLD.countries as { id: string; name: string }[];

/** A pointy-top hexagon, a little smaller than its slot so a gap shows. */
function hexPoints(x: number, y: number, r = R * 0.86): string {
  let s = "";
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 30) * Math.PI) / 180;
    s += `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)} `;
  }
  return s;
}

/** Steps of the accent colour: 0 = "BCC is here", 1–4 = ever hotter. */
const STEPS = [24, 40, 60, 80, 100];
const fillFor = (step: number) => `color-mix(in oklab, var(--color-accent) ${STEPS[step]}%, var(--color-card))`;
const EMPTY_FILL = "color-mix(in oklab, var(--color-ink) 7%, var(--color-card))";

/**
 * Each hexagon's colour. A country with BCC is lightly tinted all over, and
 * a hotspot at its middle grows and darkens with its students — so a small
 * country with many students stands out, and a big one with few doesn't
 * flood the map.
 */
function hexFills(byCountry: Map<number, CountryPresence>, max: number, centres: Map<number, { x: number; y: number }>): string[] {
  const fills = CELLS.map(([, , ci]) => (byCountry.has(ci) ? fillFor(0) : EMPTY_FILL));
  for (const [ci, p] of byCountry) {
    const share = max ? p.students / max : 0;
    const c = centres.get(ci)!;
    const own = CELLS.map((cell, i) => ({ i, cell })).filter(({ cell }) => cell[2] === ci);
    own.sort((a, b) => Math.hypot(a.cell[0] - c.x, a.cell[1] - c.y) - Math.hypot(b.cell[0] - c.x, b.cell[1] - c.y));
    const hot = Math.max(1, Math.min(own.length, Math.round(Math.sqrt(share) * 12)));
    const peak = 1 + Math.min(3, Math.floor(share * 4)); // 1..4
    own.slice(0, hot).forEach(({ i }, rank) => {
      fills[i] = fillFor(Math.max(1, peak - Math.floor((rank / hot) * peak)));
    });
  }
  return fills;
}

interface Hover {
  ci: number;
  x: number;
  y: number;
}

/**
 * Where BCC is, worldwide: every country with BCC is coloured by how many
 * students it has, the busiest ones are named on the map, and hovering (or
 * tapping) a country tells what's there.
 */
export function WorldMap({ presence, sample = false }: { presence: CountryPresence[]; sample?: boolean }) {
  const [hover, setHover] = useState<Hover | null>(null);

  const byCountry = useMemo(() => {
    const index = new Map(COUNTRIES.map((c, i) => [c.name, i]));
    const map = new Map<number, CountryPresence>();
    for (const p of presence) {
      const i = index.get(p.country);
      if (i != null) map.set(i, p);
    }
    return map;
  }, [presence]);

  const max = Math.max(0, ...presence.map((p) => p.students));
  const totals = presence.reduce((t, p) => ({ students: t.students + p.students, churches: t.churches + p.churches }), { students: 0, churches: 0 });

  // Each country's middle (average of its hexagons), for labels and the tooltip.
  const centres = useMemo(() => {
    const sum = new Map<number, [number, number, number]>();
    for (const [x, y, ci] of CELLS) {
      const s = sum.get(ci) ?? [0, 0, 0];
      sum.set(ci, [s[0] + x, s[1] + y, s[2] + 1]);
    }
    return new Map([...sum].map(([ci, [x, y, n]]) => [ci, { x: x / n, y: y / n }]));
  }, []);
  const fills = useMemo(() => hexFills(byCountry, max, centres), [byCountry, max, centres]);

  // The four busiest countries get a label on the map.
  const labelled = [...byCountry.entries()].sort((a, b) => b[1].students - a[1].students).slice(0, 4);
  const hovered = hover ? (byCountry.get(hover.ci) ?? null) : null;

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const ci = Number((e.target as Element).getAttribute?.("data-ci"));
    if (Number.isNaN(ci) || !(e.target as Element).hasAttribute("data-ci")) return setHover(null);
    const c = centres.get(ci)!;
    setHover({ ci, x: c.x, y: c.y });
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex-1">
          <CardTitle>BCC around the world</CardTitle>
          <CardSubtitle>
            {presence.length} countries · {totals.churches.toLocaleString()} churches · {totals.students.toLocaleString()} students
          </CardSubtitle>
        </div>
        {sample && <Pill tone="amber">Sample data</Pill>}
      </CardHeader>

      <div className="px-3 pb-3 sm:px-[18px]">
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full touch-manipulation"
            role="img"
            aria-label={`World map: BCC in ${presence.map((p) => `${p.country} (${p.students} students)`).join(", ")}`}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setHover(null)}
          >
            <HexLayer fills={fills} />
            {/* The hovered country, outlined on top. */}
            {hover && (
              <g pointerEvents="none">
                {CELLS.map(([x, y, ci], i) =>
                  ci === hover.ci ? <polygon key={i} points={hexPoints(x, y)} fill={fills[i]} stroke="var(--color-accent)" strokeWidth={1.4} /> : null
                )}
              </g>
            )}
          </svg>

          {/* Labels on the busiest countries (hidden on small screens, and while hovering one). */}
          {labelled.map(([ci, p]) => {
            const c = centres.get(ci)!;
            return (
              <div
                key={ci}
                className={cn(
                  "pointer-events-none absolute hidden -translate-x-1/2 -translate-y-[calc(100%+8px)] md:block",
                  "transition-opacity duration-150",
                  hover && "opacity-0"
                )}
                style={{ left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%` }}
              >
                <MapCallout title={p.country} value={p.students.toLocaleString()} unit="students" />
              </div>
            );
          })}

          {/* Tooltip for the hovered country. */}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)]"
              style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
            >
              <div className="min-w-[180px] rounded-[10px] border border-border bg-card px-3 py-2.5 shadow-dropdown">
                <div className="text-[13px] font-bold text-ink">{COUNTRIES[hover.ci].name}</div>
                {hovered ? (
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                    <dt className="text-ink-muted">Students</dt>
                    <dd className="text-right font-semibold tabular text-ink">{hovered.students.toLocaleString()}</dd>
                    <dt className="text-ink-muted">Churches</dt>
                    <dd className="text-right font-semibold tabular text-ink">{hovered.churches}</dd>
                    <dt className="text-ink-muted">Cohorts</dt>
                    <dd className="text-right font-semibold tabular text-ink">{hovered.cohorts}</dd>
                  </dl>
                ) : (
                  <div className="mt-0.5 text-[12px] text-ink-muted">No BCC here yet</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Swatch fill={EMPTY_FILL} /> No BCC yet
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch fill={fillFor(0)} /> BCC here
          </span>
          <span className="flex items-center gap-1.5">
            Fewer students
            {STEPS.slice(1).map((_, i) => (
              <Swatch key={i} fill={fillFor(i + 1)} />
            ))}
            More students
          </span>
          <span className="ml-auto hidden sm:inline">Hover or tap a country for details</span>
        </div>
      </div>
    </Card>
  );
}

/** Every hexagon, drawn once (hover only redraws the overlay). */
const HexLayer = memo(function HexLayer({ fills }: { fills: string[] }) {
  return (
    <g>
      {CELLS.map(([x, y, ci], i) => (
        <polygon key={i} data-ci={ci} points={hexPoints(x, y)} fill={fills[i]} />
      ))}
    </g>
  );
});

function Swatch({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
      <polygon points={hexPoints(6, 6, 6)} fill={fill} />
    </svg>
  );
}

function MapCallout({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <div className="relative flex items-center gap-2.5 rounded-[10px] border border-border bg-card py-2 pr-3.5 pl-2 shadow-dropdown">
      <span className="grid size-8 flex-none place-items-center rounded-[8px] bg-accent-100 text-accent-800">
        <UsersThree size={16} />
      </span>
      <span>
        <span className="block text-[11px] text-ink-muted">{title}</span>
        <span className="block text-[15px] font-bold leading-tight tabular text-ink">
          {value} <span className="text-[11px] font-medium text-ink-muted">{unit}</span>
        </span>
      </span>
      {/* The pointer down to the country. */}
      <span className="absolute -bottom-[5px] left-1/2 size-2.5 -translate-x-1/2 rotate-45 border-r border-b border-border bg-card" />
    </div>
  );
}
