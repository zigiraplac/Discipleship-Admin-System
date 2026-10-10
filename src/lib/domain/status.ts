import type { Bands } from "./types";
import { addDaysISO, periodAttendance, sumFacts, type CohortFacts, type DeliveryTotals, type Totals } from "./rollup";
import type { SeatTotals } from "./metrics";

/**
 * Organisational status — Good / Needs attention / Critical — derived from
 * named signals, never a single opaque score. Every status carries the
 * reasons behind it, so a leader can see *why* and ask the right person.
 *
 * Attendance is judged by the programme policy's own bands. The other
 * cut-offs are the rules below, in one place so they can be reviewed (and
 * later moved into the programme policy if the organisation wants).
 */
export const STATUS_RULES = {
  /** Delivery = registers recorded ÷ lessons due in the period. */
  deliveryCritical: 50,
  deliveryAttention: 80,
  /** Share of active students who are at risk. */
  atRiskCriticalShare: 25,
  atRiskAttentionShare: 10,
  /** Share of active students who are inactive. */
  inactiveAttentionShare: 10,
  /** Share of running cohorts behind their plan. */
  behindCriticalShare: 50,
  /** Attendance points lost against the previous period. */
  attendanceDrop: 5,
} as const;

export type UnitStatus = "good" | "attention" | "critical" | "quiet";

export interface StatusSignal {
  key: "attendance" | "attendanceDrop" | "delivery" | "atRisk" | "behind" | "inactive" | "overdue";
  severity: "critical" | "attention";
  text: string;
}

export interface StatusView {
  status: UnitStatus;
  /** Most severe first. Empty when Good. */
  signals: StatusSignal[];
}

export const STATUS_LABELS: Record<UnitStatus, string> = {
  good: "On track",
  attention: "Needs attention",
  critical: "At risk",
  quiet: "No activity",
};

/**
 * What a parent is told about a child's status: plain words, no figures —
 * the figures belong to the child's own dashboard. Each phrase is the
 * meaning of a real status signal; nothing is invented.
 */
export function managementReason(signal: StatusSignal | undefined): string | null {
  if (!signal) return null;
  switch (signal.key) {
    case "attendance":
      return signal.severity === "critical" ? "Student attendance is at the at-risk level" : "Student attendance is below the programme expectation";
    case "attendanceDrop":
      return "Student participation has declined";
    case "atRisk":
      return signal.severity === "critical" ? "A large share of students are at risk" : "A growing share of students are at risk";
    case "behind":
      return "Cohorts are behind their teaching schedule";
    case "delivery":
      return "Lessons are not being recorded";
    case "inactive":
      return "Several students have stopped attending";
    case "overdue":
      return "Follow-ups are overdue";
  }
}

/** The label to show: "No activity" only when there really are no active
 * students — a running level with too few recorded lessons to judge says so. */
export function statusLabel(status: UnitStatus, activeStudents: number): string {
  return status === "quiet" && activeStudents > 0 ? "Not enough data yet" : STATUS_LABELS[status];
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function unitStatus(input: {
  totals: Totals;
  /** Attendance over the period (recorded lessons only), and the period before. */
  attendance: SeatTotals;
  attendancePrev: number | null;
  delivery: DeliveryTotals;
  bands: Bands;
}): StatusView {
  const { totals: t, attendance, attendancePrev, delivery, bands } = input;
  const R = STATUS_RULES;
  const out: StatusSignal[] = [];
  const add = (key: StatusSignal["key"], severity: StatusSignal["severity"], text: string) => out.push({ key, severity, text });

  if (attendance.rate != null) {
    if (attendance.rate < bands.helpThreshold) add("attendance", "critical", `Attendance ${attendance.rate}% (at-risk level, below ${bands.helpThreshold}%)`);
    else if (attendance.rate < bands.activeThreshold) add("attendance", "attention", `Attendance ${attendance.rate}% (below ${bands.activeThreshold}%)`);
    if (attendancePrev != null && attendancePrev - attendance.rate >= R.attendanceDrop) {
      add("attendanceDrop", "attention", `Attendance down ${attendancePrev - attendance.rate} pts on the previous period`);
    }
  }
  if (delivery.rate != null) {
    const missing = delivery.due - delivery.recorded;
    const text = `Delivery ${delivery.rate}% — ${missing} ${missing === 1 ? "register" : "registers"} not recorded`;
    if (delivery.rate < R.deliveryCritical) add("delivery", "critical", text);
    else if (delivery.rate < R.deliveryAttention) add("delivery", "attention", text);
  }
  const riskShare = pct(t.atRisk, t.active);
  if (t.atRisk && riskShare >= R.atRiskCriticalShare) add("atRisk", "critical", `${t.atRisk} of ${t.active} students at risk`);
  else if (t.atRisk && riskShare >= R.atRiskAttentionShare) add("atRisk", "attention", `${t.atRisk} of ${t.active} students at risk`);
  if (t.behind) {
    const share = pct(t.behind, t.running);
    add("behind", share >= R.behindCriticalShare ? "critical" : "attention", `${t.behind} of ${t.running} cohorts behind schedule`);
  }
  if (t.inactive && pct(t.inactive, t.active) >= R.inactiveAttentionShare) add("inactive", "attention", `${t.inactive} students inactive`);
  if (t.overdueFollowUps) add("overdue", "attention", `${t.overdueFollowUps} follow-ups overdue`);

  out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  const status: UnitStatus = out.some((s) => s.severity === "critical")
    ? "critical"
    : out.length
      ? "attention"
      : t.running || t.active
        ? "good"
        : "quiet";
  return { status, signals: out };
}

const RANK: Record<UnitStatus, number> = { critical: 3, attention: 2, good: 1, quiet: 0 };

/** Worst first; ties broken by how many critical, then any, signals. */
export function compareStatus(a: StatusView, b: StatusView): number {
  return (
    RANK[b.status] - RANK[a.status] ||
    b.signals.filter((s) => s.severity === "critical").length - a.signals.filter((s) => s.severity === "critical").length ||
    b.signals.length - a.signals.length
  );
}

// ── Management alerts ─────────────────────────────────────────────────────
// The status a parent is *notified* about. Deliberately narrower than the
// dashboard status, so alerts mean something:
//  - a fixed 30-day window against the 30 days before;
//  - no alert from a level too small to judge;
//  - delivery is left out for now — with register recording still
//    catching up it would turn nearly every level red at once (it stays on
//    the dashboard). Schedule ("cohorts behind") is left out for the same
//    reason: a cohort's position is counted from *recorded* lessons, so
//    missing registers make it look behind. Both can be switched back on
//    (includeSchedule) once registers are kept up to date;
//  - "any cohort behind", "any overdue follow-up" and inactive students
//    are left out: nearly always true, they'd keep everything amber.

export const ALERT_RULES = {
  windowDays: 30,
  minActiveStudents: 10,
  minRecordedLessons: 5,
  atRiskCriticalShare: STATUS_RULES.atRiskCriticalShare,
  atRiskAttentionShare: STATUS_RULES.atRiskAttentionShare,
  behindCriticalShare: STATUS_RULES.behindCriticalShare,
  attendanceDrop: STATUS_RULES.attendanceDrop,
  /** Off while register completeness is low (see above). */
  includeSchedule: false as boolean,
} as const;

export function alertStatus(input: {
  totals: Totals;
  /** Attendance over the alert window (recorded lessons only), and the window before. */
  attendance: SeatTotals;
  attendancePrev: number | null;
  /** Recorded lessons in the window, across the level's cohorts. */
  recordedLessons: number;
  bands: Bands;
}): StatusView {
  const { totals: t, attendance, attendancePrev, bands } = input;
  const R = ALERT_RULES;
  if (t.active < R.minActiveStudents || input.recordedLessons < R.minRecordedLessons) return { status: "quiet", signals: [] };

  const out: StatusSignal[] = [];
  const add = (key: StatusSignal["key"], severity: StatusSignal["severity"], text: string) => out.push({ key, severity, text });
  if (attendance.rate != null) {
    if (attendance.rate < bands.helpThreshold) add("attendance", "critical", `Attendance ${attendance.rate}% (at-risk level, below ${bands.helpThreshold}%)`);
    else if (attendance.rate < bands.activeThreshold) add("attendance", "attention", `Attendance ${attendance.rate}% (below ${bands.activeThreshold}%)`);
    if (attendancePrev != null && attendancePrev - attendance.rate >= R.attendanceDrop) {
      add("attendanceDrop", "attention", `Attendance down ${attendancePrev - attendance.rate} pts on the previous 30 days`);
    }
  }
  const riskShare = pct(t.atRisk, t.active);
  if (riskShare >= R.atRiskCriticalShare) add("atRisk", "critical", `${t.atRisk} of ${t.active} students at risk`);
  else if (riskShare >= R.atRiskAttentionShare) add("atRisk", "attention", `${t.atRisk} of ${t.active} students at risk`);
  if (R.includeSchedule && t.running && pct(t.behind, t.running) >= R.behindCriticalShare) {
    add("behind", "critical", `${t.behind} of ${t.running} cohorts behind schedule`);
  }

  out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  return { status: out.some((x) => x.severity === "critical") ? "critical" : out.length ? "attention" : "good", signals: out };
}

/** The management status of a level or cohort, from its facts — what its
 * parent sees on the dashboard and is alerted about. One calculation for both. */
export function managementStatus(facts: CohortFacts[], today: string, bands: Bands): StatusView {
  const windowStart = addDaysISO(today, -ALERT_RULES.windowDays);
  const att = periodAttendance(facts, today, ALERT_RULES.windowDays);
  return alertStatus({
    totals: sumFacts(facts, today),
    attendance: att.now,
    attendancePrev: att.before.rate,
    recordedLessons: facts.reduce((n, f) => n + f.lessonsDue.filter((l) => l.recorded && l.date > windowStart).length, 0),
    bands,
  });
}

// ── Status transitions (what a parent is told) ─────────────────────────────

export interface StatusState {
  /** Confirmed status. */
  status: UnitStatus;
  /** A different status seen, waiting to be confirmed on a later day. */
  pendingStatus: UnitStatus | null;
  pendingSince: string | null;
  lastNotifiedStatus: UnitStatus | null;
  lastNotifiedAt: string | null; // YYYY-MM-DD
}

export interface Transition {
  from: UnitStatus;
  to: UnitStatus;
  kind: "worse" | "improved";
}

export const TRANSITION_RULES = {
  /** A new status must be seen on two daily checks before it counts. */
  confirmAfterDays: 1,
  /** At most one alert per child per status in this many days. */
  cooldownDays: 7,
} as const;

const SEVERITY: Record<UnitStatus, number> = { quiet: 0, good: 1, attention: 2, critical: 3 };

function daysApart(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * One daily check of a child's alert status. Returns the new stored state
 * and, when warranted, the transition to tell its parent about:
 *  - first time seen → just record it (no alert: nothing changed);
 *  - a different status must hold on two daily checks before it counts;
 *  - worse (Good → Needs attention, Good/Needs attention → Critical) → alert;
 *  - Critical → Needs attention → alert, as an improvement;
 *  - Needs attention → Good, and anything to or from "no activity" → no alert;
 *  - the same status is alerted at most once per cooldown.
 */
export function nextStatusState(prev: StatusState | null, observed: UnitStatus, today: string): { state: StatusState; transition: Transition | null } {
  if (!prev) return { state: { status: observed, pendingStatus: null, pendingSince: null, lastNotifiedStatus: null, lastNotifiedAt: null }, transition: null };
  if (observed === prev.status) return { state: { ...prev, pendingStatus: null, pendingSince: null }, transition: null };

  const pendingSince = prev.pendingStatus === observed && prev.pendingSince ? prev.pendingSince : today;
  if (daysApart(pendingSince, today) < TRANSITION_RULES.confirmAfterDays) {
    return { state: { ...prev, pendingStatus: observed, pendingSince }, transition: null };
  }

  const from = prev.status;
  const confirmed: StatusState = { ...prev, status: observed, pendingStatus: null, pendingSince: null };
  const worse = from !== "quiet" && observed !== "quiet" && SEVERITY[observed] > SEVERITY[from];
  const improved = from === "critical" && observed === "attention";
  if (!worse && !improved) return { state: confirmed, transition: null };

  const cooled =
    prev.lastNotifiedStatus === observed && prev.lastNotifiedAt != null && daysApart(prev.lastNotifiedAt, today) < TRANSITION_RULES.cooldownDays;
  if (cooled) return { state: confirmed, transition: null };
  return {
    state: { ...confirmed, lastNotifiedStatus: observed, lastNotifiedAt: today },
    transition: { from, to: observed, kind: worse ? "worse" : "improved" },
  };
}
