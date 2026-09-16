/**
 * One-time fix for every existing cohort: the schedule generator used to
 * create a 3-day crusade weekend (Fri/Sat/Sun); it's now 2 days (Fri/Sat).
 * Every cohort created before that fix has a spurious Sunday event sitting
 * in its schedule for every crusade weekend, and everything scheduled
 * after each one is one day later than it should be.
 *
 * Surgical, not a recompute: for each cohort, this only subtracts exactly
 * the number of still-earlier removed Sundays from every other event's
 * *own currently stored date* — it never re-derives a schedule from
 * scratch. That distinction matters: an earlier version of this script
 * re-walked the whole not-yet-taught remainder with `placeSchedule()` from
 * the cohort's ideal pace, which silently discarded any *real* postponement
 * a facilitator had made in the meantime (found via `event.edited = true`
 * counts before this fix — some cohorts have dozens). Shifting each
 * existing date by a small integer offset instead preserves that history:
 * a lesson postponed for its own real reason keeps its gap to its
 * neighbors, it just loses the same bug-introduced day everything else does.
 *
 * Safe by construction:
 *   - A crusade event never has a register (only `kind = 'lesson'` gets
 *     one, via the event_creates_register trigger) — so deleting a Sunday
 *     row never touches attendance data, regardless of whether that
 *     weekend is in the past or future.
 *   - An already-recorded LESSON's date is real history and is never
 *     touched, regardless of what the offset math would otherwise say.
 *   - A cohort with no spurious Sunday at all (already created after the
 *     generator fix) gets zero updates — this never touches a cohort that
 *     doesn't actually have the bug, even if its dates differ from some
 *     "ideal" schedule for an unrelated reason (a real postponement, a
 *     different pace setting, ...). That's out of scope for this fix.
 *
 * DRY RUN BY DEFAULT — prints what would change for every cohort without
 * writing anything. Re-run with --apply to actually commit.
 *
 * Run with: npm run fix-crusade-schedule           (dry run)
 *           npm run fix-crusade-schedule -- --apply (writes for real)
 */
import { createAdminClient } from "@/lib/supabase/admin";

const APPLY = process.argv.includes("--apply");

interface EventRow {
  id: string;
  event_date: string;
  kind: "lesson" | "crusade";
  after_class: number | null;
  crusade_day: number | null;
  lesson: { global_index: number } | { global_index: number }[] | null;
  register: { recorded_at: string | null } | { recorded_at: string | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

async function main() {
  const admin = createAdminClient();

  const { data: cohorts, error: cohortErr } = await admin.from("cohort").select("id, name");
  if (cohortErr) throw cohortErr;

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${cohorts?.length ?? 0} cohort(s) to check.\n`);

  let totalSundaysRemoved = 0;
  let totalDatesShifted = 0;

  for (const cohort of cohorts ?? []) {
    const { data: rows, error: rowsErr } = await admin
      .from("event")
      .select("id, event_date, kind, after_class, crusade_day, lesson:lesson_id(global_index), register(recorded_at)")
      .eq("cohort_id", cohort.id);
    if (rowsErr) throw rowsErr;

    const events = (rows ?? []) as unknown as EventRow[];

    const sundays = events.filter((e) => e.kind === "crusade" && e.crusade_day === 2);
    if (!sundays.length) {
      console.log(`${cohort.name}: no spurious Sunday events — nothing to do.`);
      continue;
    }
    const sundayDates = sundays.map((s) => s.event_date).sort();

    const updates: { id: string; event_date: string; from: string; label: string }[] = [];
    for (const e of events) {
      if (e.kind === "crusade" && e.crusade_day === 2) continue; // the Sunday itself — deleted, not shifted
      const reg = one(e.register);
      if (e.kind === "lesson" && reg?.recorded_at != null) continue; // real history — never move

      const offset = sundayDates.filter((d) => d < e.event_date).length;
      if (offset === 0) continue;
      const newDate = addDays(e.event_date, -offset);
      if (newDate === e.event_date) continue;

      const lesson = one(e.lesson);
      const label =
        e.kind === "lesson" && lesson ? `L${lesson.global_index}` : `C${e.after_class}-${e.crusade_day}`;
      updates.push({ id: e.id, event_date: newDate, from: e.event_date, label });
    }

    console.log(`${cohort.name}:`);
    console.log(`  Sunday crusade events to remove: ${sundays.length}`);
    console.log(`  Event dates to shift: ${updates.length}`);
    for (const u of updates.slice(0, 5)) console.log(`    ${u.label}: ${u.from} -> ${u.event_date}`);
    if (updates.length > 5) console.log(`    ...and ${updates.length - 5} more`);

    totalSundaysRemoved += sundays.length;
    totalDatesShifted += updates.length;

    if (!APPLY) continue;

    if (updates.length) {
      const { error } = await admin.rpc("apply_event_date_updates", {
        p_updates: updates.map((u) => ({ id: u.id, event_date: u.event_date })),
      });
      if (error) throw error;
    }
    const { error: delErr } = await admin.from("event").delete().in("id", sundays.map((s) => s.id));
    if (delErr) throw delErr;
    console.log(`  Applied.`);
  }

  console.log(`\n${APPLY ? "Done." : "Dry run complete — nothing was written."}`);
  console.log(`Total: ${totalSundaysRemoved} Sunday event(s), ${totalDatesShifted} date(s) shifted.`);
  if (!APPLY) console.log(`Re-run with --apply to commit these changes.`);
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
