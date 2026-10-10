"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Envelope, EnvelopeOpen } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { loadNotificationsPage, markAllNotificationsRead, markNotificationRead, markNotificationUnread } from "@/lib/actions/notifications";
import type { NotificationFilter } from "@/lib/domain/notification-category";
import type { NotificationView } from "@/lib/data/notifications";
import { NotificationItem, useOpenNotification } from "./notification-item";

type Cursor = { createdAt: string; id: string } | null;

const FILTER_OPTIONS: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "action", label: "Action required" },
  { value: "reminder", label: "Reminders" },
  { value: "updates", label: "Updates" },
];

/** Today / Yesterday / Earlier this week (since Monday) / Older. */
export function dateGroup(iso: string, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(now);
  const t = day(new Date(iso));
  if (t === today) return "Today";
  if (t === today - 86_400_000) return "Yesterday";
  const monday = today - ((now.getDay() + 6) % 7) * 86_400_000;
  return t >= monday ? "Earlier this week" : "Older";
}

/**
 * The full history: filters and search run on the server, a page at a
 * time, and "Load more" continues from the last item shown — so the two
 * always agree. Marking read or unread changes only the notification
 * (never the work it points to) and never sends anything new.
 */
export function NotificationsCenter({
  initialFilter,
  initialItems,
  initialNext,
  totals,
}: {
  initialFilter: NotificationFilter;
  initialItems: NotificationView[];
  initialNext: Cursor;
  totals: { unread: number; unreadAction: number };
}) {
  const router = useRouter();
  const { show } = useToast();
  const [filter, setFilter] = useState<NotificationFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initialItems);
  const [next, setNext] = useState<Cursor>(initialNext);
  const [loading, startLoading] = useTransition();
  const [, startWrite] = useTransition();
  const openItem = useOpenNotification();
  const first = useRef(true);

  // Filter or search changed: fetch the first page again (search waits for typing to pause).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(
      () =>
        startLoading(async () => {
          try {
            const page = await loadNotificationsPage({ filter, q: query });
            setItems(page.items);
            setNext(page.next);
          } catch {
            show("Couldn't load notifications — try again.");
          }
        }),
      query ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [filter, query, show]);

  function loadMore() {
    if (!next) return;
    startLoading(async () => {
      try {
        const page = await loadNotificationsPage({ filter, q: query, cursor: next });
        setItems((prev) => [...prev, ...page.items.filter((n) => !prev.some((p) => p.id === n.id))]);
        setNext(page.next);
      } catch {
        show("Couldn't load more — try again.");
      }
    });
  }

  function setRead(n: NotificationView, read: boolean) {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read } : x)));
    startWrite(async () => {
      try {
        await (read ? markNotificationRead(n.id) : markNotificationUnread(n.id));
        router.refresh();
      } catch {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: !read } : x)));
        show("Couldn't update it — try again.");
      }
    });
  }

  function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    startWrite(async () => {
      try {
        await markAllNotificationsRead();
        router.refresh();
      } catch {
        show("Couldn't mark all as read — try again.");
      }
    });
  }

  // In the Unread view, an item just marked read stays until the list reloads, so nothing jumps.
  const groups: { label: string; items: NotificationView[] }[] = [];
  for (const n of items) {
    const label = dateGroup(n.createdAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  const unreadHere = items.some((n) => !n.read);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} className="max-w-full flex-wrap" />
        <div className="ml-auto flex items-center gap-2.5">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notifications" style={{ width: 210 }} aria-label="Search notifications" />
          {(totals.unread > 0 || unreadHere) && (
            <Button type="button" variant="secondary" size="sm" onClick={markAll}>
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      {loading && !items.length ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <div className="text-[14px] font-semibold text-ink">
            {query ? "No notifications match." : filter === "all" ? "No notifications yet." : "You're all caught up."}
          </div>
          <div className="mt-1 text-[13px] text-ink-muted">
            {query ? "Try other words, or a different filter." : "Relevant updates and reminders will appear here."}
          </div>
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          {groups.map((g) => (
            <section key={g.label}>
              <div className="border-t-2 border-border px-[18px] pb-1.5 pt-4 text-[12px] font-bold text-ink-secondary first:border-t-0">{g.label}</div>
              <ul>
                {g.items.map((n) => (
                  <li key={n.id} className="border-t border-divider first:border-t-0">
                    <NotificationItem
                      n={n}
                      onOpen={openItem}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setRead(n, !n.read)}
                          title={n.read ? "Mark as unread" : "Mark as read"}
                          aria-label={n.read ? `Mark "${n.title}" as unread` : `Mark "${n.title}" as read`}
                          className="grid size-8 place-items-center rounded-control text-ink-faint opacity-0 hover:bg-card hover:text-ink-secondary focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          {n.read ? <Envelope size={15} /> : <EnvelopeOpen size={15} />}
                        </button>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {next && (
            <div className="border-t border-divider px-[18px] py-3 text-center">
              <Button type="button" variant="secondary" size="sm" onClick={loadMore} disabled={loading}>
                {loading && <Spinner />}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
