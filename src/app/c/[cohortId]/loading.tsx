import { PageHead } from "@/components/shell/page-head";
import { ChartSkeleton, HeatmapSkeleton, KpiRowSkeleton, PanelSkeleton, TableSkeleton } from "@/components/ui/loading-blocks";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Dashboard" />

      <KpiRowSkeleton />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ChartSkeleton />
          <HeatmapSkeleton />
        </div>
        <PanelSkeleton lines={6} />
      </div>

      <TableSkeleton rows={4} cols={5} />
    </div>
  );
}
