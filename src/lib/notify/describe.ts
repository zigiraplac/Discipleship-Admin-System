import { createClient } from "@/lib/supabase/server";
import { listCohorts } from "@/lib/data/cohorts";
import { getAllUnits } from "@/lib/data/org";
import { cohortCapabilities, getResponsibilities, unitTarget } from "@/lib/authz";
import { decide } from "@/lib/authz/policy";
import { cohortNavFor } from "@/lib/authz/nav";
import { actionLabelFor, categoryOf } from "@/lib/domain/notification-category";
import type { NotificationView } from "@/lib/data/notifications";
import type { AppUser } from "@/lib/domain/types";

/**
 * Ready to show: for each notification, whether this person may open its
 * link (their own capabilities on the cohort or level it points at — a
 * notification is never a way around access), its category, the cohort or
 * level it concerns, and what opening it does. Used by the bell and the
 * Notifications page alike, so they always agree.
 *
 * Outcome notices are always shown neutrally — early ones carried a
 * student's name in the title, and some went to teachers.
 */
export async function describeNotifications(list: NotificationView[], user: AppUser): Promise<NotificationView[]> {
  if (!list.length) return list;
  const supabase = await createClient();
  const [cohorts, units, responsibilities] = await Promise.all([listCohorts(supabase), getAllUnits(), getResponsibilities(user)]);
  const navCache = new Map<string, string[]>();
  const navFor = async (cohortId: string) => {
    if (!navCache.has(cohortId)) navCache.set(cohortId, cohortNavFor(await cohortCapabilities(cohortId)));
    return navCache.get(cohortId)!;
  };

  return Promise.all(
    list.map(async (n) => {
      let canOpen: boolean | undefined;
      let context: string | null = null;
      const c = n.href ? /^\/c\/([^/?#]+)\/?([^/?#]*)/.exec(n.href) : null;
      const u = n.href ? /^\/u\/([^/?#]+)/.exec(n.href) : null;
      const dataCohortId = n.data && "cohortId" in n.data ? n.data.cohortId : null;
      const digestCohort = dataCohortId ? cohorts.find((x) => x.id === dataCohortId) : undefined;
      if (c) {
        const cohort = cohorts.find((x) => x.slug === c[1] || x.id === c[1]);
        canOpen = !!cohort && (await navFor(cohort.id)).includes(c[2] || "dashboard");
        context = cohort?.name.trim() ?? null;
      } else if (u) {
        const unit = units.find((x) => x.slug === u[1]);
        canOpen = !!unit && decide(responsibilities, "view_org", unitTarget(unit)).allowed;
        context = unit?.name ?? null;
      } else if (n.href?.startsWith("/settings")) {
        canOpen = user.role === "admin";
      }
      if (!context && digestCohort) context = digestCohort.name.trim();
      const neutral =
        n.kind === "outcome_recorded"
          ? { title: `An outcome was recorded${context ? ` in ${context}` : ""}`, body: "Open Follow Up to see it." }
          : {};
      return {
        ...n,
        ...neutral,
        canOpen,
        category: categoryOf(n.kind),
        context,
        actionLabel: canOpen === false ? null : actionLabelFor(n.href),
      };
    })
  );
}
