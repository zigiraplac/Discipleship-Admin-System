import { PageHead } from "@/components/shell/page-head";
import { PanelSkeleton, CardGridSkeleton } from "@/components/ui/loading-blocks";

export default function CohortsLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Cohorts" />
      <PanelSkeleton lines={3} />
      <CardGridSkeleton count={4} />
    </div>
  );
}
