import { PageHead } from "@/components/shell/page-head";
import { TableSkeleton } from "@/components/ui/loading-blocks";

export default function StudentsLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Students" />
      <TableSkeleton rows={10} cols={5} />
    </div>
  );
}
