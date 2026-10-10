import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

export interface Crumb {
  label: string;
  /** Omitted when this person can't open it (e.g. a level above their own). */
  href?: string;
}

/** Where am I? The levels above the page, as a trail. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Where you are" className="no-print mb-3 flex flex-wrap items-center gap-1 text-[12px] text-ink-muted">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <CaretRight size={10} className="text-ink-faint" />}
            {c.href && !last ? (
              <Link href={c.href} className="hover:text-accent-700 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className={last ? "font-semibold text-ink-secondary" : undefined}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
