import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, roleLabel } from "@/lib/auth";
import { listCohorts } from "@/lib/data/cohorts";
import { getStudents } from "@/lib/data/students";
import { getCrusadeEvents, getLessonEvents, getLessonEventsPublic } from "@/lib/data/lessons";
import { getOutcomesForCohort, latestByStudent } from "@/lib/data/outcomes";
import { listNotifications, notificationCounts } from "@/lib/data/notifications";
import { describeNotifications } from "@/lib/notify/describe";
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
import { sectionsFor, unitHref, type OrgNav } from "./org-nav";
import { getAllUnits, getMyUnitRoles, getPolicy, getUnitReport, requireUnit } from "@/lib/data/org";
import { cohortCapabilities, getResponsibilities, unitTarget, type Capability } from "@/lib/authz";
import { decide } from "@/lib/authz/policy";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { cohortNavFor, type Workspace } from "@/lib/authz/nav";
import { buildWorkspaces } from "@/lib/authz/workspaces";
import type { OrgUnit } from "@/lib/domain/types";
import { ancestryOf, LEVELS } from "@/lib/domain/levels";
import { issuesFor } from "@/lib/domain/rollup";

const PAGE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  lessons: "Lessons",
  students: "Students",
  followup: "Follow Up",
  catchup: "Catch ups",
  activities: "Activities",
  calendar: "Calendar",
  reports: "Reports",
  cohorts: "Cohorts",
  settings: "Settings",
};

export async function Shell({
  cohortParam,
  unitParam = null,
  adminConsole = false,
  children,
}: {
  /** Whatever's in the url for a cohort-scoped page — a slug, or an old
   * link/notification still pointing at a raw uuid — or null on a global
   * page (Cohorts, Settings). */
  cohortParam: string | null;
  /** The box slug on a level page (/u/[unit]/...), else null. */
  unitParam?: string | null;
  /** The Super admin console (/admin): its own menu and workspace. */
  adminConsole?: boolean;
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const [cohorts, myUnits] = await Promise.all([listCohorts(supabase), getMyUnitRoles(user)]);
  const today = todayISO();

  // Organization levels: the person's own boxes, and the box whose menu
  // the sidebar shows — the one on screen on a level page, otherwise their
  // top box, so the level menu stays put on every page. Access to a box
  // in the URL is checked by requireUnit (database-side); a box outside
  // their area 404s before anything renders.
  let levelNav: Pick<OrgNav, "units" | "current"> | null = null;
  let investigated: OrgUnit | null = null;
  if (myUnits.length || unitParam) {
    // The menu is always one of *your own* levels. Following an exception
    // into a level below yours shows that level's summary, but the menu
    // stays yours (no browsing the tree level by level); the breadcrumbs
    // show where you are.
    const onScreen = unitParam ? (await requireUnit(unitParam)).unit : null;
    investigated = onScreen;
    const mine =
      (onScreen && myUnits.find((r) => r.unit.id === onScreen.id)) ??
      (onScreen && [...myUnits].reverse().find((r) => onScreen.path.startsWith(`${r.unit.path}.`))) ??
      myUnits[0];
    const shown = mine ? { unit: mine.unit, role: mine.role } : await requireUnit(unitParam!);
    const report = await getUnitReport(shown.unit.id);
    const issues = report.facts.flatMap((f) => issuesFor(f, report.today));
    levelNav = {
      units: myUnits.map((r) => ({ slug: r.unit.slug, name: r.unit.name, levelLabel: LEVELS[r.unit.type].label })),
      current: {
        slug: shown.unit.slug,
        name: shown.unit.name,
        type: shown.unit.type,
        levelLabel: LEVELS[shown.unit.type].label,
        partOf: report.ancestors.map((a) => a.name).join(" › "),
        sections: sectionsFor(shown.unit.type, shown.role === "leader").map((s) => ({ id: s.id, label: s.label })),
        attention: { count: issues.length, urgent: issues.some((i) => i.severity === "urgent") },
      },
    };
  }
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

  // Context: what the page is about decides the menu — a level page shows
  // that level's sections, a cohort page that cohort's pages (as far as
  // this person may see them there). Other pages (Cohorts, Accounts,
  // Profile) keep the person's main workspace: their top level if they
  // have one, otherwise their cohort.
  const responsibilities = await getResponsibilities(user);
  const context: "unit" | "cohort" = unitParam ? "unit" : cohortParam ? "cohort" : myUnits.length ? "unit" : "cohort";
  const navCohort = activeCohort ?? cohorts[0] ?? null;
  const cohortCaps = context === "cohort" && navCohort ? await cohortCapabilities(navCohort.id) : new Set<Capability>();
  // Only the administrator has system authority (the cohort directory).
  const isSystem = user.role === "admin";
  // Accounts live in the Super admin console now, not in any other menu.
  const globalNav = [...(isSystem || responsibilities.some((r) => r.kind === "cohort") ? ["cohorts"] : [])];
  const allowedNav = new Set([...(context === "cohort" ? cohortNavFor(cohortCaps) : []), ...globalNav]);
  const levelPortal = context === "unit";

  // Every place this person works, with the role they hold there — one
  // person can lead a promotion and teach two of its cohorts.
  const units = await getAllUnits();
  const workspaces: Workspace[] = [
    ...buildWorkspaces(responsibilities, units, cohorts),
    // TODO(permissions): the Super admin console is offered to everyone for now, on purpose.
    { kind: "admin", href: "/admin", title: "Super admin", role: "Accounts, countries, promotions" },
  ];
  const activeWorkspace =
    workspaces.find((w) =>
      adminConsole
        ? w.kind === "admin"
        : context === "unit" && levelNav?.current
          ? w.href === unitHref(levelNav.current.slug)
          : w.href === `/c/${navCohort?.slug}`
    ) ?? null;
  // Breadcrumbs: the levels above what's on screen; a level is a link only
  // if this person may open it. Cohort pages show none.
  const crumbUnits = (u: OrgUnit | undefined) => (u ? ancestryOf(u, units) : []);
  const crumbs: Crumb[] = [];
  if (context === "unit" && levelNav?.current) {
    for (const u of crumbUnits(investigated ?? units.find((x) => x.slug === levelNav!.current!.slug))) {
      crumbs.push({ label: u.name, href: decide(responsibilities, "view_org", unitTarget(u)).allowed ? unitHref(u.slug) : undefined });
    }
  }

  // System support access: an administrator opening a cohort they don't
  // work in. Allowed (system authority), but it can show student and
  // pastoral detail, so it's said on screen and recorded — once per cohort
  // per day.
  const supportAccess =
    !!activeCohort && user.role === "admin" && !responsibilities.some((r) => r.kind === "cohort" && r.cohortId === activeCohort.id);
  if (supportAccess) await recordSupportAccess(user.id, activeCohort!.id, today);

  const org: OrgNav = {
    units: levelNav?.units ?? [],
    current: levelNav?.current ?? null,
    context: adminConsole ? "admin" : levelNav?.current ? context : "cohort",
    allowedNav: [...allowedNav],
    workspaces,
    activeWorkspace: activeWorkspace?.href ?? null,
  };
  const displayRole =
    activeWorkspace?.role ??
    (context === "cohort" && cohortCaps.size ? "Viewing" : user.role === "admin" ? "Administrator" : roleLabel(user.role));

  // The switcher's per-cohort "34 students · 82%" line used to be
  // computed here for every cohort on every page load — the same heavy
  // full-register read the active cohort's own page already does, just
  // repeated for cohorts nobody's currently looking at. It's now fetched
  // client-side, on demand, the first time the dropdown is actually
  // opened (getCohortQuickStats, lib/actions/cohorts.ts).
  const switcherItems: CohortSwitcherItem[] = levelPortal || adminConsole
    ? []
    : cohorts.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));

  let badges: { lessons?: number; followup?: number; catchup?: number; calendar?: number } = {};
  const searchIndex = {
    pages: levelPortal
      ? [
          ...myUnits.flatMap((r) =>
            sectionsFor(r.unit.type, r.role === "leader").map((s) => ({ kind: "PAGE" as const, label: `${r.unit.name} · ${s.label}`, href: unitHref(r.unit.slug, s.id) }))
          ),
          ...(allowedNav.has("settings") ? [{ kind: "PAGE" as const, label: "Accounts", href: "/settings" }] : []),
        ]
      : NAV_ITEMS.filter((n) => allowedNav.has(n.id) && (!n.cohortScoped || linkCohortSlug)).map((n) => ({
          kind: "PAGE" as const,
          label: PAGE_LABELS[n.id],
          href: n.href(linkCohortSlug),
        })),
    students: [] as SearchResultItem[],
    lessons: [] as SearchResultItem[],
  };

  if (!levelPortal && activeCohortId && allowedNav.has("dashboard")) {
    if (!cohortCaps.has("view_attendance")) {
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
      // No notifications are created on page load: birthday reminders come
      // from the daily job, for the cohort's own team only (opening a
      // cohort — e.g. for support — must never generate pastoral alerts).
      const { bands } = await getPolicy();
      const agg = aggregateCohort(students, lessonEvents, bands, today);
      const latest = latestByStudent(outcomes);
      // Left students stay in the search index (still findable) but don't
      // count toward either badge — they're no longer tracked.
      const neverContacted = agg.roster.filter(
        (s) => !s.leftAt && (s.performance === "Needs help" || s.performance === "At risk") && !latest.has(s.id) && !s.contactedAt
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

  // Latest notifications, ready to show (who may open what, category,
  // context) — the same function the Notifications page uses — and the
  // unread totals across the whole history for the badge.
  const [notifications, notificationTotals] = await Promise.all([
    listNotifications(supabase, user.id, 20).then((list) => describeNotifications(list, user)),
    notificationCounts(supabase, user.id),
  ]);

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
              org={org}
              roleText={displayRole}
              className="no-print hidden lg:flex"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar
                role={user.role}
                cohorts={switcherItems}
                activeCohortId={activeCohortId}
                navCohortSlug={linkCohortSlug}
                userName={user.name}
                roleLabel={displayRole}
                notifications={notifications}
                notificationTotals={notificationTotals}
                badges={badges}
                org={org}
                className="no-print"
              />
              <main className="print-area min-w-0 flex-1 px-4 py-[18px] pb-[70px] sm:px-[26px] sm:py-[22px]">
                <Breadcrumbs crumbs={crumbs} />
                {supportAccess && (
                  <div className="no-print mb-3 rounded-[10px] border border-border bg-yellow-100 px-4 py-2.5 text-[12px] text-yellow-ink">
                    <span className="font-semibold">Support access.</span> You&apos;re viewing this cohort as a system administrator, not as part of its team. This visit is recorded.
                  </div>
                )}
                {children}
              </main>
            </div>
          </div>
        </ToastProvider>
      </PageHeadProvider>
    </SearchProvider>
  );
}


/** One audit entry per administrator, cohort and day for support access. */
async function recordSupportAccess(userId: string, cohortId: string, today: string) {
  const db = createAdminClient();
  const { count } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("cohort_id", cohortId)
    .eq("action", "support_access")
    .gte("created_at", `${today}T00:00:00Z`);
  if (count) return;
  await db.from("audit_log").insert({ actor_id: userId, entity: "cohort", entity_id: cohortId, cohort_id: cohortId, action: "support_access" });
}
