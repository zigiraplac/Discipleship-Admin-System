import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCohort } from "@/lib/data/cohorts";
import { Shell } from "@/components/shell/shell";

export default async function CohortLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId: slugOrId } = await params;
  const supabase = await createClient();
  // The url segment is a slug now (or, for an old link/notification still
  // pointing at a raw uuid, that) — resolved once here so Shell and every
  // page below it keep working with the real cohort id they've always
  // used. getCohort is cache()-wrapped, so pages that resolve it again
  // for the same value don't pay for a second round trip.
  const cohort = await getCohort(supabase, slugOrId);
  if (!cohort) notFound();
  return <Shell activeCohortId={cohort.id}>{children}</Shell>;
}
