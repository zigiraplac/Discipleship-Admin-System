import { createAdminClient } from "@/lib/supabase/admin";
import { getAllUnits } from "@/lib/data/org";
import { LEVELS } from "@/lib/domain/levels";
import { notify } from "./index";

/**
 * Staffing notifications — someone's organisational responsibility changed.
 * Immediate. Callers announce only a real change (an assignment that
 * already existed, or a removal of someone already gone, is silent), so a
 * retried request never repeats it. The affected person always hears; for a
 * level leader, the leaders of the level that oversees it hear too ("Joshua
 * is now responsible for Rwanda"), so they know whom to contact. The person
 * making the change is never notified of their own action.
 */

async function personName(userId: string): Promise<string> {
  const { data } = await createAdminClient().from("app_user").select("name").eq("id", userId).maybeSingle();
  return data?.name ?? "Someone";
}

export async function announceLevelRole(input: {
  actorId: string;
  unitId: string;
  personId: string;
  role: "leader" | "viewer";
  change: "appointed" | "ended";
}): Promise<void> {
  const units = await getAllUnits();
  const unit = units.find((u) => u.id === input.unitId);
  if (!unit) return;
  const name = await personName(input.personId);
  const roleText = `${LEVELS[unit.type].label} ${input.role}`;
  const slugOf = (id?: string) => units.find((u) => u.id === id)?.slug;
  await notify(
    { type: "staff_level", personId: input.personId, unitId: unit.id, role: input.role },
    (audience, r) =>
      audience === "person"
        ? {
            kind: "staff_assignment",
            title: input.change === "appointed" ? `You're now the ${roleText} for ${unit.name}` : `Your ${roleText} role for ${unit.name} has ended`,
            body: input.change === "appointed" ? "Your organisational responsibility has been updated." : "You no longer hold this responsibility.",
            href: input.change === "appointed" ? `/u/${unit.slug}` : undefined,
          }
        : {
            kind: "staff_assignment",
            title: input.change === "appointed" ? `${name} is now responsible for ${unit.name}` : `${name} is no longer responsible for ${unit.name}`,
            body: input.change === "appointed" ? `${LEVELS[unit.type].label} leader` : `${unit.name} has no leader until someone is appointed — it's managed from your level meanwhile.`,
            href: slugOf(r.unitId) ? `/u/${slugOf(r.unitId)}/staff` : undefined,
          },
    { exclude: [input.actorId] }
  );
}

export async function announceCohortRole(input: {
  actorId: string;
  cohortId: string;
  personId: string;
  capacity: "facilitator" | "teacher";
  change: "assigned" | "ended";
}): Promise<void> {
  const { data: cohort } = await createAdminClient().from("cohort").select("name, slug").eq("id", input.cohortId).maybeSingle();
  if (!cohort) return;
  await notify(
    { type: "staff_cohort", personId: input.personId, cohortId: input.cohortId },
    () => ({
      kind: "staff_assignment",
      title:
        input.change === "assigned"
          ? `You've been assigned as ${input.capacity} for ${cohort.name.trim()}`
          : `Your ${input.capacity} role for ${cohort.name.trim()} has ended`,
      body: input.change === "assigned" ? "You can now open this cohort." : "You no longer have this cohort.",
      href: input.change === "assigned" ? `/c/${cohort.slug}` : undefined,
    }),
    { exclude: [input.actorId] }
  );
}
