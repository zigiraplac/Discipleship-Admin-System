import { Card } from "./card";
import { Skeleton } from "./skeleton";

/** Mirrors `KpiRow`/`KpiCard` (dashboard/kpi-card.tsx) — label+icon row,
 * big value + delta pill row, sub caption. */
export function KpiRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-[15px] px-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="size-8 flex-none rounded-full" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-5 w-12 rounded-pill" />
          </div>
          <Skeleton className="mt-2.5 h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

/** Mirrors `StatGrid`/`StatCard` (ui/stat-card.tsx) — used on Lessons,
 * Attention, and Reports. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-3.5 px-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2.5 h-6 w-10" />
          <Skeleton className="mt-2 h-3 w-20" />
        </Card>
      ))}
    </div>
  );
}

/** A generic titled card body — a chart, an upcoming-events list, a
 * profile panel, anything that's "a card with some lines of content" from
 * a distance. */
export function PanelSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <Card className={className ?? "p-[18px]"}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-3 w-40" />
      <div className="mt-5 flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-[9px]" />
        ))}
      </div>
    </Card>
  );
}

/** Mirrors `AttendanceChart` (dashboard/attendance-chart.tsx) — header row
 * with a segmented toggle and two numbers, then a row of bars. */
export function ChartSkeleton({ bars = 16 }: { bars?: number }) {
  const heights = Array.from({ length: bars }, (_, i) => 30 + ((i * 37) % 70));
  return (
    <Card className="p-[18px]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <Skeleton className="h-7 w-32 rounded-control" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="mt-[18px] flex items-end justify-center gap-2" style={{ height: 170 }}>
        {heights.map((h, i) => (
          <Skeleton key={i} className="w-2.5 flex-1 max-w-[34px] rounded-t-[3px]" style={{ height: `${h}%` }} />
        ))}
      </div>
    </Card>
  );
}

/** Mirrors a data table with a header row and striped body rows — Students,
 * Lessons, Settings' people table. */
export function TableSkeleton({ rows = 7, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 border-b border-divider px-[18px] py-3.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" style={{ maxWidth: i === 0 ? 160 : 90 }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-divider px-[18px] py-3.5 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" style={{ maxWidth: c === 0 ? 160 : 90 }} />
          ))}
        </div>
      ))}
    </Card>
  );
}

/** Mirrors the Attention/Cohorts card grids — a row of avatar+name-shaped
 * tiles. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 flex-none rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-2 w-full rounded-full" />
        </Card>
      ))}
    </div>
  );
}

/** Mirrors the "Whole journey" heatmap (lessons-heatmap.tsx) — a wide grid
 * of small pulsing squares. */
export function HeatmapSkeleton() {
  return (
    <Card className="overflow-hidden p-[18px]">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-3 w-64" />
      <div
        className="mt-5 grid"
        style={{ gridTemplateColumns: "repeat(52, 11px)", gridTemplateRows: "repeat(7, 11px)", gap: 3 }}
      >
        {Array.from({ length: 52 * 7 }).map((_, i) => (
          <Skeleton key={i} className="rounded-[2px]" />
        ))}
      </div>
    </Card>
  );
}
