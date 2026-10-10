/* Muted, categorical colours — only to tell the direct children apart.
 * Green, amber and red stay reserved for status and aren't used. Spelled
 * out in full so Tailwind generates them. The last one is for "Others". */
export const FILLS = ["bg-accent", "bg-violet-600", "bg-teal-600", "bg-sky-500", "bg-ink-tertiary"];
export const MAX_BARS = 5;

/** The order every child chart uses — most active students first — so a
 * child keeps the same colour in each chart on the page. */
export function byActive<T extends { name: string; value: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/* For lines, where every child needs its own colour: the same first four
 * as the bars (so a child matches across charts), then more muted hues.
 * Still no green, amber or red. */
const LINES = [
  { dot: "bg-accent", stroke: "var(--color-accent)" },
  { dot: "bg-violet-600", stroke: "var(--color-violet-600)" },
  { dot: "bg-teal-600", stroke: "var(--color-teal-600)" },
  { dot: "bg-sky-500", stroke: "var(--color-sky-500)" },
  { dot: "bg-ink-tertiary", stroke: "var(--color-ink-tertiary)" },
  { dot: "bg-indigo-400", stroke: "var(--color-indigo-400)" },
  { dot: "bg-cyan-800", stroke: "var(--color-cyan-800)" },
  { dot: "bg-purple-400", stroke: "var(--color-purple-400)" },
];

export function lineColours(items: { id: string; name: string; value: number }[]): Map<string, { dot: string; stroke: string }> {
  return new Map(byActive(items).map((c, i) => [c.id, LINES[i % LINES.length]]));
}

/** Axis labels that stay short as numbers grow: 950, 1.2k, 12k, 1.5M. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${+(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${+(n / 1_000_000).toFixed(1)}M`;
}
