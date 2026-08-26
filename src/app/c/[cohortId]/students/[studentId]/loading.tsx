import { PageHead } from "@/components/shell/page-head";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelSkeleton } from "@/components/ui/loading-blocks";

export default function StudentDetailLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Student" />
      <Skeleton className="h-4 w-24" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <PanelSkeleton lines={3} />
          <PanelSkeleton lines={4} />
          <PanelSkeleton lines={3} />
        </div>
        <div className="flex flex-col gap-4">
          <PanelSkeleton lines={2} />
          <PanelSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
