"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Cake, BookOpen, Megaphone, HandWaving, WarningCircle, UserCircle, Sliders } from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverPanel } from "@/components/ui/popover";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { NotificationView } from "@/lib/data/notifications";

const ICON_BY_KIND: Record<string, typeof Bell> = {
  birthday: Cake,
  lesson_postponed: BookOpen,
  outcome_recorded: Megaphone,
  welcome: HandWaving,
  attention_escalation: WarningCircle,
  student_updated: UserCircle,
  bands_updated: Sliders,
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function NotificationsBell({ notifications }: { notifications: NotificationView[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleOpen(item: NotificationView) {
    if (!item.read) {
      startTransition(async () => {
        try {
          await markNotificationRead(item.id);
          router.refresh();
        } catch {
          show("Couldn't mark that as read — try again.");
        }
      });
    }
    setOpen(false);
    if (item.href) router.push(item.href);
  }

  function handleMarkAllRead() {
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
        aria-label="Notifications"
        className="relative grid size-9 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:border-accent-300"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute right-[3px] top-[3px] size-2 rounded-full bg-accent-2-500" />
        )}
      </PopoverTrigger>
      <PopoverPanel width={340} align="end">
        <div className="flex items-center justify-between border-b border-divider px-3.5 py-3">
          <span className="text-[13px] font-bold text-ink">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={pending}
              className="text-[11px] font-semibold text-accent-700 hover:underline disabled:text-ink-faint"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {notifications.map((n) => {
            const IconEl = ICON_BY_KIND[n.kind] ?? Bell;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleOpen(n)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-divider px-3.5 py-3 text-left last:border-b-0 hover:bg-hover",
                  !n.read && "bg-accent-100/40"
                )}
              >
                <span className="grid size-7 flex-none place-items-center rounded-[8px] bg-accent-100 text-accent-800">
                  <IconEl size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-semibold leading-snug text-ink">{n.title}</span>
                    {!n.read && <span className="mt-1 size-[6px] flex-none rounded-full bg-accent-2-500" />}
                  </span>
                  {n.body && <span className="mt-0.5 block text-xs text-ink-muted">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-ink-faint">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            );
          })}
          {notifications.length === 0 && (
            <div className="px-3.5 py-8 text-center text-[13px] text-ink-muted">
              Nothing yet — you&rsquo;re all caught up.
            </div>
          )}
        </div>
      </PopoverPanel>
    </Popover>
  );
}
