import { createAdminClient } from "@/lib/supabase/admin";
import { getAllUnits, getCohortStaffContacts, getPolicy, getUnitLeaderContacts, getUnitReport } from "@/lib/data/org";
import { LEVELS } from "@/lib/domain/levels";
import type { CohortFacts } from "@/lib/domain/rollup";
import { managementStatus, nextStatusState, STATUS_LABELS, type StatusState, type UnitStatus } from "@/lib/domain/status";
import { notify } from "./index";

/**
 * One-level-up status alerts, run by the daily job. For every level (below
 * the top) and every cohort: work out its alert status (alertStatus — fixed
 * 30-day window, delivery excluded), compare with the stored state
 * (nextStatusState — two-day confirmation, worsening and Critical→Needs
 * attention only, 7-day cooldown), save the state, and tell the parent's
 * leaders. Only the child is named — with its top reason and who is
 * responsible for it — never anything below it.
 */
export async function runStatusAlerts(today: string): Promise<{ checked: number; alerts: number }> {
  const db = createAdminClient();
  const units = await getAllUnits();
  const root = units.find((u) => !u.parentId);
  if (!root) return { checked: 0, alerts: 0 };
  const [report, { bands }, leaders, cohortStaff, { data: stored, error }] = await Promise.all([
    getUnitReport(root.id),
    getPolicy(),
    getUnitLeaderContacts(),
    getCohortStaffContacts(),
    db.from("status_alert_state").select("*"),
  ]);
  if (error) throw error;
  const byId = new Map(units.map((u) => [u.id, u]));
  const pathOf = (unitId: string | null) => (unitId ? byId.get(unitId)?.path ?? null : null);
  const states = new Map(
    (stored ?? []).map((r) => [
      `${r.subject_type}:${r.subject_id}`,
      {
        status: r.status as UnitStatus,
        pendingStatus: r.pending_status as UnitStatus | null,
        pendingSince: r.pending_since,
        lastNotifiedStatus: r.last_notified_status as UnitStatus | null,
        lastNotifiedAt: r.last_notified_at,
      } satisfies StatusState,
    ])
  );

  const evaluate = (facts: CohortFacts[]) => managementStatus(facts, today, bands);

  type Subject = { type: "unit" | "cohort"; id: string; name: string; parentUnitId: string; label: string; responsible: string };
  const subjects: { s: Subject; facts: CohortFacts[] }[] = [];
  for (const u of units) {
    if (!u.parentId) continue;
    const facts = report.facts.filter((f) => {
      const p = pathOf(f.orgUnitId);
      return p != null && (p === u.path || p.startsWith(`${u.path}.`));
    });
    const who = leaders.get(u.id) ?? [];
    subjects.push({
      s: { type: "unit", id: u.id, name: u.name, parentUnitId: u.parentId, label: LEVELS[u.type].label, responsible: who.length ? who.map((l) => `${l.name} (${l.email})`).join(", ") : "not assigned" },
      facts,
    });
  }
  for (const f of report.facts) {
    if (!f.orgUnitId || f.phase !== "running") continue;
    const who = cohortStaff.get(f.cohortId) ?? [];
    subjects.push({
      s: { type: "cohort", id: f.cohortId, name: f.name, parentUnitId: f.orgUnitId, label: "Cohort", responsible: who.length ? who.map((l) => `${l.name} (${l.email})`).join(", ") : "no facilitator" },
      facts: [f],
    });
  }

  let alerts = 0;
  const rows = [];
  for (const { s, facts } of subjects) {
    const view = evaluate(facts);
    const { state, transition } = nextStatusState(states.get(`${s.type}:${s.id}`) ?? null, view.status, today);
    rows.push({
      subject_type: s.type,
      subject_id: s.id,
      status: state.status,
      pending_status: state.pendingStatus,
      pending_since: state.pendingSince,
      last_notified_status: state.lastNotifiedStatus,
      last_notified_at: state.lastNotifiedAt,
      updated_at: new Date().toISOString(),
    });
    if (!transition) continue;
    const reason = view.signals[0]?.text;
    const slugOf = (id?: string) => byId.get(id ?? "")?.slug;
    alerts += await notify({ type: "child_status", parentUnitId: s.parentUnitId }, (_audience, r) => ({
      kind: "status_change",
      title:
        transition.kind === "worse"
          ? `${s.name} is now ${STATUS_LABELS[transition.to]}`
          : `${s.name} improved: ${STATUS_LABELS[transition.from]} → ${STATUS_LABELS[transition.to]}`,
      body: [reason, `Responsible: ${s.responsible}`].filter(Boolean).join(" · "),
      href: slugOf(r.unitId) ? `/u/${slugOf(r.unitId)}` : undefined,
      dedupeKey: `status:${s.id}:${transition.to}:${today}`,
    }));
  }
  if (rows.length) {
    const { error: upErr } = await db.from("status_alert_state").upsert(rows, { onConflict: "subject_type,subject_id" });
    if (upErr) throw upErr;
  }
  return { checked: subjects.length, alerts };
}
