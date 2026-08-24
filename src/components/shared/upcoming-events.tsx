import Link from "next/link";
import { BookOpen, Cake, Megaphone } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type UpcomingTone = "cyan" | "magenta" | "yellow" | "violet";
export type UpcomingKind = "lesson" | "crusade" | "birthday";

// The row's own semantic meaning (still drives the icon badge — cyan =
// on track/scheduled, magenta = needs attention, yellow = birthday,
// violet = crusade — its own category, not a "problem").
const ICON_CLASSES: Record<UpcomingTone, string> = {
  cyan: "bg-accent-100 text-accent-800",
  magenta: "bg-accent-2-100 text-accent-2-700",
  yellow: "bg-yellow-100 text-yellow-ink",
  violet: "bg-violet-100 text-violet-700",
};

const ICON_BY_KIND: Record<UpcomingKind, typeof BookOpen> = {
  lesson: BookOpen,
  crusade: Megaphone,
  birthday: Cake,
};

// The accent bar is purely decorative rhythm, not meaning — it cycles
// through these tones by row position regardless of what the row is.
const BAR_ALTERNATION: UpcomingTone[] = ["cyan", "magenta", "yellow", "violet"];
const BAR_CLASSES: Record<UpcomingTone, string> = {
  cyan: "bg-accent",
  magenta: "bg-accent-2-500",
  yellow: "bg-yellow",
  violet: "bg-violet-500",
};

export interface UpcomingEventRow {
  id: string;
  tone: UpcomingTone;
  kind: UpcomingKind;
  title: string;
  meta: string; // "C3 · L5", "After class 4", "Birthday"
  dateLabel: string; // "Today", "11 Aug"
  href: string | null;
}

/** A vertical "what's coming up" list — used on the Dashboard and the
 * Calendar so both read the same way at a glance. Passed as plain data
 * (never a component reference) since this also renders from inside the
 * Calendar's client-side view, and a React component isn't serializable
 * across that server/client boundary. */
export function UpcomingEventsCard({
  title = "Upcoming",
  subtitle,
  rows,
  emptyLabel = "Nothing coming up.",
  className,
}: {
  title?: string;
  subtitle?: string;
  rows: UpcomingEventRow[];
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-[18px]", className)}>
      <div className="text-[15px] font-bold text-ink">{title}</div>
      {subtitle && <div className="mt-0.5 text-xs text-ink-muted">{subtitle}</div>}
      <div className="mt-3.5 flex flex-col gap-2">
        {rows.map((r, i) => (
          <UpcomingRow key={r.id} row={r} barTone={BAR_ALTERNATION[i % BAR_ALTERNATION.length]} />
        ))}
        {rows.length === 0 && (
          <div className="rounded-[10px] border border-border-soft bg-subtle px-3 py-4 text-center text-[13px] text-ink-muted">
            {emptyLabel}
          </div>
        )}
      </div>
    </Card>
  );
}

function UpcomingRow({ row, barTone }: { row: UpcomingEventRow; barTone: UpcomingTone }) {
  const IconEl = ICON_BY_KIND[row.kind];
  const classes = cn(
    "flex items-center gap-2.5 rounded-[9px] bg-subtle py-2.5 pl-2 pr-3",
    row.href && "hover:bg-hover"
  );
  const inner = (
    <>
      <span className={cn("my-0.5 w-[3px] flex-none self-stretch rounded-full", BAR_CLASSES[barTone])} />
      <span className={cn("grid size-7 flex-none place-items-center rounded-[8px]", ICON_CLASSES[row.tone])}>
        <IconEl size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{row.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span className="truncate">{row.meta}</span>
          <span className="flex-none text-ink-faint">·</span>
          <span className="flex-none tabular">{row.dateLabel}</span>
        </span>
      </span>
    </>
  );
  if (row.href) {
    return (
      <Link href={row.href} className={classes}>
        {inner}
      </Link>
    );
  }
  return <div className={classes}>{inner}</div>;
}
