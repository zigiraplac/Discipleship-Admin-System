import { cn } from "@/lib/utils";

/**
 * "▲ 4" / "▼ 3" against the period before. Colour carries meaning, not
 * decoration: green when the move is good, red when it's bad, grey when
 * neither (or unchanged). `goodWhen="down"` for things like at-risk counts.
 */
export function Change({
  now,
  before,
  goodWhen = "up",
  unit = "",
}: {
  now: number | null;
  before: number | null;
  goodWhen?: "up" | "down" | "neutral";
  /** Appended to the number, e.g. " pts". */
  unit?: string;
}) {
  if (now == null || before == null) return null;
  const d = now - before;
  if (d === 0) return <span className="text-[11px] font-semibold text-ink-faint tabular">±0</span>;
  const good = goodWhen === "neutral" ? null : (d > 0) === (goodWhen === "up");
  return (
    <span className={cn("text-[11px] font-semibold tabular", good === null ? "text-ink-muted" : good ? "text-emerald-700" : "text-accent-2-700")}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}
      {unit}
    </span>
  );
}
