"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Bookmark, CalendarDots, Info, WarningCircle, type Icon } from "@phosphor-icons/react";
import { markNotificationRead } from "@/lib/actions/notifications";
import { useToast } from "@/components/ui/toast";
import { daysUntilAnnual } from "@/lib/domain/birthdays";
import { categoryOf, type NotificationCategory } from "@/lib/domain/notification-category";
import { cn, daysBetween, todayISO } from "@/lib/utils";
import type { NotificationView } from "@/lib/data/notifications";

/** One quiet icon per category — the category, not each kind, sets the look. */
export const CATEGORY_ICON: Record<NotificationCategory, Icon> = {
  action: WarningCircle,
  management: Bookmark,
  reminder: CalendarDots,
  info: Info,
};

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** A reminder's real countdown, recomputed now — its stored text was frozen
 * when it was created. */
function liveCountdown(n: NotificationView): string | null {
  const today = todayISO();
  const days =
    n.data?.kind === "birthday" ? daysUntilAnnual(n.data.dobDay, n.data.dobMonth, today) : n.data?.kind === "crusade_upcoming" ? daysBetween(today, n.data.date) : null;
  if (days == null) return null;
  return days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}

/**
 * Opening a notification: mark it read (only the notification — never the
 * work it points to) and go where it leads, if this person may. A link
 * they can't open isn't followed; the notification just becomes read.
 */
export function useOpenNotification(onDone?: () => void) {
  const router = useRouter();
  const { show } = useToast();
  const [, start] = useTransition();
  return (n: NotificationView) => {
    if (!n.read) {
      start(async () => {
        try {
          await markNotificationRead(n.id);
          router.refresh();
        } catch {
          show("Couldn't mark that as read — try again.");
        }
      });
    }
    onDone?.();
    if (!n.href || n.canOpen === false) return;
    if (/^https?:\/\//.test(n.href)) window.open(n.href, "_blank", "noopener,noreferrer");
    else router.push(n.href);
  };
}

/**
 * One notification as a row: title first, then its text, then where and
 * when — and what opening it does. Unread shows as a small dot and a
 * slightly stronger title, not a colour per kind; only "Action required"
 * gets an accent.
 */
export function NotificationItem({ n, onOpen, compact = false, trailing }: { n: NotificationView; onOpen: (n: NotificationView) => void; compact?: boolean; trailing?: React.ReactNode }) {
  const category = n.category ?? categoryOf(n.kind);
  const Icon = CATEGORY_ICON[category] ?? Bell;
  const countdown = liveCountdown(n);
  const meta = [n.context, countdown ?? timeAgo(n.createdAt)].filter(Boolean).join(" · ");
  return (
    <div className={cn("group relative flex items-start gap-3 hover:bg-hover", compact ? "px-3.5 py-3" : "px-[18px] py-3.5")}>
      <button type="button" onClick={() => onOpen(n)} className="absolute inset-0 z-0" aria-label={`${n.title}${n.read ? "" : " (unread)"}`} />
      <span
        className={cn(
          "mt-0.5 grid size-7 flex-none place-items-center rounded-full",
          category === "action" ? "bg-accent-2-100 text-accent-2-700" : "bg-subtle text-ink-tertiary"
        )}
        aria-hidden
      >
        <Icon size={14} weight={category === "action" ? "fill" : "regular"} />
      </span>
      <span className="pointer-events-none relative min-w-0 flex-1">
        <span className={cn("block text-[13px] leading-snug", n.read ? "font-medium text-ink-secondary" : "font-semibold text-ink", compact && "line-clamp-2")}>{n.title}</span>
        {n.body && !countdown && <span className={cn("mt-0.5 block text-xs text-ink-muted", compact && "line-clamp-1")}>{n.body}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] text-ink-faint">{meta}</span>
          {n.actionLabel && <span className="text-[11px] font-semibold text-accent-700 group-hover:underline">{n.actionLabel} →</span>}
        </span>
      </span>
      {trailing && <span className="relative z-10 flex flex-none items-center gap-1">{trailing}</span>}
      {!n.read && <span className="mt-2 size-2 flex-none rounded-full bg-accent" aria-hidden />}
    </div>
  );
}
