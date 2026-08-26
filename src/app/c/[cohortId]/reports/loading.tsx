import { PageHead } from "@/components/shell/page-head";
import { ChartSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/loading-blocks";

export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Reports" />
      <StatGridSkeleton count={4} />
      <ChartSkeleton bars={12} />
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
