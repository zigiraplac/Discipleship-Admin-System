import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, roleLabel } from "@/lib/auth";
import { listCohorts, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { getQuickStats } from "@/lib/data/quick-stats";
import { listNotifications, ensureBirthdayNotifications } from "@/lib/data/notifications";
import { aggregateCohort } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { Sidebar } from "./sidebar";
import { TopBar, type CohortSwitcherItem } from "./top-bar";
import { PageHeadProvider } from "./page-head";
import { ToastProvider } from "@/components/ui/toast";
import { SearchProvider, type SearchResultItem } from "./search-palette";

const PAGE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  lessons: "Lessons",
  students: "Students",
  attention: "Attention",
  calendar: "Calendar",
  reports: "Reports",
  cohorts: "Cohorts",
  settings: "Settings",
};

export async function Shell({
  activeCohortId,
  children,
}: {
  activeCohortId: string | null;
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const [cohorts, bands] = await Promise.all([listCohorts(supabase), getBands(supabase)]);
  const today = todayISO();

  // On a global page (Cohorts, Settings) there's no cohort in the URL, so
  // `activeCohortId` is null — but cohort-scoped nav items (Dashboard,
  // Lessons, ...) still need *somewhere* to point. Fall back to the
  // first cohort the user can see; if there are none at all yet, those
  // items have nowhere to go and get hidden instead (see Sidebar).
  const linkCohortId = activeCohortId ?? cohorts[0]?.id ?? null;

  const allowedNav = new Set(
    {
      facilitator: ["dashboard", "lessons", "students", "attention", "calendar", "reports", "cohorts"],
      admin: ["dashboard", "lessons", "students", "attention", "calendar", "reports", "cohorts", "settings"],
      teacher: ["dashboard", "lessons", "calendar", "reports"],
      leadership: ["dashboard", "students", "reports", "cohorts"],
    }[user.role]
  );

  const quickStats = await Promise.all(
    cohorts.map((c) => getQuickStats(supabase, c.id, bands, today, user.role))
  );
  const switcherItems: CohortSwitcherItem[] = cohorts.map((c, i) => ({
    id: c.id,
    name: c.name,
    meta: `${quickStats[i].enrolled} students · ${quickStats[i].rate}%`,
    health: quickStats[i].health,
  }));

  let badges: { lessons?: number; attention?: number } = {};
  const searchIndex = {
    pages: NAV_ITEMS.filter((n) => allowedNav.has(n.id) && (!n.cohortScoped || linkCohortId)).map((n) => ({
      kind: "PAGE" as const,
      label: PAGE_LABELS[n.id],
      href: n.href(linkCohortId),
    })),
    students: [] as SearchResultItem[],
    lessons: [] as SearchResultItem[],
  };

  if (activeCohortId && allowedNav.has("dashboard")) {
    if (user.role === "teacher") {
      const pub = await getLessonEventsPublic(supabase, activeCohortId);
      const outstanding = pub.filter((p) => !p.recorded && p.date <= today);
      badges = { lessons: outstanding.length || undefined };
      searchIndex.lessons = pub.map((p) => ({
        kind: "LESSON",
        label: p.lessonTitle,
        href: `/c/${activeCohortId}/lessons`,
        meta: p.lessonRef,
      }));
    } else {
      const [students, lessonEvents, outcomes] = await Promise.all([
        getStudents(supabase, activeCohortId),
        getLessonEvents(supabase, activeCohortId),
        getOutcomesForCohort(supabase, activeCohortId),
      ]);
      // Opportunistic — a birthday has no discrete moment to notify at, so
      // this just ensures the next 7 days' worth exist every time someone
      // with access to this cohort happens to load its dashboard.
      await ensureBirthdayNotifications(createAdminClient(), user.id, students, today);
      const agg = aggregateCohort(students, lessonEvents, bands, today);
      const latest = latestByStudent(outcomes);
      const toContact = agg.roster.filter((s) => s.status !== "On track" && !latest.has(s.id)).length;
      badges = {
        lessons: agg.outstanding.length || undefined,
        attention: allowedNav.has("attention") ? toContact || undefined : undefined,
      };
      if (allowedNav.has("students")) {
        searchIndex.students = agg.roster.map((s) => ({
          kind: "STUDENT",
          label: s.fullName,
          href: `/c/${activeCohortId}/students/${s.id}`,
          meta: `${s.rate}%`,
        }));
      }
      if (allowedNav.has("lessons")) {
        searchIndex.lessons = lessonEvents.map((e) => ({
          kind: "LESSON",
          label: e.lessonTitle,
          href: `/c/${activeCohortId}/lessons/${e.eventId}`,
          meta: e.lessonRef,
        }));
      }
    }
  }

  const notifications = await listNotifications(supabase, user.id, 20);

  return (
    <SearchProvider index={searchIndex}>
      <PageHeadProvider>
        <ToastProvider>
          <div className="flex min-h-screen bg-page">
            <Sidebar role={user.role} activeCohortId={linkCohortId} badges={badges} className="hidden lg:flex" />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar
                role={user.role}
                cohorts={switcherItems}
                activeCohortId={activeCohortId}
                navCohortId={linkCohortId}
                userName={user.name}
                roleLabel={roleLabel(user.role)}
                notifications={notifications}
                badges={badges}
              />
              <main className="min-w-0 flex-1 px-4 py-[18px] pb-[70px] sm:px-[26px] sm:py-[22px]">{children}</main>
            </div>
          </div>
        </ToastProvider>
      </PageHeadProvider>
    </SearchProvider>
  );
}
