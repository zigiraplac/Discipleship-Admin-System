"use client";

import { useState } from "react";
import { List } from "@phosphor-icons/react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Sidebar } from "./sidebar";
import type { Role } from "@/lib/domain/types";

/** The sidebar is `w-60` and always visible from `lg` up — below that it's
 * hidden entirely (see Shell) and this drawer is the only way to navigate.
 * Reuses `Sidebar` itself rather than a second nav implementation, so the
 * two can never drift out of sync. */
export function MobileNav({
  role,
  activeCohortId,
  badges,
}: {
  role: Role;
  activeCohortId: string | null;
  badges: { lessons?: number; attention?: number };
}) {
  const [open, setOpen] = useState(false);

  return (
    <BaseDialog.Root open={open} onOpenChange={setOpen}>
      <BaseDialog.Trigger
        aria-label="Open menu"
        className="grid size-9 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:border-accent-300 lg:hidden"
      >
        <List size={18} />
      </BaseDialog.Trigger>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[80] bg-[rgba(20,25,32,0.42)] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Popup className="fixed inset-y-0 left-0 z-[81] outline-none transition-transform duration-200 data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full">
          <Sidebar
            role={role}
            activeCohortId={activeCohortId}
            badges={badges}
            className="w-72"
            onNavigate={() => setOpen(false)}
          />
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
