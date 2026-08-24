import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/shell/page-head";
import { NewCohortWizard } from "@/components/wizard/new-cohort-wizard";

/** Admin-only: creating a cohort is not something facilitator/leadership/
 * teacher can do, even though facilitator and leadership can see /cohorts. */
export default async function NewCohortPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="New cohort" subtitle="Import students, set the days, generate the schedule." />
      <NewCohortWizard />
    </div>
  );
}
