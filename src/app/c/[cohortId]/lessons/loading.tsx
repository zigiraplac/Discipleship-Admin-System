import { PageHead } from "@/components/shell/page-head";
import { StatGridSkeleton, TableSkeleton } from "@/components/ui/loading-blocks";

export default function LessonsLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Lessons" />
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={10} cols={5} />
    </div>
  );
}
