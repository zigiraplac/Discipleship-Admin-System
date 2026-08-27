import { TrendUp, TrendDown } from "@phosphor-icons/react/dist/ssr";
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
  icon,
  label,
  value,
  delta,
  deltaTone,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaTone?: DeltaTone;
  sub: React.ReactNode;
}) {
  return (
    <Card className="p-[15px] px-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-tertiary">{label}</span>
        <span className="grid size-8 flex-none place-items-center rounded-full bg-accent-100 text-accent-800">
          {icon}
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[28px] font-bold leading-none text-ink tabular">{value}</span>
        {delta && (
          <span
            className={cn(
              "inline-flex flex-none items-center gap-1 rounded-pill px-2 py-[3px] text-[11px] font-bold",
              deltaTone === "ok" && "bg-emerald-100 text-emerald-700",
              deltaTone === "warn" && "bg-yellow-100 text-yellow-ink",
              deltaTone === "bad" && "bg-accent-2-100 text-accent-2-700"
            )}
          >
            {deltaTone === "ok" && <TrendUp size={11} weight="bold" />}
            {deltaTone === "bad" && <TrendDown size={11} weight="bold" />}
            {delta}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-ink-muted">{sub}</div>
    </Card>
  );
}
