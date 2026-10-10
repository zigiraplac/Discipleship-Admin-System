import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCohorts } from "@/lib/data/cohorts";
import { getMyUnitRoles } from "@/lib/data/org";

/** Where someone lands after signing in: their highest organization level
 * if they have one (admin and leadership act as HQ), otherwise their
 * first cohort — exactly as before for facilitators and teachers. */
export default async function RootPage() {
  const user = await requireUser();
  const myUnits = await getMyUnitRoles(user);
  if (myUnits.length) redirect(`/u/${myUnits[0].unit.slug}`);

  const supabase = await createClient();
  const cohorts = await listCohorts(supabase);
  redirect(cohorts.length ? `/c/${cohorts[0].slug}` : "/cohorts");
}
