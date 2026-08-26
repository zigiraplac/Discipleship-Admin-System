import { PageHead } from "@/components/shell/page-head";
import { PanelSkeleton } from "@/components/ui/loading-blocks";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Calendar" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <PanelSkeleton lines={5} />
        <Card className="p-[18px]">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-24 rounded-control" />
          </div>
          <div className="mt-5 grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-[8px]" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
