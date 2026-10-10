import {
  childId,
  childName,
  getCohortStaff,
  getCohortStaffContacts,
  getPolicy,
  getStaffCounts,
  getUnitLeaderContacts,
  getUnitReport,
  requireUnit,
  type ChildRef,
  type LeaderContact,
  type UnitReport,
} from "./org";
import { getResponsibilities } from "@/lib/authz";
import type { AppUser } from "@/lib/domain/types";
import { LEVELS } from "@/lib/domain/levels";
import { managementReason, managementStatus, statusLabel, unitStatus, type StatusView, type UnitStatus } from "@/lib/domain/status";
import type { Bands } from "@/lib/domain/types";
import {
  ISSUE_ORDER,
  issuesFor,
  monthSeries,
  periodAttendance,
  periodDelivery,
  registeredOn,
  activeOn,
  addDaysISO,
  periodMovement,
  studentHistory,
  type HistoryPoint,
  sumFacts,
  type CohortFacts,
  type IssueKind,
  type ScheduleState,
  type Severity,
  type Totals,
} from "@/lib/domain/rollup";

/** Plain, serializable view data for level pages and their charts. */

export const PERIODS = [
  { days: 30, label: "Last 30 days", short: "in the last 30 days" },
  { days: 90, label: "Last 3 months", short: "in the last 3 months" },
  { days: 365, label: "Last 12 months", short: "in the last 12 months" },
] as const;

export type PeriodDays = (typeof PERIODS)[number]["days"];

export function parsePeriod(value: string | string[] | undefined): PeriodDays {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (PERIODS.find((p) => p.days === n)?.days ?? 90) as PeriodDays;
}

export function periodLabel(days: PeriodDays): string {
  return PERIODS.find((p) => p.days === days)!.short;
}

export interface ChildSummary {
  id: string;
  kind: "unit" | "cohort";
  name: string;
  levelLabel: string;
  totals: Totals;
  movement: { joined: number; left: number; completed: number };
  issues: number;
  urgent: boolean;
  /** Cohorts only. */
  schedule?: ScheduleState;
  progressPct?: number;
}

export function childSummaries(report: UnitReport, periodDays: number): ChildSummary[] {
  return report.children.map((c: ChildRef) => {
    const facts = report.factsByChild.get(childId(c)) ?? [];
    const issues = facts.flatMap((f) => issuesFor(f, report.today));
    const own = c.kind === "cohort" ? facts[0] : undefined;
    return {
      id: childId(c),
      kind: c.kind,
      name: childName(c),
      levelLabel: c.kind === "unit" ? LEVELS[c.unit.type].label : "Cohort",
      totals: sumFacts(facts, report.today),
      movement: periodMovement(facts, report.today, periodDays),
      issues: issues.length,
      urgent: issues.some((i) => i.severity === "urgent"),
      schedule: own?.schedule,
      progressPct: own?.progressPct,
    };
  });
}

export interface IssueRow {
  kind: IssueKind;
  severity: Severity;
  count: number;
  text: string;
  cohortId: string;
  /** The direct child of the current box this problem sits under. */
  childId: string;
  childName: string;
  childLevel: string;
  /** From below that child down to the cohort ("Church › Promotion › Cohort");
   * empty when the child is the cohort itself. */
  path: string[];
}

export function issueRows(report: UnitReport): IssueRow[] {
  const rows: IssueRow[] = [];
  for (const c of report.children) {
    const facts = report.factsByChild.get(childId(c)) ?? [];
    for (const f of facts) {
      const below = report.pathBelow.get(f.cohortId) ?? [];
      for (const issue of issuesFor(f, report.today)) {
        rows.push({
          ...issue,
          cohortId: f.cohortId,
          childId: childId(c),
          childName: childName(c),
          childLevel: c.kind === "unit" ? LEVELS[c.unit.type].label : "Cohort",
          path: c.kind === "unit" ? below.slice(1) : [],
        });
      }
    }
  }
  return rows;
}

export interface IssueSummary {
  kind: IssueKind;
  severity: Severity;
  total: number;
  cohorts: number;
  childNames: string[];
}

/** One line per kind of problem, urgent first. */
export function summarizeIssues(rows: IssueRow[]): IssueSummary[] {
  const by = new Map<IssueKind, { total: number; cohorts: Set<string>; children: Set<string>; urgent: boolean }>();
  for (const r of rows) {
    const e = by.get(r.kind) ?? { total: 0, cohorts: new Set(), children: new Set(), urgent: false };
    e.total += r.count;
    e.cohorts.add(r.cohortId);
    e.children.add(r.childName);
    e.urgent ||= r.severity === "urgent";
    by.set(r.kind, e);
  }
  return [...by.entries()]
    .map(([kind, e]) => ({
      kind,
      severity: (e.urgent ? "urgent" : "watch") as Severity,
      total: e.total,
      cohorts: e.cohorts.size,
      childNames: [...e.children],
    }))
    .sort((a, b) =>
      a.severity !== b.severity ? (a.severity === "urgent" ? -1 : 1) : ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind)
    );
}

/** Everything a level page starts from: access (checked), the box's
 * report, the chosen period and the box's totals. */
export async function loadLevelPage(slug: string, searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const access = await requireUnit(slug);
  const [report, sp] = await Promise.all([getUnitReport(access.unit.id), searchParams]);
  const period = parsePeriod(sp.period);
  return { ...access, report, period, searchParams: sp, totals: sumFacts(report.facts, report.today) };
}

/** A level's (or a group of cohorts') status, with the figures behind it. */
export interface StatusFigures extends StatusView {
  totals: Totals;
  attendance: number | null;
  attendancePrev: number | null;
  delivery: number | null;
  deliveryPrev: number | null;
  registersMissing: number;
}

export function statusFor(facts: CohortFacts[], today: string, periodDays: number, bands: Bands): StatusFigures {
  const totals = sumFacts(facts, today);
  const att = periodAttendance(facts, today, periodDays);
  const del = periodDelivery(facts, today, periodDays);
  const view = unitStatus({ totals, attendance: att.now, attendancePrev: att.before.rate, delivery: del.now, bands });
  return {
    ...view,
    totals,
    attendance: att.now.rate,
    attendancePrev: att.before.rate,
    delivery: del.now.rate,
    deliveryPrev: del.before.rate,
    registersMissing: del.now.due - del.now.recorded,
  };
}

/** Who answers for a child: its own leaders (or a cohort's facilitators),
 * or — when it has none — the level above that manages it. */
export type Responsible =
  | { kind: "people"; role: string; people: LeaderContact[] }
  | { kind: "managed"; by: string };

/** One direct child as its parent sees it: status in words, scale, and who
 * answers for it. Deliberately no attendance, register or student detail —
 * those belong to the child's own dashboard. */
export interface StatusRow {
  id: string;
  kind: "unit" | "cohort";
  name: string;
  levelLabel: string;
  /** The management status — the same one the parent is alerted about. */
  status: UnitStatus;
  statusText: string;
  /** One plain reason, only when attention is needed. */
  reason: string | null;
  students: number;
  active: number;
  /** Only when this viewer is responsible for the child (it has no leader
   * of its own, or it's a cohort they work in); otherwise they see the
   * summary and contact the responsible person. */
  href: string | null;
  staff: number;
  /** For a cohort: who its team is, e.g. "1 facilitator · 2 teachers". */
  staffDetail?: string;
  responsible: Responsible;
}

/**
 * A parent's view of each direct child: status with one plain reason,
 * scale, staff, and who is responsible — enough to know something needs
 * attention and whom to ask, never the child's internal detail.
 */
export function childStatusRows(
  report: UnitReport,
  bands: Bands,
  ctx: {
    leaders: Map<string, LeaderContact[]>;
    cohortStaff: Map<string, LeaderContact[]>;
    staffCounts: Map<string, number>;
    /** Cohort teams by role, for cohort children ("1 facilitator · 2 teachers"). */
    cohortTeams?: Map<string, { facilitators: number; teachers: number }>;
    /** May the viewer open this cohort (they work in it)? */
    cohortHref: (cohortId: string, slug: string) => string | null;
  }
): StatusRow[] {
  return report.children.map((c) => {
    const id = childId(c);
    const facts = report.factsByChild.get(id) ?? [];
    const totals = sumFacts(facts, report.today);
    const { status, signals } = managementStatus(facts, report.today, bands);
    const people = c.kind === "unit" ? (ctx.leaders.get(c.unit.id) ?? []) : (ctx.cohortStaff.get(c.cohort.id) ?? []);
    const responsible: Responsible = people.length
      ? { kind: "people", role: c.kind === "unit" ? `${LEVELS[c.unit.type].label} leader` : "Facilitator", people }
      : { kind: "managed", by: report.unit.name };
    return {
      id,
      kind: c.kind,
      name: childName(c),
      levelLabel: c.kind === "unit" ? LEVELS[c.unit.type].label : "Cohort",
      status,
      statusText: statusLabel(status, totals.active),
      reason: status === "attention" || status === "critical" ? managementReason(signals[0]) : null,
      students: totals.registered,
      active: totals.active,
      // An unstaffed child is managed from here, so it opens; a staffed one is its leader's.
      href: c.kind === "unit" ? (people.length ? null : `/u/${c.unit.slug}`) : ctx.cohortHref(c.cohort.id, c.cohort.slug),
      staff: ctx.staffCounts.get(id) ?? 0,
      staffDetail: c.kind === "cohort" ? teamText(ctx.cohortTeams?.get(id)) : undefined,
      responsible,
    };
  });
}

function teamText(t?: { facilitators: number; teachers: number }): string | undefined {
  if (!t) return undefined;
  const part = (n: number, one: string) => (n ? `${n} ${one}${n === 1 ? "" : "s"}` : null);
  return [part(t.facilitators, "facilitator"), part(t.teachers, "teacher")].filter(Boolean).join(" · ") || undefined;
}

/** Each direct child's active students right now — for comparing the
 * children side by side ("how do my direct children compare?"). History
 * lives in each child's summary panel, not here. */
export function childComparison(report: UnitReport): { id: string; name: string; value: number }[] {
  return report.children.map((c) => ({
    id: childId(c),
    name: childName(c),
    value: sumFacts(report.factsByChild.get(childId(c)) ?? [], report.today).active,
  }));
}

/** How many cohorts are running, and in how many churches / countries. */
export function activeFootprint(report: UnitReport): { cohorts: number; churches: number; countries: number } {
  const running = report.facts.filter((f) => f.phase === "running");
  const kinds = (type: "site" | "country") =>
    new Set(running.map((f) => [report.unit, ...(report.chainBelow.get(f.cohortId) ?? [])].find((u) => u.type === type)?.id).filter(Boolean)).size;
  return { cohorts: running.length, churches: kinds("site"), countries: kinds("country") };
}

// ── dashboard view-model ──────────────────────────────────────────────────
// Plain data for the cards: the domain decides what a number means and how
// it changed; the card just shows a number, its change and
// one line of context.

export interface MetricChange {
  text: string;
  direction: "up" | "down" | "flat";
  /** good = green, bad = red, neutral = grey. */
  tone: "good" | "bad" | "neutral";
}

export interface MetricView {
  key: string;
  label: string;
  value: string;
  change: MetricChange | null;
  context: string;
}

/** A count's change against the start of the period: "▲ 12.4%". None when
 * there was nothing to compare with — the context line says what happened
 * instead (never an ambiguous "new" badge). */
function countChange(now: number, before: number, goodWhen: "up" | "down"): MetricChange | null {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 1000) / 10;
  if (pct === 0) return { text: "±0%", direction: "flat", tone: "neutral" };
  const up = pct > 0;
  return { text: `${up ? "▲" : "▼"} ${Math.abs(pct)}%`, direction: up ? "up" : "down", tone: up === (goodWhen === "up") ? "good" : "bad" };
}

/** The headline cards for an organisational level: how many students it
 * has reached, how many are active now, how many graduated, and who serves
 * them. Operational measures (attendance, delivery, at risk) stay on the
 * cohort dashboard, where the people who act on them work. */
export function levelMetrics(report: UnitReport, periodDays: number, staff: number): MetricView[] {
  const { facts, today } = report;
  const t = sumFacts(facts, today);
  const start = addDaysISO(today, -periodDays);
  const period = PERIODS.find((p) => p.days === periodDays)?.short ?? "";
  const registeredBefore = registeredOn(facts, start);
  const activeBefore = activeOn(facts, start);
  const moved = periodMovement(facts, today, periodDays);
  const footprint = activeFootprint(report);
  return [
    {
      key: "students",
      label: "Total students",
      value: t.registered.toLocaleString(),
      change: countChange(t.registered, registeredBefore, "up"),
      context: registeredBefore ? `${moved.joined} new enrolments ${period}` : `All ${moved.joined} enrolled ${period}`,
    },
    {
      key: "active",
      label: "Active students",
      value: t.active.toLocaleString(),
      change: countChange(t.active, activeBefore, "up"),
      context: `In ${footprint.cohorts} running ${footprint.cohorts === 1 ? "cohort" : "cohorts"}`,
    },
    {
      key: "graduated",
      label: "Graduated",
      value: t.graduated.toLocaleString(),
      // What happened in the period, not a percentage of a small number.
      change: moved.graduated ? { text: `+${moved.graduated}`, direction: "up", tone: "good" } : null,
      context: t.completed
        ? `${moved.graduated} ${period} · of ${t.completed} who finished a cohort`
        : "No cohort has finished yet",
    },
    {
      key: "staff",
      label: "Staff",
      value: staff.toLocaleString(),
      // Appointments aren't dated for cohort staff, so no honest change.
      change: null,
      context: `Leaders and cohort staff, each counted once`,
    },
  ];
}

export interface GrowthSeries {
  id: string;
  name: string;
  /** Per month, oldest first; null = no history yet for this child. */
  active: (number | null)[];
  enrolled: (number | null)[];
}

/** Student numbers over time for each direct child (continents at HQ, …
 * cohorts in a promotion), from dated enrolment history. The window is the
 * last `months` months, or less when the scope's history is shorter. */
export function childGrowth(report: UnitReport, months = 12): { months: { label: string; title: string }[]; series: GrowthSeries[] } {
  const per = report.children.map((c) => ({ id: childId(c), name: childName(c), points: studentHistory(report.factsByChild.get(childId(c)) ?? [], report.today, months) }));
  return growthWindow(per);
}

/** Trims the months before anything in scope had a student, so a short
 * history isn't padded out with empty months. */
export function growthWindow(per: { id: string; name: string; points: HistoryPoint[] }[]) {
  const axis = per[0]?.points.map((p) => p.month) ?? [];
  const firstKnown = axis.findIndex((_, i) => per.some((c) => c.points[i]?.active != null));
  const from = firstKnown < 0 ? axis.length : firstKnown;
  return {
    months: axis.slice(from).map(monthLabels),
    series: per.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.points.slice(from).map((p) => p.active),
      enrolled: c.points.slice(from).map((p) => p.enrolled),
    })),
  };
}

/** Everything a page needs to show the direct children as status cards
 * (the dashboard's children, the children menu): policy, leaders, staff
 * counts, cohort teams, and which cohorts this viewer may open. */
export async function loadChildRows(report: UnitReport, user: AppUser) {
  const cohortChildIds = report.children.flatMap((c) => (c.kind === "cohort" ? [c.cohort.id] : []));
  const [{ bands }, responsibilities, leaders, cohortStaff, staffCounts, cohortTeams] = await Promise.all([
    getPolicy(),
    getResponsibilities(user),
    getUnitLeaderContacts(),
    getCohortStaffContacts(),
    getStaffCounts(),
    getCohortStaff(cohortChildIds),
  ]);
  // Cohort pages are for the people who work in them. (An administrator can
  // still open any cohort from the directory — as recorded support access.)
  const myCohorts = new Set(responsibilities.flatMap((r) => (r.kind === "cohort" ? [r.cohortId] : [])));
  const teams = new Map(
    [...cohortTeams].map(([id, list]) => [
      id,
      { facilitators: list.filter((m) => m.capacity === "facilitator").length, teachers: list.filter((m) => m.capacity === "teacher").length },
    ])
  );
  const rows = childStatusRows(report, bands, {
    leaders,
    cohortStaff,
    staffCounts,
    cohortTeams: teams,
    cohortHref: (id, slug) => (myCohorts.has(id) ? `/c/${slug}` : null),
  }).sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || b.active - a.active);
  return { rows, bands, staffCounts };
}

const STATUS_RANK: Record<UnitStatus, number> = { critical: 3, attention: 2, good: 1, quiet: 0 };

/** Active students per month for the whole level — "are we growing?". */
export function growthPoints(report: UnitReport, months = 12) {
  return monthSeries(report.facts, report.today, months).map((p) => ({ ...monthLabels(p.month), value: p.active }));
}

/** One row of a level's comparison table: a child level, or a cohort. */
export interface ComparisonRow {
  id: string;
  kind: "unit" | "cohort";
  name: string;
  /** Drill-down target; null for a cohort the viewer doesn't work in
   * (they see its summary instead). */
  href: string | null;
  levelLabel: string;
  students: number;
  onTrack: number;
  needsHelp: number;
  atRisk: number;
  /** Attendance over the period (recorded lessons), and the period before. */
  attendance: number | null;
  attendancePrev: number | null;
  /** Curriculum delivered: a cohort's own %, or the running-cohort average. */
  progress: number | null;
  /** Cohorts only: "Lesson 18 / 80". */
  lessonText?: string;
  registerCompletion: number | null;
  registersMissing: number;
  cohortsBehind: number;
  /** Cohorts only: schedule position, and whether it's behind. */
  schedule?: ScheduleState;
  lessonsBehind?: number;
  followUps: number;
  overdue: number;
  issues: number;
  urgent: boolean;
}

export function comparisonRows(
  report: UnitReport,
  periodDays: number,
  cohortHref: (cohortId: string, slug: string) => string | null = (_id, slug) => `/c/${slug}`
): ComparisonRow[] {
  return report.children.map((c) => {
    const facts = report.factsByChild.get(childId(c)) ?? [];
    const t = sumFacts(facts, report.today);
    const p = periodAttendance(facts, report.today, periodDays);
    const issues = facts.flatMap((f) => issuesFor(f, report.today));
    const own = c.kind === "cohort" ? facts[0] : undefined;
    return {
      id: childId(c),
      kind: c.kind,
      name: childName(c),
      href: c.kind === "unit" ? `/u/${c.unit.slug}` : cohortHref(c.cohort.id, c.cohort.slug),
      levelLabel: c.kind === "unit" ? LEVELS[c.unit.type].label : "Cohort",
      students: t.active,
      onTrack: t.onTrack,
      needsHelp: t.needsHelp,
      atRisk: t.atRisk,
      attendance: p.now.rate,
      attendancePrev: p.before.rate,
      progress: own ? own.progressPct : t.avgProgress,
      lessonText: own ? `Lesson ${own.lessonsTaught} / ${own.lessonsTotal}` : undefined,
      registerCompletion: t.registerCompletion,
      registersMissing: t.registersDue - t.registersRecorded,
      cohortsBehind: t.behind,
      schedule: own?.schedule,
      lessonsBehind: own?.lessonsBehind,
      followUps: t.followUpsRequired,
      overdue: t.overdueFollowUps,
      issues: issues.length,
      urgent: issues.some((i) => i.severity === "urgent"),
    };
  });
}

/** One line of a level's exceptions panel, linking straight to the scoped
 * page that lists what's behind the number. */
export interface ExceptionItem {
  key: string;
  count: number;
  text: string;
  /** Optional second line, e.g. "Main cause: Rwanda · Delivery 27%". */
  detail?: string;
  href: string;
  severity: Severity;
}

/** Every cohort inside a level as its own row (a church compares all its
 * cohorts, across promotions). */
export function cohortComparisonRows(
  report: UnitReport,
  periodDays: number,
  cohortHref: (cohortId: string, slug: string) => string | null = (_id, slug) => `/c/${slug}`
): ComparisonRow[] {
  return report.facts.map((f) => {
    const t = sumFacts([f], report.today);
    const p = periodAttendance([f], report.today, periodDays);
    const issues = issuesFor(f, report.today);
    const below = report.pathBelow.get(f.cohortId) ?? [f.name];
    return {
      id: f.cohortId,
      kind: "cohort" as const,
      name: below.length > 1 ? `${below.slice(-2, -1)[0]} · ${f.name}` : f.name,
      href: cohortHref(f.cohortId, f.slug),
      levelLabel: "Cohort",
      students: t.active,
      onTrack: t.onTrack,
      needsHelp: t.needsHelp,
      atRisk: t.atRisk,
      attendance: p.now.rate,
      attendancePrev: p.before.rate,
      progress: f.progressPct,
      lessonText: `Lesson ${f.lessonsTaught} / ${f.lessonsTotal}`,
      registerCompletion: t.registerCompletion,
      registersMissing: t.registersDue - t.registersRecorded,
      cohortsBehind: t.behind,
      schedule: f.schedule,
      lessonsBehind: f.lessonsBehind,
      followUps: t.followUpsRequired,
      overdue: t.overdueFollowUps,
      issues: issues.length,
      urgent: issues.some((i) => i.severity === "urgent"),
    };
  });
}

/** What needs attention inside a level, most urgent first — counts only
 * (no names), so it suits every level including HQ. */
export function levelExceptions(report: UnitReport, slug: string): ExceptionItem[] {
  const t = sumFacts(report.facts, report.today);
  const missing = t.registersDue - t.registersRecorded;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const items: ExceptionItem[] = [
    { key: "atrisk", count: t.atRisk, text: `${plural(t.atRisk, "student")} at risk`, href: `/u/${slug}/attention?kind=atrisk`, severity: "urgent" },
    { key: "overdue", count: t.overdueFollowUps, text: `${plural(t.overdueFollowUps, "follow-up")} overdue`, href: `/u/${slug}/attention?kind=overdue`, severity: "urgent" },
    { key: "contact", count: t.notContacted, text: `${plural(t.notContacted, "struggling student")} not contacted`, href: `/u/${slug}/attention?kind=contact`, severity: "urgent" },
    { key: "behind", count: t.behind, text: `${plural(t.behind, "cohort")} behind schedule`, href: `/u/${slug}/attention?kind=schedule`, severity: t.behind ? "urgent" : "watch" },
    { key: "records", count: missing, text: `${plural(missing, "register")} missing`, href: `/u/${slug}/attention?kind=records`, severity: "watch" },
    { key: "inactive", count: t.inactive, text: `${plural(t.inactive, "student")} inactive`, href: `/u/${slug}/attention?kind=inactive`, severity: "watch" },
  ];
  return items.filter((i) => i.count > 0).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "urgent" ? -1 : 1));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" → { label: "Oct", title: "October 2026" }. */
export function monthLabels(key: string): { label: string; title: string } {
  const m = Number(key.slice(5, 7)) - 1;
  return { label: MONTHS[m], title: `${MONTHS_LONG[m]} ${key.slice(0, 4)}` };
}

/** "the regions", "the churches", ... for whatever sits directly inside. */
export function childPlural(report: UnitReport): string {
  const units = report.children.filter((c) => c.kind === "unit");
  if (!units.length) return "cohorts";
  const counts = new Map<string, number>();
  for (const c of units) if (c.kind === "unit") counts.set(c.unit.type, (counts.get(c.unit.type) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] as keyof typeof LEVELS;
  return LEVELS[top].plural.toLowerCase();
}
