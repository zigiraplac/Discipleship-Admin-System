"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretDown, SignOut as SignOutIcon } from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverPanel } from "@/components/ui/popover";
import { HealthPill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";
import { usePageHead } from "./page-head";
import { signOutAction } from "@/lib/actions/auth";
import { getCohortQuickStats } from "@/lib/actions/cohorts";
import type { Role } from "@/lib/domain/types";
import type { QuickStats } from "@/lib/data/quick-stats";
import type { NotificationView } from "@/lib/data/notifications";

export interface CohortSwitcherItem {
  id: string;
  name: string;
}

export function TopBar({
  role,
  cohorts,
  activeCohortId,
  navCohortId,
  userName,
  roleLabel,
  notifications,
  badges,
}: {
  role: Role;
  cohorts: CohortSwitcherItem[];
  activeCohortId: string | null;
  /** Falls back to the first visible cohort when `activeCohortId` is null
   * (a global page) — same resolution Shell already does for the desktop
   * sidebar, so the mobile drawer's nav behaves identically. */
  navCohortId: string | null;
  userName: string;
  roleLabel: string;
  notifications: NotificationView[];
  badges: { lessons?: number; attention?: number };
}) {
  const { title, subtitle } = usePageHead();
  const router = useRouter();
  const active = cohorts.find((c) => c.id === activeCohortId);

  // Fetched lazily, once, the first time the dropdown is actually opened
  // — not on every page load for every cohort (getCohortQuickStats,
  // lib/actions/cohorts.ts). `undefined` per id renders as a skeleton
  // while that first fetch is in flight.
  const [statsById, setStatsById] = useState<Record<string, QuickStats> | null>(null);

  function handleSwitcherOpenChange(open: boolean) {
    if (open && statsById === null) {
      setStatsById({});
      void getCohortQuickStats(cohorts.map((c) => c.id)).then(setStatsById);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-4 py-3.5 sm:gap-4 sm:px-[26px]">
      <MobileNav role={role} activeCohortId={navCohortId} badges={badges} />

      <div className="min-w-0">
        <div className="truncate text-[17px] font-bold leading-tight text-ink">{title}</div>
        {subtitle && <div className="mt-px truncate text-xs font-medium text-ink-secondary">{subtitle}</div>}
      </div>
      <span className="flex-1" />

      {cohorts.length > 0 && (
        <Popover onOpenChange={handleSwitcherOpenChange}>
          <PopoverTrigger className="flex items-center gap-2 rounded-control border border-border bg-hover px-2.5 py-[7px] text-[13px] font-semibold hover:border-accent-300">
            <span className="size-[7px] flex-none rounded-full bg-accent" />
            <span className="max-w-[90px] truncate sm:max-w-none">{active ? active.name : "Select cohort"}</span>
            <CaretDown size={13} className="flex-none" />
          </PopoverTrigger>
          <PopoverPanel width={300}>
            {cohorts.map((c, i) => {
              const stats = statsById?.[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/c/${c.id}`)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left hover:bg-hover"
                  style={{
                    background: c.id === activeCohortId ? "var(--color-hover)" : undefined,
                    borderTop: i ? "1px solid var(--color-divider)" : undefined,
                  }}
                >
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{c.name}</span>
                    {stats ? (
                      <span className="block text-[11px] text-ink-muted tabular">
                        {stats.enrolled} students · {stats.rate}%
                      </span>
                    ) : (
                      <Skeleton className="mt-1 h-2.5 w-24" />
                    )}
                  </span>
                  {stats ? <HealthPill health={stats.health} /> : <Skeleton className="h-5 w-14 rounded-pill" />}
                </button>
              );
            })}
          </PopoverPanel>
        </Popover>
      )}

      <ThemeToggle />
      <NotificationsBell notifications={notifications} />

      <Popover>
        <PopoverTrigger className="flex items-center gap-2.5 border-0 bg-transparent p-[3px]">
          <Avatar name={userName} size="md" tinted />
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-semibold leading-tight text-ink">{userName}</span>
            <span className="block text-[11px] text-ink-muted">{roleLabel}</span>
          </span>
          <CaretDown size={13} className="hidden text-ink-muted sm:block" />
        </PopoverTrigger>
        <PopoverPanel width={200} align="end">
          <Link href="/profile" className="block w-full px-3.5 py-[11px] text-left text-[13px] text-ink-secondary hover:bg-hover">
            Profile
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 border-t border-divider px-3.5 py-[11px] text-left text-[13px] font-semibold text-accent-2-700 hover:bg-accent-2-100"
            >
              <SignOutIcon size={14} />
              Sign out
            </button>
          </form>
        </PopoverPanel>
      </Popover>
    </header>
  );
}
