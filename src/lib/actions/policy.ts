"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/authz";
import { getPolicyVersions } from "@/lib/data/org";
import { notify } from "@/lib/notify";
import { newVersionProblem, type PolicyDraft } from "@/lib/domain/policy";
import { formatShortDate, todayISO } from "@/lib/utils";

/**
 * A programme policy change is a new version from a date — never an edit
 * to the one in force, so earlier periods keep the rules they had. Network-
 * wide, administrators only, audited, and forward-only (the database
 * refuses edits, deletions and back-dated versions too — 0039).
 */
export async function createPolicyVersion(input: PolicyDraft & { note?: string }): Promise<{ version: number }> {
  const user = await requireCapability("manage_policy", { kind: "system" });
  const existing = await getPolicyVersions();
  const problem = newVersionProblem(existing, input, todayISO());
  if (problem) throw new Error(problem);

  const version = Math.max(0, ...existing.map((v) => v.version)) + 1;
  const note = input.note?.trim().slice(0, 300) || null;
  const db = createAdminClient();
  const { error } = await db.from("programme_policy").insert({
    version,
    effective_from: input.effectiveFrom,
    on_track_threshold: input.onTrack,
    needs_help_threshold: input.needsHelp,
    inactive_streak: input.inactiveStreak,
    graduation_attendance_threshold: input.graduationAttendance,
    note,
    created_by: user.id,
  });
  if (error) throw new Error(error.message.includes("policy version") ? error.message : "Couldn't save the new policy. Please try again.");

  await db.from("audit_log").insert({
    actor_id: user.id,
    entity: "programme_policy",
    entity_id: String(version),
    action: "new_version",
    after: { ...input, note },
  });

  // A network-wide rule change: everyone who works with it.
  await notify(
    { type: "network" },
    () => ({
      kind: "bands_updated",
      title: `New programme policy from ${formatShortDate(input.effectiveFrom)}`,
      body: `On track ≥ ${input.onTrack}% · Needs help ≥ ${input.needsHelp}% · Graduation ≥ ${input.graduationAttendance}%`,
      dedupeKey: `policy:${version}`,
    }),
    { exclude: [user.id] }
  );

  revalidatePath("/", "layout");
  return { version };
}
