import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHead } from "@/components/shell/page-head";
import { NotificationsCenter } from "@/components/notifications/notifications-center";
import { listNotificationsPage, notificationCounts } from "@/lib/data/notifications";
import { describeNotifications } from "@/lib/notify/describe";
import type { NotificationFilter } from "@/lib/domain/notification-category";

const FILTERS: NotificationFilter[] = ["all", "unread", "action", "reminder", "updates"];

/**
 * Everything a person has been notified about: filter, search, read and
 * unread, newest first, a page at a time. Only ever their own (every query
 * is scoped to the signed-in user). Notifications say what happened; the
 * work itself is done on the page each one links to.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const raw = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const filter: NotificationFilter = FILTERS.includes(raw as NotificationFilter) ? (raw as NotificationFilter) : "all";
  const db = createAdminClient();
  const [page, totals] = await Promise.all([listNotificationsPage(db, user.id, { filter }), notificationCounts(db, user.id)]);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Notifications" subtitle="Updates and reminders about the work you're responsible for" />
      <NotificationsCenter key={filter} initialFilter={filter} initialItems={await describeNotifications(page.items, user)} initialNext={page.next} totals={totals} />
    </div>
  );
}
