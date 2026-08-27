import { Shell } from "@/components/shell/shell";

export default async function CohortLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: cohortParam } = await params;
  // Resolved inside Shell, against the cohort list it already fetches for
  // the switcher — not here. A separate getCohort() call in this layout
  // would block Shell (and everything else on the page) behind one extra,
  // fully sequential database round trip on every single navigation,
  // since nothing below this component can start until an async layout's
  // own await resolves.
  return <Shell cohortParam={cohortParam}>{children}</Shell>;
}
