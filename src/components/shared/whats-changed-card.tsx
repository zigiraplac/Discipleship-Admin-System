import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { formatShortDate } from "@/lib/utils";
import { monthLabel } from "@/components/reports/report-utils";
import type { MajorChange } from "@/lib/data/audit";

/**
 * A month-by-month narrative of schedule-affecting changes, with whatever
 * reason was on record — the thing a plain attendance chart (or a bare
 * status pill on the Crusades page) can't tell on its own: not just "what
 * the numbers were" or "is this done," but "what happened, when, and why."
 * Shared by Reports (lesson/cohort changes) and Crusades (crusade weekend
 * postponements) — each passes its own pre-filtered slice of `MajorChange[]`
 * (see `changeKind` in src/lib/data/audit.ts) and copy.
 */
export function WhatsChangedCard({
  changes,
  title = "What changed",
  subtitle = "Postponements and other schedule-affecting changes, with reasons where given",
  emptyLabel = "Nothing schedule-affecting has happened here yet.",
}: {
  changes: MajorChange[];
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
}) {
  const byMonth = new Map<string, MajorChange[]>();
  for (const c of changes) {
    const list = byMonth.get(c.month) ?? [];
    list.push(c);
    byMonth.set(c.month, list);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardSubtitle>{subtitle}</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-5 px-[18px] py-4">
        {months.map((month) => {
          const y = month.split("-")[0];
          return (
            <div key={month} className="flex flex-col gap-3">
              <div className="text-[13px] font-bold text-ink">
                {monthLabel(month)} {y}
              </div>
              <div className="flex flex-col gap-2.5">
                {byMonth.get(month)!.map((c) => (
                  <div key={c.id} className="rounded-control border border-border-soft px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-semibold text-ink">{c.summary}</span>
                      <span className="flex-none text-[11px] text-ink-faint tabular">{formatShortDate(c.date)}</span>
                    </div>
                    {c.effect && <div className="mt-1 text-xs text-ink-muted">{c.effect}</div>}
                    <div className="mt-1.5 text-xs">
                      {c.reason ? (
                        <span className="text-ink-secondary">
                          <span className="font-semibold">Reason:</span> {c.reason}
                        </span>
                      ) : (
                        <span className="text-ink-faint">No reason given.</span>
                      )}
                    </div>
                    {c.actorName && <div className="mt-1 text-[11px] text-ink-faint">— {c.actorName}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {months.length === 0 && <div className="py-6 text-center text-sm text-ink-muted">{emptyLabel}</div>}
      </div>
    </Card>
  );
}
