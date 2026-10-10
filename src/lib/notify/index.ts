import { createAdminClient } from "@/lib/supabase/admin";
import { getAllUnits, getUnitLeaderContacts } from "@/lib/data/org";
import { createNotifications, type NotificationInput } from "@/lib/data/notifications";
import { routeRecipients, type Audience, type NotifyEvent, type Recipient, type RoutingContext } from "@/lib/domain/notify-routing";

export type { Audience, NotifyEvent, Recipient } from "@/lib/domain/notify-routing";

/**
 * The one way to send a notification. A server action says what happened
 * (NotifyEvent) and how to word it for each audience; routing decides who
 * receives it (domain/notify-routing.ts). Only call this from code that has
 * already checked the caller may do the thing being announced.
 */

type Message = Omit<NotificationInput, "userId">;

async function loadContext(event: NotifyEvent): Promise<RoutingContext> {
  const db = createAdminClient();
  const [units, leaderContacts] = await Promise.all([getAllUnits(), getUnitLeaderContacts()]);
  const leaders = new Map([...leaderContacts].map(([id, list]) => [id, list.map((l) => l.userId)]));
  const { data: admins } = await db.from("app_user").select("id").eq("role", "admin").neq("state", "deactivated");

  const cohorts: RoutingContext["cohorts"] = new Map();
  if (event.type === "cohort_operational" || event.type === "cohort_attention" || event.type === "cohort_pastoral") {
    const [{ data: cohort }, { data: members }] = await Promise.all([
      db.from("cohort").select("org_unit_id").eq("id", event.cohortId).maybeSingle(),
      db.from("cohort_member").select("user_id, capacity").eq("cohort_id", event.cohortId),
    ]);
    cohorts.set(event.cohortId, {
      unitId: cohort?.org_unit_id ?? null,
      team: [...new Set((members ?? []).map((m) => m.user_id))],
      facilitators: [...new Set((members ?? []).filter((m) => m.capacity === "facilitator").map((m) => m.user_id))],
    });
  }

  let allStaff: string[] = [];
  if (event.type === "network") {
    const { data } = await db.from("app_user").select("id").neq("state", "deactivated");
    allStaff = (data ?? []).map((u) => u.id);
  }

  return {
    units: new Map(units.map((u) => [u.id, u])),
    leaders,
    topLeaders: (admins ?? []).map((a) => a.id),
    cohorts,
    allStaff,
  };
}

/** Who would receive this event (for callers that must resolve recipients
 * before the subject disappears — e.g. a cohort about to be deleted). */
export async function resolveRecipients(event: NotifyEvent, exclude: string[] = []): Promise<Recipient[]> {
  return routeRecipients(event, await loadContext(event), exclude);
}

/**
 * Send `event` to everyone routing picks, worded per audience. Return null
 * from `compose` to skip an audience. `exclude` is usually the actor.
 */
export async function notify(
  event: NotifyEvent,
  compose: (audience: Audience, recipient: Recipient) => Message | null,
  opts: { exclude?: string[]; recipients?: Recipient[] } = {}
): Promise<number> {
  const recipients = opts.recipients ?? (await resolveRecipients(event, opts.exclude ?? []));
  const inputs: NotificationInput[] = [];
  for (const r of recipients) {
    const m = compose(r.audience, r);
    if (m) inputs.push({ ...m, userId: r.userId });
  }
  if (inputs.length) await createNotifications(createAdminClient(), inputs);
  return inputs.length;
}
