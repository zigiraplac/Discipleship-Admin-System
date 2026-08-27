/**
 * One-time fix for every existing cohort: the schedule generator used to
 * create a 3-day crusade weekend (Fri/Sat/Sun); it's now 2 days (Fri/Sat).
 * Every cohort created before that fix has a spurious Sunday event sitting
 * in its schedule for every crusade weekend, and everything scheduled
 * after each one is one day later than it should be.
 *
 * Safe by construction:
 *   - A crusade event never has a register (only `kind = 'lesson'` gets
 *     one, via the event_creates_register trigger) — so deleting a Sunday
 *     row never touches attendance data, regardless of whether that
 *     weekend is in the past or future.
 *   - An already-recorded LESSON's date is real history and is never
 *     touched — only the not-yet-recorded remainder (everything after the
 *     last recorded lesson, in curriculum order) gets re-dated, using the
 *     exact same placeSchedule() walk postponeLesson() already uses for a
 *     single-lesson reflow, just seeded with the corrected (2-day) item
 *     list instead of a postponed one.
 *
 * DRY RUN BY DEFAULT — prints what would change for every cohort without
 * writing anything. Re-run with --apply to actually commit.
 *
 * Run with: npm run fix-crusade-schedule           (dry run)
 *           npm run fix-crusade-schedule -- --apply (writes for real)
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { curriculumScheduleItems, placeSchedule, dayAfter, type ScheduleItem } from "@/lib/domain/generator";

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

function scheduleItemKey(item: ScheduleItem): string {
  return item.kind === "lesson" ? `L${item.globalIndex}` : `C${item.afterClass}-${item.crusadeDay}`;
}

async function main() {
  const admin = createAdminClient();

  const { data: cohorts, error: cohortErr } = await admin
    .from("cohort")
    .select("id, name, start_date, teaching_days, lessons_per_session");
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

    const sundayIds = events
      .filter((e) => e.kind === "crusade" && e.crusade_day === 2)
      .map((e) => e.id);

    // Map every existing row to its (kind, key) identity — global_index for
    // a lesson, (afterClass, crusadeDay) for a crusade day — independent of
    // curriculum *position*, so this still works even though positions
    // shift once the item count per weekend changes from 3 to 2.
    const lessonByGlobalIndex = new Map<number, { id: string; date: string; recordedAt: string | null }>();
    for (const e of events) {
      if (e.kind !== "lesson") continue;
      const lesson = one(e.lesson);
      if (!lesson) continue;
      const reg = one(e.register);
      lessonByGlobalIndex.set(lesson.global_index, { id: e.id, date: e.event_date, recordedAt: reg?.recorded_at ?? null });
    }
    const crusadeByKey = new Map<string, { id: string; date: string }>();
    for (const e of events) {
      if (e.kind !== "crusade" || e.after_class == null || e.crusade_day == null) continue;
      crusadeByKey.set(`${e.after_class}-${e.crusade_day}`, { id: e.id, date: e.event_date });
    }

    let maxRecordedGlobalIndex = -1;
    let maxRecordedDate: string | null = null;
    for (const [globalIndex, info] of lessonByGlobalIndex) {
      if (info.recordedAt != null && globalIndex > maxRecordedGlobalIndex) {
        maxRecordedGlobalIndex = globalIndex;
        maxRecordedDate = info.date;
      }
    }

    const newItems = curriculumScheduleItems(); // already the corrected 2-day-per-weekend version
    const frontierIndex = newItems.findIndex(
      (item) => item.kind === "lesson" && item.globalIndex > maxRecordedGlobalIndex
    );
    const pending = frontierIndex === -1 ? [] : newItems.slice(frontierIndex);

    const anchor = maxRecordedDate ? dayAfter(maxRecordedDate) : cohort.start_date;
    const replaced = pending.length ? placeSchedule(pending, anchor, cohort.teaching_days, cohort.lessons_per_session) : [];

    const updates: { id: string; event_date: string; from: string; label: string }[] = [];
    for (let i = 0; i < replaced.length; i++) {
      const item = pending[i];
      const key = scheduleItemKey(item);
      const existing = item.kind === "lesson" ? lessonByGlobalIndex.get(item.globalIndex) : crusadeByKey.get(`${item.afterClass}-${item.crusadeDay}`);
      if (!existing || existing.date === replaced[i].date) continue;
      // maxRecordedGlobalIndex only tracks the *furthest* recorded lesson,
      // not that everything before it is contiguous — an out-of-order
      // recording (rare, but the app doesn't forbid it) could leave an
      // already-recorded lesson sitting inside the "pending" range. Never
      // move a recorded lesson's date regardless of what placeSchedule
      // computed for that slot — real attendance history is immovable.
      if (item.kind === "lesson" && lessonByGlobalIndex.get(item.globalIndex)?.recordedAt != null) continue;
      updates.push({ id: existing.id, event_date: replaced[i].date, from: existing.date, label: key });
    }

    if (!sundayIds.length && !updates.length) {
      console.log(`${cohort.name}: already correct, nothing to do.`);
      continue;
    }

    console.log(`${cohort.name}:`);
    console.log(`  Sunday crusade events to remove: ${sundayIds.length}`);
    console.log(`  Event dates to shift: ${updates.length}`);
    for (const u of updates.slice(0, 5)) console.log(`    ${u.label}: ${u.from} -> ${u.event_date}`);
    if (updates.length > 5) console.log(`    ...and ${updates.length - 5} more`);

    totalSundaysRemoved += sundayIds.length;
    totalDatesShifted += updates.length;

    if (!APPLY) continue;

    if (updates.length) {
      const { error } = await admin.rpc("apply_event_date_updates", {
        p_updates: updates.map((u) => ({ id: u.id, event_date: u.event_date })),
      });
      if (error) throw error;
    }
    if (sundayIds.length) {
      const { error } = await admin.from("event").delete().in("id", sundayIds);
      if (error) throw error;
    }
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
