import { Shell } from "@/components/shell/shell";

export default async function CohortLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  return <Shell activeCohortId={cohortId}>{children}</Shell>;
}
