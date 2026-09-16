"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Cake, BookOpen, Megaphone, HandWaving, WarningCircle, UserCircle, Sliders, WhatsappLogo } from "@phosphor-icons/react";
import { Popover, PopoverTrigger, PopoverPanel } from "@/components/ui/popover";
import { TONE_CLASSES, type PillTone } from "@/components/ui/pill";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import { useToast } from "@/components/ui/toast";
import { daysUntilAnnual } from "@/lib/domain/birthdays";
import { cn, daysBetween, todayISO } from "@/lib/utils";
import { canAccessPath } from "@/lib/roles";
import type { NotificationView } from "@/lib/data/notifications";
import type { Role } from "@/lib/domain/types";

const ICON_BY_KIND: Record<string, typeof Bell> = {
  birthday: Cake,
  birthday_today: WhatsappLogo,
  lesson_postponed: BookOpen,
  crusade_postponed: Megaphone,
  crusade_upcoming: Megaphone,
  outcome_recorded: Megaphone,
  welcome: HandWaving,
  attention_escalation: WarningCircle,
  student_updated: UserCircle,
  bands_updated: Sliders,
};

// Categories, not status reads (see pill.tsx) — nothing here means
// "wrong," just tells one kind of notification apart from another at a
// glance.
const TONE_BY_KIND: Record<string, PillTone> = {
  birthday: "violet",
  birthday_today: "green",
  lesson_postponed: "amber",
  crusade_postponed: "amber",
  crusade_upcoming: "teal",
  outcome_recorded: "cyan",
  welcome: "green",
  attention_escalation: "magenta",
  student_updated: "sky",
  bands_updated: "sky",
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

/** "Today" / "Tomorrow" / "In N days" — a forward countdown, never "N days
 * ago"; shared by both live-recomputed kinds. */
function countdownText(daysUntil: number): string {
  if (daysUntil <= 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

/**
 * A birthday/crusade notification's `body` is frozen at creation time —
 * "In 5 days" still reads "In 5 days" a week later, even the day *of*, with
 * only the separate "created Nd ago" footer visibly changing. This
 * recomputes the real countdown live, from `data`, every time the list
 * renders, so what's on screen is never stale — and for these two kinds,
 * this replaces the "created Nd ago" footer entirely: when something was
 * created isn't the useful fact here, how many days until it happens is.
 */
function liveCountdown(n: NotificationView): string | null {
  const today = todayISO();
  if (n.kind === "birthday" && n.data?.kind === "birthday") {
    return countdownText(daysUntilAnnual(n.data.dobDay, n.data.dobMonth, today));
  }
  if (n.kind === "crusade_upcoming" && n.data?.kind === "crusade_upcoming") {
    return countdownText(daysBetween(today, n.data.date));
  }
  return null;
}

export function NotificationsBell({ notifications, role }: { notifications: NotificationView[]; role: Role }) {
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
    if (!item.href) return;
    // A birthday-today reminder's href can be an actual wa.me link, not an
    // in-app route — Next's router only understands its own routes, so an
    // external one needs a real navigation/new tab instead.
    if (/^https?:\/\//.test(item.href)) {
      window.open(item.href, "_blank", "noopener,noreferrer");
      return;
    }
    // Some notifications go out to a whole cohort's team at once —
    // facilitators, teachers, admin, leadership together — but their href
    // isn't always a page every one of those roles can open (Follow Up,
    // say, which teacher/leadership don't have). Marking read always
    // happens regardless; navigating only happens when this viewer's own
    // role can actually see where it points, instead of landing on a 404.
    if (canAccessPath(role, item.href)) router.push(item.href);
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

  const today = todayISO();
  const todayItems = notifications.filter((n) => n.createdAt.slice(0, 10) === today);
  const earlierItems = notifications.filter((n) => n.createdAt.slice(0, 10) !== today);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Notifications"
        className="relative grid size-9 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:border-accent-300"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-2-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverPanel width={360} align="end">
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
        <div className="max-h-[420px] overflow-y-auto">
          {todayItems.length > 0 && (
            <NotificationGroup label="Today" items={todayItems} onOpen={handleOpen} />
          )}
          {earlierItems.length > 0 && (
            <NotificationGroup label={todayItems.length ? "Earlier" : undefined} items={earlierItems} onOpen={handleOpen} />
          )}
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

function NotificationGroup({
  label,
  items,
  onOpen,
}: {
  label?: string;
  items: NotificationView[];
  onOpen: (item: NotificationView) => void;
}) {
  return (
    <div>
      {label && (
        <div className="bg-page px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
          {label}
        </div>
      )}
      {items.map((n) => {
        const IconEl = ICON_BY_KIND[n.kind] ?? Bell;
        const tone = TONE_BY_KIND[n.kind] ?? "grey";
        const countdown = liveCountdown(n);
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => onOpen(n)}
            className={cn(
              "relative flex w-full items-start gap-2.5 border-b border-divider py-3 pl-3 pr-3.5 text-left last:border-b-0 hover:bg-hover",
              !n.read && "bg-accent-100/30"
            )}
          >
            {!n.read && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent-2-500" />}
            <span className={cn("grid size-7 flex-none place-items-center rounded-[8px]", TONE_CLASSES[tone])}>
              <IconEl size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink" title={n.title}>
                {n.title}
              </span>
              {(countdown ?? n.body) && (
                <span className="mt-0.5 line-clamp-1 block text-xs text-ink-muted" title={countdown ?? n.body ?? undefined}>
                  {countdown ?? n.body}
                </span>
              )}
              {!countdown && <span className="mt-1 block text-[11px] text-ink-faint">{timeAgo(n.createdAt)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
