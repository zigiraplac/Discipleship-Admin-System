"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import { SearchTrigger } from "./search-palette";
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

function isActive(id: string, pathname: string, cohortId: string | null): boolean {
  if (id === "dashboard") return pathname === `/c/${cohortId}`;
  if (["lessons", "students", "attention", "calendar", "reports"].includes(id)) {
    return pathname.startsWith(`/c/${cohortId}/${id}`);
  }
  if (id === "cohorts") return pathname.startsWith("/cohorts");
  if (id === "settings") return pathname.startsWith("/settings");
  return false;
}

function SidebarNavItem({
  item,
  label,
  href,
  active,
  badge,
  onNavigate,
}: {
  item: NavItem;
  label: string;
  href: string;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
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
        <span className="rounded-pill bg-accent-2-100 px-[7px] py-px text-[10px] font-bold text-accent-2-700 tabular">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  role,
  activeCohortId,
  badges,
  className,
  onNavigate,
}: {
  role: Role;
  activeCohortId: string | null;
  badges: { lessons?: number; attention?: number };
  /** Lets the desktop instance stay hidden below `lg` while the mobile
   * drawer's copy (always visible once opened) uses the default. */
  className?: string;
  /** Called after any nav link is clicked — the mobile drawer uses this to
   * close itself; the persistent desktop sidebar has no need for it. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const allowed = new Set(NAV_BY_ROLE[role]);

  // Cohort-scoped items need a cohort id to link to. `activeCohortId`
  // already falls back to the user's first visible cohort when they're on
  // a global page (Shell resolves that) — it's only still null when
  // there genuinely isn't one yet, in which case those items would point
  // nowhere (`/c/null`) and are hidden instead of shown broken.
  const primary = NAV_ITEMS.filter((n) => n.cohortScoped && allowed.has(n.id) && activeCohortId);
  const manage = NAV_ITEMS.filter((n) => !n.cohortScoped && allowed.has(n.id));
  const canCreateCohort = role === "admin";

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
          <div className="text-[11px] font-semibold text-accent-700">{roleLabel(role)}</div>
        </div>
      </div>

      <div className="px-3 pb-2.5">
        <SearchTrigger>
          <MagnifyingGlass size={15} className="text-ink-faint" />
          <span className="flex-1 text-left text-[13px] text-ink-muted">Search</span>
          <span className="rounded-[5px] border border-border bg-card px-1.5 py-px text-[10px] tabular">⌘K</span>
        </SearchTrigger>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
        <div className="flex flex-col gap-0.5">
          {primary.map((item) => {
            const href = item.href(activeCohortId);
            const active = isActive(item.id, pathname, activeCohortId);
            const badge = item.id === "lessons" ? badges.lessons : item.id === "attention" ? badges.attention : undefined;
            return (
              <SidebarNavItem
                key={item.id}
                item={item}
                label={navLabel(item, role)}
                href={href}
                active={active}
                badge={badge}
                onNavigate={onNavigate}
              />
            );
          })}
        </div>

        {manage.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              Manage
            </div>
            {manage.map((item) => {
              const href = item.href(activeCohortId);
              const active = isActive(item.id, pathname, activeCohortId);
              return (
                <SidebarNavItem
                  key={item.id}
                  item={item}
                  label={navLabel(item, role)}
                  href={href}
                  active={active}
                  onNavigate={onNavigate}
                />
              );
            })}
          </div>
        )}
      </nav>

      {canCreateCohort && (
        <div className="border-t border-divider p-3">
          <Link
            href="/cohorts/new"
            onClick={onNavigate}
            className="flex w-full items-center justify-center gap-1.5 rounded-control bg-accent px-2.5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-600"
          >
            <Plus size={15} />
            New cohort
          </Link>
        </div>
      )}
    </aside>
  );
}
