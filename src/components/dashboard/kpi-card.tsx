import type { Icon } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
      {children}
    </div>
  );
}

export type DeltaTone = "ok" | "warn" | "bad";

export function KpiCard({
  icon: IconEl,
  label,
  value,
  delta,
  deltaTone,
  sub,
}: {
  icon: Icon;
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaTone?: DeltaTone;
  sub: React.ReactNode;
}) {
  return (
    <Card className="p-[15px] px-4">
      <div className="flex items-center gap-2">
        <span className="grid size-6 flex-none place-items-center rounded-[7px] bg-accent-100 text-accent-800">
          <IconEl size={14} />
        </span>
        <span className="text-xs font-semibold text-ink-tertiary">{label}</span>
      </div>
      <div className="mt-2.5 flex items-end gap-2">
        <span className="text-[28px] font-bold leading-none text-ink tabular">{value}</span>
        {delta && (
          <span
            className={cn(
              "pb-0.5 text-[11px] font-bold",
              deltaTone === "ok" && "text-accent-700",
              deltaTone === "warn" && "text-yellow-ink",
              deltaTone === "bad" && "text-accent-2-700"
            )}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-ink-muted">{sub}</div>
    </Card>
  );
}
