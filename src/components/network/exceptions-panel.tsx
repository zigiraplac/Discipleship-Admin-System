import Link from "next/link";
import { CaretRight, WarningCircle, Info } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import type { ExceptionItem } from "@/lib/data/org-view";

/** What needs attention, most urgent first — each line opens the scoped
 * page behind the number (no browsing through levels to find it). */
export function ExceptionsPanel({ items }: { items: ExceptionItem[] }) {
  if (!items.length) {
    return <p className="py-6 text-center text-[13px] text-ink-muted">Nothing needs attention right now.</p>;
  }
  return (
    <ul className="flex flex-col">
      {items.map((i, idx) => (
        <li key={i.key}>
          <Link
            href={i.href}
            className={cn("group flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-hover", idx && "border-t border-divider")}
          >
            {i.severity === "urgent" ? (
              <WarningCircle size={17} weight="fill" className="flex-none text-accent-2-500" />
            ) : (
              <Info size={17} weight="fill" className="flex-none text-yellow" />
            )}
            <span className="flex-1">
              <span className="block text-[13px] font-semibold text-ink group-hover:text-accent-700">{i.text}</span>
              {i.detail && <span className="block text-[12px] text-ink-muted">{i.detail}</span>}
            </span>
            <CaretRight size={12} className="text-ink-faint group-hover:text-accent-700" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A small labelled list of figures (programme / intervention health). */
export function FigureList({ rows }: { rows: { label: string; value: React.ReactNode; tone?: "warn" | "bad" }[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((r, i) => (
        <div key={r.label} className={cn("flex items-center justify-between gap-3 py-2", i && "border-t border-divider")}>
          <dt className="text-[13px] text-ink-secondary">{r.label}</dt>
          <dd
            className={cn(
              "text-[14px] font-bold tabular",
              r.tone === "bad" ? "text-accent-2-700" : r.tone === "warn" ? "text-yellow-ink" : "text-ink"
            )}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
