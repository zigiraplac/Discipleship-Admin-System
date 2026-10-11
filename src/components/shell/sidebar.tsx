"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { GlobeHemisphereEast, Plus, Stack, Student, UsersThree } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { NAV_ITEMS, NAV_GROUP_LABELS, NAV_GROUP_ORDER, type NavItem } from "./nav-items";
import { UNIT_SECTIONS, unitHref, type OrgNav } from "./org-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/domain/types";

// The Dashboard page itself titles as "Overview" for leadership
// (src/app/c/[cohortId]/page.tsx) — this keeps the sidebar label in sync
// with that instead of always reading "Dashboard" regardless of role.
function navLabel(item: NavItem, role: Role): string {
  if (item.id === "dashboard" && role === "leadership") return "Overview";
  return item.label;
}

/** The Super admin console's menu. */
const ADMIN_ITEMS: { label: string; href: string; icon: Icon }[] = [
  { label: "Accounts", href: "/admin/accounts", icon: UsersThree },
  { label: "Countries", href: "/admin/countries", icon: GlobeHemisphereEast },
  { label: "Promotions", href: "/admin/promotions", icon: Student },
  { label: "Cohorts", href: "/admin/cohorts", icon: Stack },
];

function isActive(id: string, pathname: string, cohortSlug: string | null): boolean {
  if (id === "dashboard") return pathname === `/c/${cohortSlug}`;
  if (["lessons", "students", "followup", "catchup", "activities", "calendar", "reports"].includes(id)) {
    return pathname.startsWith(`/c/${cohortSlug}/${id}`);
  }
  if (id === "cohorts") return pathname.startsWith("/cohorts");
  if (id === "settings") return pathname.startsWith("/settings");
  return false;
}

function SidebarNavItem({
  icon: Icon,
  label,
  href,
  active,
  badge,
  badgeTone = "alert",
  onNavigate,
}: {
  icon: Icon;
  label: string;
  href: string;
  active: boolean;
  badge?: number;
  /** "alert" = red (something urgent), "quiet" = grey count. */
  badgeTone?: "alert" | "quiet";
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-control px-2.5 py-[9px] text-[13px] font-medium text-ink-secondary hover:bg-hover",
        active && "bg-accent-100 font-bold text-accent-800 hover:bg-accent-100"
      )}
    >
      <Icon size={17} />
      <span className="flex-1 text-left">{label}</span>
      {!!badge && (
        <span
          className={cn(
            "grid h-[17px] min-w-[17px] flex-none place-items-center rounded-full px-1 text-[10px] font-bold leading-none",
            badgeTone === "alert" ? "bg-accent-2-500 text-white" : "bg-hover text-ink-tertiary"
          )}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{children}</div>;
}

export function Sidebar({
  role,
  activeCohortSlug,
  badges,
  org,
  roleText,
  className,
  onNavigate,
}: {
  role: Role;
  activeCohortSlug: string | null;
  badges: { lessons?: number; followup?: number; catchup?: number; calendar?: number };
  /** Organization levels this person has a role on, and — on a level
   * page — the level being shown. Null/empty for cohort-only users, who
   * see exactly the sidebar they always had. */
  org?: OrgNav | null;
  /** Overrides the role line under the logo (e.g. "Country leader"). */
  roleText?: string;
  /** Lets the desktop instance stay hidden below `lg` while the mobile
   * drawer's copy (always visible once opened) uses the default. */
  className?: string;
  /** Called after any nav link is clicked — the mobile drawer uses this to
   * close itself; the persistent desktop sidebar has no need for it. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // What this person may open here comes from their capabilities in the
  // current context (Shell → authz), not from their account role.
  const allowed = new Set(org?.allowedNav ?? NAV_BY_ROLE[role]);
  // A level page shows that level's sections; a cohort page that cohort's.
  const levelPortal = org?.context === "unit";
  const adminConsole = org?.context === "admin";

  // Cohort-scoped items need a cohort to link to. `activeCohortSlug`
  // already falls back to the user's first visible cohort when they're on
  // a global page (Shell resolves that) — it's only still null when
  // there genuinely isn't one yet, in which case those items would point
  // nowhere (`/c/null`) and are hidden instead of shown broken.
  const primary = levelPortal || adminConsole ? [] : NAV_ITEMS.filter((n) => n.cohortScoped && allowed.has(n.id) && activeCohortSlug);
  // Dashboard has no group — stays standalone above every section, the way
  // a "home" item usually does. Everything else is grouped by function
  // (Schedule / Students / Reports) so the sidebar reads as a few short
  // lists instead of one long undifferentiated one.
  const ungrouped = primary.filter((n) => !n.group);
  const sections = NAV_GROUP_ORDER.map((group) => ({
    group,
    label: NAV_GROUP_LABELS[group],
    items: primary.filter((n) => n.group === group),
  })).filter((s) => s.items.length > 0);
  // The level portal's own pages replace the cohort list, so it keeps only
  // Settings (admin).
  const manage = adminConsole ? [] : NAV_ITEMS.filter((n) => !n.cohortScoped && allowed.has(n.id) && (!levelPortal || n.id === "settings"));
  // Level pages add cohorts from a promotion's Cohorts page, not from here.
  const canCreateCohort = role === "admin" && !levelPortal;

  const renderItem = (item: NavItem) => {
    const href = item.href(activeCohortSlug);
    const active = isActive(item.id, pathname, activeCohortSlug);
    const badge = badges[item.id as keyof typeof badges];
    return (
      <SidebarNavItem
        key={item.id}
        icon={item.icon}
        label={navLabel(item, role)}
        href={href}
        active={active}
        badge={badge}
        onNavigate={onNavigate}
      />
    );
  };

  const current = levelPortal ? (org?.current ?? null) : null;
  const levelSections = current
    ? current.sections.map((cs) => ({ ...UNIT_SECTIONS.find((s) => s.id === cs.id)!, label: cs.label }))
    : [];
  // Every place this person works — one person can lead a promotion and
  // teach two of its cohorts; each is its own workspace.
  const workspaces = org?.workspaces ?? [];

  return (
    <aside className={cn("sticky top-0 flex h-screen w-60 flex-none flex-col border-r border-border bg-card", className)}>
      <div className="flex items-center gap-2.5 p-[18px] pb-4">
        <Image
          src="/logo.jpg"
          alt="BCC Discipleship"
          width={32}
          height={32}
          className="size-8 flex-none rounded-full object-cover"
        />
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight text-ink">Discipleship</div>
          <div className="text-[11px] font-semibold text-accent-700">{roleText ?? roleLabel(role)}</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
        {current && (
          <div className="flex flex-col gap-0.5">
            {levelSections.map((s) => {
              const href = unitHref(current.slug, s.id);
              const isAttention = s.id === "attention";
              return (
                <SidebarNavItem
                  key={s.id}
                  icon={s.icon}
                  label={s.label}
                  href={href}
                  active={s.id === "overview" ? pathname === href : pathname.startsWith(href)}
                  badge={isAttention ? current.attention.count : undefined}
                  badgeTone={current.attention.urgent ? "alert" : "quiet"}
                  onNavigate={onNavigate}
                />
              );
            })}
          </div>
        )}

        {adminConsole && (
          <div className="flex flex-col gap-0.5">
            {ADMIN_ITEMS.map((item) => (
              <SidebarNavItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={pathname.startsWith(item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}

        {ungrouped.length > 0 && <div className="flex flex-col gap-0.5">{ungrouped.map(renderItem)}</div>}

        {sections.map((section) => (
          <div key={section.group} className="flex flex-col gap-0.5">
            <GroupLabel>{section.label}</GroupLabel>
            {section.items.map(renderItem)}
          </div>
        ))}

        {manage.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <GroupLabel>Manage</GroupLabel>
            {manage.map(renderItem)}
          </div>
        )}
      </nav>

      {/* Switching roles lives down here, apart from the current place's pages. */}
      {(workspaces.length > 1 || canCreateCohort) && (
        <div className="flex flex-col gap-2 border-t border-divider p-3">
          {workspaces.length > 1 && (
            <WorkspaceSwitcher workspaces={workspaces} activeHref={org?.activeWorkspace ?? null} onNavigate={onNavigate} />
          )}
          {canCreateCohort && (
            <Link
              href="/cohorts/new"
              onClick={onNavigate}
              className="flex w-full items-center justify-center gap-1.5 rounded-control bg-accent px-2.5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-600"
            >
              <Plus size={15} />
              New cohort
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}
