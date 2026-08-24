import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCohorts } from "@/lib/data/cohorts";

export default async function RootPage() {
  await requireUser();
  const supabase = await createClient();
  const cohorts = await listCohorts(supabase);
  redirect(cohorts.length ? `/c/${cohorts[0].id}` : "/cohorts");
}
