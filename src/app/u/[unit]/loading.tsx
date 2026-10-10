import { ChartSkeleton, KpiRowSkeleton, PanelSkeleton } from "@/components/ui/loading-blocks";

export default function LevelLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <KpiRowSkeleton />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartSkeleton />
        <PanelSkeleton lines={4} />
      </div>
    </div>
  );
}
