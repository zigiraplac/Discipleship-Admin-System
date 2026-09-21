import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, roleLabel } from "@/lib/auth";
import { NAV_BY_ROLE } from "@/lib/roles";
import { listCohorts, getBands } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getCrusadeEvents, getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { listNotifications, ensureBirthdayNotifications } from "@/lib/data/notifications";
import { aggregateCohort } from "@/lib/domain/metrics";
import { daysUntilAnnual } from "@/lib/domain/birthdays";
import { todayISO } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { Sidebar } from "./sidebar";
import { TopBar, type CohortSwitcherItem } from "./top-bar";
import { PageHeadProvider } from "./page-head";
import { ToastProvider } from "@/components/ui/toast";
import { SearchProvider, type SearchResultItem } from "./search-palette";
import { IdleLogout } from "./idle-logout";

const PAGE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  lessons: "Lessons",
  students: "Students",
  followup: "Follow Up",
  catchup: "Catch ups",
  crusades: "Crusades",
  calendar: "Calendar",
  reports: "Reports",
  cohorts: "Cohorts",
  settings: "Settings",
};

export async function Shell({
  cohortParam,
  children,
}: {
  /** Whatever's in the url for a cohort-scoped page — a slug, or an old
   * link/notification still pointing at a raw uuid — or null on a global
   * page (Cohorts, Settings). */
  cohortParam: string | null;
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const [cohorts, bands] = await Promise.all([listCohorts(supabase), getBands(supabase)]);
  const today = todayISO();

  // Resolved against the list just fetched above, not a separate
  // getCohort() query — listCohorts() already carries every cohort's own
  // id and slug, so matching in memory here costs nothing extra and,
  // more importantly, doesn't add a blocking round trip in front of
  // Shell (see layout.tsx for why that mattered).
  const activeCohort = cohortParam
    ? (cohorts.find((c) => c.slug === cohortParam || c.id === cohortParam) ?? null)
    : null;
  if (cohortParam && !activeCohort) notFound();
  const activeCohortId = activeCohort?.id ?? null;
  // Every link this component builds (nav, search index, switcher) uses
  // the slug — activeCohortId stays a real id purely for the data-fetching
  // below, which needs the actual cohort_id foreign key.
  const linkCohortSlug = activeCohort?.slug ?? cohorts[0]?.slug ?? null;

  const allowedNav = new Set(NAV_BY_ROLE[user.role]);

  // The switcher's per-cohort "34 students · 82%" line used to be
  // computed here for every cohort on every page load — the same heavy
  // full-register read the active cohort's own page already does, just
  // repeated for cohorts nobody's currently looking at. It's now fetched
  // client-side, on demand, the first time the dropdown is actually
  // opened (getCohortQuickStats, lib/actions/cohorts.ts).
  const switcherItems: CohortSwitcherItem[] = cohorts.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));

  let badges: { lessons?: number; followup?: number; catchup?: number; calendar?: number } = {};
  const searchIndex = {
    pages: NAV_ITEMS.filter((n) => allowedNav.has(n.id) && (!n.cohortScoped || linkCohortSlug)).map((n) => ({
      kind: "PAGE" as const,
      label: PAGE_LABELS[n.id],
      href: n.href(linkCohortSlug),
    })),
    students: [] as SearchResultItem[],
    lessons: [] as SearchResultItem[],
  };

  if (activeCohortId && allowedNav.has("dashboard")) {
    if (user.role === "teacher") {
      const [pub, crusadeEvents] = await Promise.all([
        getLessonEventsPublic(supabase, activeCohortId),
        getCrusadeEvents(supabase, activeCohortId),
      ]);
      const outstanding = pub.filter((p) => !p.recorded && p.date <= today);
      // "Something's happening today" — a lightweight nudge toward Calendar,
      // same idea as every other nav badge, just keyed off dates instead of
      // an open task. Teacher's version skips the birthday check (would
      // need a students fetch this branch doesn't otherwise do).
      const todayCount =
        pub.filter((p) => p.date === today).length + crusadeEvents.filter((e) => e.date === today).length;
      badges = { lessons: outstanding.length || undefined, calendar: allowedNav.has("calendar") ? todayCount || undefined : undefined };
      searchIndex.lessons = pub.map((p) => ({
        kind: "LESSON",
        label: p.lessonTitle,
        href: `/c/${linkCohortSlug}/lessons`,
        meta: p.lessonRef,
      }));
    } else {
      const [students, lessonEvents, outcomes, crusadeEvents] = await Promise.all([
        getStudents(supabase, activeCohortId),
        getLessonEvents(supabase, activeCohortId),
        getOutcomesForCohort(supabase, activeCohortId),
        getCrusadeEvents(supabase, activeCohortId),
      ]);
      // Opportunistic — a birthday has no discrete moment to notify at, so
      // this just ensures the next 7 days' worth exist every time someone
      // with access to this cohort happens to load its dashboard. Also
      // covered by the daily cron sweep (src/app/api/cron/notifications)
      // at a fixed time regardless of whether anyone visits.
      await ensureBirthdayNotifications(
        createAdminClient(),
        user.id,
        students.filter((s) => !s.leftAt),
        today
      );
      const agg = aggregateCohort(students, lessonEvents, bands, today);
      const latest = latestByStudent(outcomes);
      // Left students stay in the search index (still findable) but don't
      // count toward either badge — they're no longer tracked.
      const neverContacted = agg.roster.filter(
        (s) => !s.leftAt && s.status !== "On track" && !latest.has(s.id) && !s.contactedAt
      ).length;
      const readyToUpdate = agg.roster.filter(
        (s) => !s.leftAt && latest.get(s.id)?.kind === "catchup" && s.missed === 0
      ).length;
      // "Something's happening today" — a lesson due, a crusade day, or a
      // student's birthday — nudges toward Calendar the same way every
      // other nav badge nudges toward its own page, instead of only
      // showing up if someone happens to open it.
      const birthdaysToday = students.filter(
        (s) => !s.leftAt && s.dobDay != null && s.dobMonth != null && daysUntilAnnual(s.dobDay, s.dobMonth, today) === 0
      ).length;
      const todayCount =
        lessonEvents.filter((e) => e.date === today).length +
        crusadeEvents.filter((e) => e.date === today).length +
        birthdaysToday;
      badges = {
        lessons: agg.outstanding.length || undefined,
        followup: allowedNav.has("followup") ? neverContacted || undefined : undefined,
        catchup: allowedNav.has("catchup") ? readyToUpdate || undefined : undefined,
        calendar: allowedNav.has("calendar") ? todayCount || undefined : undefined,
      };
      if (allowedNav.has("students")) {
        searchIndex.students = agg.roster.map((s) => ({
          kind: "STUDENT",
          label: s.fullName,
          href: `/c/${linkCohortSlug}/students/${s.id}`,
          meta: `${s.rate}%`,
        }));
      }
      if (allowedNav.has("lessons")) {
        searchIndex.lessons = lessonEvents.map((e) => ({
          kind: "LESSON",
          label: e.lessonTitle,
          href: `/c/${linkCohortSlug}/lessons/${e.eventId}`,
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
          <IdleLogout />
          <div className="flex min-h-screen bg-page">
            <Sidebar
              role={user.role}
              activeCohortSlug={linkCohortSlug}
              badges={badges}
              className="no-print hidden lg:flex"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar
                role={user.role}
                cohorts={switcherItems}
                activeCohortId={activeCohortId}
                navCohortSlug={linkCohortSlug}
                userName={user.name}
                roleLabel={roleLabel(user.role)}
                notifications={notifications}
                badges={badges}
                className="no-print"
              />
              <main className="print-area min-w-0 flex-1 px-4 py-[18px] pb-[70px] sm:px-[26px] sm:py-[22px]">
                {children}
              </main>
            </div>
          </div>
        </ToastProvider>
      </PageHeadProvider>
    </SearchProvider>
  );
}
