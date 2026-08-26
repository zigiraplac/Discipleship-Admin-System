import { PageHead } from "@/components/shell/page-head";
import { TableSkeleton, PanelSkeleton } from "@/components/ui/loading-blocks";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Settings" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <TableSkeleton rows={8} cols={3} />
        <PanelSkeleton lines={3} />
      </div>
    </div>
  );
}
