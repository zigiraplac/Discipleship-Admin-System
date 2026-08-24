import { cn } from "@/lib/utils";
import { Card } from "./card";

/** The simpler KPI card used on Lessons, Attention, Reports — no icon, no delta. */
export function StatCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-3.5 px-4", className)}>
      <div className="text-xs font-semibold text-ink-tertiary">{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none text-ink tabular">{value}</div>
      {sub && <div className="mt-[5px] text-xs text-ink-muted">{sub}</div>}
    </Card>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("grid gap-3.5", className)}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}
    >
      {children}
    </div>
  );
}
