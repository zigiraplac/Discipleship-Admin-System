"use client";

import Link from "next/link";
import { CaretUpDown, Check, GlobeHemisphereEast, UsersThree } from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverPanel } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/authz/nav";

function WorkspaceIcon({ kind, className }: { kind: Workspace["kind"]; className?: string }) {
  const Icon = kind === "unit" ? GlobeHemisphereEast : UsersThree;
  return <Icon size={16} className={className} />;
}

/** For someone with more than one role (e.g. leads a promotion and teaches
 * a cohort): shows the place they're working in now, and switches to
 * another. The sidebar above only ever shows the current place's pages. */
export function WorkspaceSwitcher({
  workspaces,
  activeHref,
  onNavigate,
}: {
  workspaces: Workspace[];
  activeHref: string | null;
  onNavigate?: () => void;
}) {
  const active = workspaces.find((w) => w.href === activeHref) ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Your workspaces</div>
      <Popover>
        <PopoverTrigger
          aria-label="Switch workspace"
          className="flex w-full items-center gap-2.5 rounded-control border border-border bg-card px-2.5 py-2 text-left hover:bg-hover"
        >
          <WorkspaceIcon kind={active?.kind ?? "cohort"} className="flex-none text-accent-800" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-ink">{active?.title ?? "Choose a workspace"}</span>
            <span className="block truncate text-[11px] text-ink-muted">{active?.role ?? `${workspaces.length} workspaces`}</span>
          </span>
          <CaretUpDown size={14} className="flex-none text-ink-faint" />
        </PopoverTrigger>
        <PopoverPanel side="top" align="start" width={216}>
          <div className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto p-1.5">
            {workspaces.map((w) => {
              const isActive = w.href === activeHref;
              return (
                <Link
                  key={w.href}
                  href={w.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-control px-2 py-[7px] hover:bg-hover",
                    isActive && "bg-accent-100 hover:bg-accent-100"
                  )}
                >
                  <WorkspaceIcon kind={w.kind} className={cn("flex-none", isActive ? "text-accent-800" : "text-ink-tertiary")} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px]",
                        isActive ? "font-bold text-accent-800" : "font-medium text-ink-secondary"
                      )}
                    >
                      {w.title}
                    </span>
                    <span className="block truncate text-[11px] text-ink-muted">{w.role}</span>
                  </span>
                  {isActive && <Check size={14} weight="bold" className="flex-none text-accent-800" />}
                </Link>
              );
            })}
          </div>
        </PopoverPanel>
      </Popover>
    </div>
  );
}
