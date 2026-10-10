"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { cohortTarget, requireCapability } from "@/lib/authz";
import { inviteAccount } from "@/lib/data/invite";
import { announceCohortRole } from "@/lib/notify/staffing";

/**
 * Cohort staffing by the leader responsible for the cohort's own level:
 * its promotion's leader; if none, its church's; then the nearest staffed
 * level above (authz: manage_cohort_staff, cohortStewardOf). Higher leaders
 * don't manage cohort staff while someone closer is responsible. The
 * administrator keeps a separate system route under Accounts. Every change
 * is recorded in audit_log.
 */

type Capacity = "facilitator" | "teacher";

async function audit(actorId: string, cohortId: string, action: string, after: Record<string, string | null>) {
  await createAdminClient().from("audit_log").insert({ actor_id: actorId, entity: "cohort_member", entity_id: cohortId, cohort_id: cohortId, action, after });
}

function checkCapacity(c: string): asserts c is Capacity {
  if (c !== "facilitator" && c !== "teacher") throw new Error("Choose facilitator or teacher.");
}

export async function assignCohortStaff(input: { cohortId: string; userId: string; capacity: Capacity }): Promise<void> {
  checkCapacity(input.capacity);
  const user = await requireCapability("manage_cohort_staff", await cohortTarget(input.cohortId));
  const db = createAdminClient();
  const { data: person } = await db.from("app_user").select("state").eq("id", input.userId).maybeSingle();
  if (!person || person.state === "deactivated") throw new Error("That person can't be assigned.");
  const { data: added, error } = await db
    .from("cohort_member")
    .upsert({ cohort_id: input.cohortId, user_id: input.userId, capacity: input.capacity }, { onConflict: "cohort_id,user_id,capacity", ignoreDuplicates: true })
    .select("user_id");
  if (error) throw new Error("Couldn't assign them. Please try again.");
  // Already assigned (e.g. a retried request): nothing changed, nothing to announce.
  if (added?.length) {
    await audit(user.id, input.cohortId, "assign_staff", { userId: input.userId, capacity: input.capacity });
    await announceCohortRole({ actorId: user.id, cohortId: input.cohortId, personId: input.userId, capacity: input.capacity, change: "assigned" });
  }
  revalidatePath("/u", "layout");
}

export async function removeCohortStaff(input: { cohortId: string; userId: string; capacity: Capacity }): Promise<void> {
  checkCapacity(input.capacity);
  const user = await requireCapability("manage_cohort_staff", await cohortTarget(input.cohortId));
  const { data: removed, error } = await createAdminClient()
    .from("cohort_member")
    .delete()
    .eq("cohort_id", input.cohortId)
    .eq("user_id", input.userId)
    .eq("capacity", input.capacity)
    .select("user_id");
  if (error) throw new Error("Couldn't remove them. Please try again.");
  // Already gone (e.g. a retried request): nothing changed, nothing to announce.
  if (removed?.length) {
    await audit(user.id, input.cohortId, "remove_staff", { userId: input.userId, capacity: input.capacity });
    await announceCohortRole({ actorId: user.id, cohortId: input.cohortId, personId: input.userId, capacity: input.capacity, change: "ended" });
  }
  revalidatePath("/u", "layout");
}

export async function inviteCohortStaff(input: { cohortId: string; name: string; email: string; capacity: Capacity }): Promise<{ resendLink?: string }> {
  checkCapacity(input.capacity);
  const user = await requireCapability("manage_cohort_staff", await cohortTarget(input.cohortId));
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a name and a valid email.");
  const db = createAdminClient();
  const { userId, resendLink } = await inviteAccount(db, { name, email, role: input.capacity });
  const { data: added, error } = await db
    .from("cohort_member")
    .upsert({ cohort_id: input.cohortId, user_id: userId, capacity: input.capacity }, { onConflict: "cohort_id,user_id,capacity", ignoreDuplicates: true })
    .select("user_id");
  if (error) throw new Error("They were invited, but couldn't be added to the cohort. Please try again.");
  await audit(user.id, input.cohortId, "invite_staff", { userId, email, capacity: input.capacity });
  if (added?.length) await announceCohortRole({ actorId: user.id, cohortId: input.cohortId, personId: userId, capacity: input.capacity, change: "assigned" });
  revalidatePath("/u", "layout");
  return { resendLink };
}
