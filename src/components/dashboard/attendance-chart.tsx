import { Card } from "@/components/ui/card";

export interface ChartBar {
  label: string; // "L28"
  title: string; // "C2 · L11 · 79%" — native tooltip
  rate: number;
}

export function AttendanceChart({ bars }: { bars: ChartBar[] }) {
  const avg = bars.length ? Math.round(bars.reduce((a, b) => a + b.rate, 0) / bars.length) : 0;
  const latest = bars.length ? bars[bars.length - 1].rate : 0;

  return (
    <Card className="p-[18px]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">Attendance</div>
          <div className="mt-0.5 text-xs text-ink-muted">Last {bars.length} lessons</div>
        </div>
        <div className="flex gap-[18px]">
          <div>
            <div className="text-xl font-bold leading-none text-ink tabular">{avg}%</div>
            <div className="text-[11px] text-ink-muted">average</div>
          </div>
          <div>
            <div className="text-xl font-bold leading-none text-accent-700 tabular">{latest}%</div>
            <div className="text-[11px] text-ink-muted">latest</div>
          </div>
        </div>
      </div>
      <div className="mt-[18px] flex h-[148px] items-end gap-1.5">
        {bars.map((b, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={b.title}>
            <div
              className="w-full rounded-t-[4px] rounded-b-[2px]"
              style={{
                height: `${Math.max(4, b.rate)}%`,
                background: i === bars.length - 1 ? "var(--color-accent)" : "var(--color-accent-300)",
              }}
            />
            <div className="text-[9px] text-ink-faint tabular">{b.label}</div>
          </div>
        ))}
        {bars.length === 0 && (
          <div className="flex w-full items-center justify-center text-xs text-ink-faint">
            No registers saved yet.
          </div>
        )}
      </div>
    </Card>
  );
}
