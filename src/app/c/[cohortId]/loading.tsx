import { PageHead } from "@/components/shell/page-head";
import { ChartSkeleton, KpiRowSkeleton, PanelSkeleton } from "@/components/ui/loading-blocks";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Dashboard" />

      <KpiRowSkeleton />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ChartSkeleton />
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <PanelSkeleton lines={2} />
            <PanelSkeleton lines={2} />
          </div>
          <PanelSkeleton lines={4} />
          <PanelSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
