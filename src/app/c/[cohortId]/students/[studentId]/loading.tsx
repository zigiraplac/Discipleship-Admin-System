import { Skeleton } from "@/components/ui/skeleton";
import { PanelSkeleton } from "@/components/ui/loading-blocks";

export default function StudentDetailLoading() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-7 w-48" />
      <PanelSkeleton lines={3} />
      <PanelSkeleton lines={4} />
    </div>
  );
}
