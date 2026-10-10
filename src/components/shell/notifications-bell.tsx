"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverPanel } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_LABELS, CATEGORY_ORDER, categoryOf, type NotificationCategory } from "@/lib/domain/notification-category";
import { cn } from "@/lib/utils";
import type { NotificationView } from "@/lib/data/notifications";
import { NotificationItem, useOpenNotification } from "@/components/notifications/notification-item";

/** In the preview, routine categories show only their newest few, so a
 * pile of reminders never pushes what needs doing out of sight. */
const PREVIEW_LIMIT: Record<NotificationCategory, number> = { action: 5, management: 3, reminder: 2, info: 2 };
const FILTER_FOR: Record<NotificationCategory, string> = { action: "action", management: "updates", reminder: "reminder", info: "updates" };

/**
 * Quick awareness, not the history: the newest notifications grouped by
 * category (what needs doing first), All / Unread, and a link to the full
 * Notifications page. The badge is neutral; it turns red only when
 * something unread needs action.
 */
export function NotificationsBell({ notifications, totals }: { notifications: NotificationView[]; totals: { unread: number; unreadAction: number } }) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [pending, startTransition] = useTransition();
  const openItem = useOpenNotification(() => setOpen(false));

  const shown = tab === "unread" ? notifications.filter((n) => !n.read) : notifications;
  const groups = CATEGORY_ORDER.map((c) => ({ c, items: shown.filter((n) => (n.category ?? categoryOf(n.kind)) === c) })).filter((g) => g.items.length);

  function markAll() {
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
        router.refresh();
      } catch {
        show("Couldn't mark all as read — try again.");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={totals.unread ? `Notifications, ${totals.unread} unread` : "Notifications"}
        className="relative grid size-9 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:border-accent-300"
      >
        <Bell size={16} />
        {totals.unread > 0 && (
          <span
            className={cn(
              "absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none text-white",
              totals.unreadAction > 0 ? "bg-accent-2-500" : "bg-ink-secondary"
            )}
          >
            {totals.unread > 9 ? "9+" : totals.unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverPanel width={380} align="end" className="max-w-[calc(100vw-16px)]">
        <div className="flex items-center justify-between gap-2 px-3.5 pb-2.5 pt-3">
          <span className="text-[14px] font-bold text-ink">Notifications</span>
          {totals.unread > 0 && (
            <button type="button" onClick={markAll} disabled={pending} className="text-[11px] font-semibold text-accent-700 hover:underline disabled:text-ink-faint">
              Mark all read
            </button>
          )}
        </div>
        <div className="border-b border-divider px-3.5 pb-2.5">
          <Segmented
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: totals.unread ? `Unread ${totals.unread > 99 ? "99+" : totals.unread}` : "Unread" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as "all" | "unread")}
            className="w-fit"
          />
        </div>

        <div className="max-h-[min(440px,60vh)] overflow-y-auto">
          {groups.map(({ c, items }) => {
            const visible = items.slice(0, PREVIEW_LIMIT[c]);
            const more = items.length - visible.length;
            return (
              <section key={c} className="border-b border-divider last:border-b-0">
                <div className={cn("px-3.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider", c === "action" ? "text-accent-2-700" : "text-ink-faint")}>
                  {CATEGORY_LABELS[c]}
                </div>
                {visible.map((n) => (
                  <NotificationItem key={n.id} n={n} onOpen={openItem} compact />
                ))}
                {more > 0 && (
                  <Link
                    href={`/notifications?filter=${FILTER_FOR[c]}`}
                    onClick={() => setOpen(false)}
                    className="block px-3.5 pb-2.5 text-[11px] font-semibold text-ink-tertiary hover:text-accent-700"
                  >
                    {more} more {CATEGORY_LABELS[c].toLowerCase()}
                  </Link>
                )}
              </section>
            );
          })}
          {!groups.length && (
            <div className="px-3.5 py-10 text-center">
              <div className="text-[13px] font-semibold text-ink">You&rsquo;re all caught up.</div>
              <div className="mt-1 text-xs text-ink-muted">{tab === "unread" ? "Nothing unread." : "Relevant updates and reminders will appear here."}</div>
            </div>
          )}
        </div>

        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="block border-t border-divider px-3.5 py-2.5 text-center text-xs font-semibold text-accent-700 hover:bg-hover"
        >
          View all notifications →
        </Link>
      </PopoverPanel>
    </Popover>
  );
}
