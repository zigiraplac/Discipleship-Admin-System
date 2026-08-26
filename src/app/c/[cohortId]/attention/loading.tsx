import { PageHead } from "@/components/shell/page-head";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGridSkeleton, CardGridSkeleton } from "@/components/ui/loading-blocks";

export default function AttentionLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Attention" />
      <StatGridSkeleton count={3} />
      <Skeleton className="h-8 w-72 rounded-control" />
      <CardGridSkeleton count={6} />
    </div>
  );
}
