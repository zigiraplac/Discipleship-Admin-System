import { PageHead } from "@/components/shell/page-head";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function RegisterLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Lesson" />
      <Skeleton className="h-4 w-24" />
      <Card className="p-[18px]">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-56" />
        <div className="mt-5 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-[9px]" />
          ))}
        </div>
      </Card>
    </div>
  );
}
