"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretDown } from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverPanel } from "@/components/ui/popover";
import { HealthPill } from "@/components/ui/pill";
import { Avatar } from "@/components/ui/avatar";
import { NotificationsBell } from "./notifications-bell";
import { usePageHead } from "./page-head";
import { signOutAction } from "@/lib/actions/auth";
import type { CohortHealth } from "@/lib/domain/types";
import type { NotificationView } from "@/lib/data/notifications";

export interface CohortSwitcherItem {
  id: string;
  name: string;
  meta: string; // "34 students · 82%"
  health: CohortHealth;
}

export function TopBar({
  cohorts,
  activeCohortId,
  userName,
  roleLabel,
  notifications,
}: {
  cohorts: CohortSwitcherItem[];
  activeCohortId: string | null;
  userName: string;
  roleLabel: string;
  notifications: NotificationView[];
}) {
  const { title, subtitle } = usePageHead();
  const router = useRouter();
  const active = cohorts.find((c) => c.id === activeCohortId);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-card px-[26px] py-3.5">
      <div className="min-w-0">
        <div className="text-[17px] font-bold leading-tight text-ink">{title}</div>
        {subtitle && <div className="mt-px text-xs text-ink-muted">{subtitle}</div>}
      </div>
      <span className="flex-1" />

      {cohorts.length > 0 && (
        <Popover>
          <PopoverTrigger className="flex items-center gap-2 rounded-control border border-border bg-hover px-2.5 py-[7px] text-[13px] font-semibold hover:border-accent-300">
            <span className="size-[7px] rounded-full bg-accent" />
            <span>{active ? active.name : "Select cohort"}</span>
            <CaretDown size={13} />
          </PopoverTrigger>
          <PopoverPanel width={300}>
            {cohorts.map((c, i) => (
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
                  <span className="block text-[11px] text-ink-muted tabular">{c.meta}</span>
                </span>
                <HealthPill health={c.health} />
              </button>
            ))}
          </PopoverPanel>
        </Popover>
      )}

      <NotificationsBell notifications={notifications} />

      <Popover>
        <PopoverTrigger className="flex items-center gap-2.5 border-0 bg-transparent p-[3px]">
          <Avatar name={userName} size="md" tinted />
          <span className="text-left">
            <span className="block text-xs font-semibold leading-tight text-ink">{userName}</span>
            <span className="block text-[11px] text-ink-muted">{roleLabel}</span>
          </span>
          <CaretDown size={13} className="text-ink-muted" />
        </PopoverTrigger>
        <PopoverPanel width={200} align="end">
          <Link href="/profile" className="block w-full px-3.5 py-[11px] text-left text-[13px] text-ink-secondary hover:bg-hover">
            Profile
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full border-t border-divider px-3.5 py-[11px] text-left text-[13px] text-ink-muted hover:bg-hover"
            >
              Sign out
            </button>
          </form>
        </PopoverPanel>
      </Popover>
    </header>
  );
}
