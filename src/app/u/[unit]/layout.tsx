import { Shell } from "@/components/shell/shell";
import { OverviewPanelProvider } from "@/components/network/overview-panel";

/** Level pages (HQ, continent, country, region, church, promotion). Shell
 * checks the viewer may see this box before anything renders; the panel
 * provider lets any child be opened as an overview without leaving. */
export default async function UnitLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ unit: string }>;
}) {
  const { unit } = await params;
  return (
    <Shell cohortParam={null} unitParam={unit}>
      <OverviewPanelProvider>{children}</OverviewPanelProvider>
    </Shell>
  );
}
