import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

export interface UpNextRow {
  href: string;
  day: string;
  month: string;
  title: string;
  meta: string;
  outstanding: boolean;
}

export function UpNext({ rows }: { rows: UpNextRow[] }) {
  return (
    <Card className="p-[18px]">
      <div className="text-[15px] font-bold text-ink">Up next</div>
      <div className="mt-3.5 flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <Link
            key={i}
            href={r.href}
            className="flex items-start gap-3 rounded-[10px] border border-border-soft bg-subtle px-3 py-[11px] hover:border-accent-300 hover:bg-card"
          >
            <span
              className={cn(
                "w-[42px] flex-none rounded-[9px] py-1.5 text-center",
                r.outstanding ? "bg-accent-2-100 text-accent-2-700" : "bg-divider text-ink-secondary"
              )}
            >
              <span className="block text-[15px] font-bold leading-none tabular">{r.day}</span>
              <span className="mt-0.5 block text-[9px] uppercase tracking-wide">{r.month}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold leading-snug text-ink">{r.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <Pill tone={r.outstanding ? "magenta" : "grey"}>
                  {r.outstanding ? "No register" : "Upcoming"}
                </Pill>
                <span className="text-[11px] text-ink-muted">{r.meta}</span>
              </span>
            </span>
          </Link>
        ))}
        {rows.length === 0 && (
          <div className="rounded-[10px] border border-border-soft bg-subtle px-3 py-4 text-center text-[13px] text-ink-muted">
            Nothing left to teach — 80 of 80 recorded.
          </div>
        )}
      </div>
    </Card>
  );
}
