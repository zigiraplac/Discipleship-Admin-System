"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, X } from "@phosphor-icons/react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Pill } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { loadOverview, type OverviewData, type OverviewRef } from "@/lib/actions/org";
import { formatShortDate } from "@/lib/utils";
import { GrowthChart } from "./growth-chart";
import { UnitStatusBadge } from "./status-ui";
import { StatusSplit, StatusLegend } from "./status-split";
import { scheduleText } from "./schedule-text";

const PanelContext = createContext<((ref: OverviewRef) => void) | null>(null);

/** Opens the overview side panel for a child of the current level. The
 * parent never navigates into a child — it sees its overview here. */
export function useOverviewPanel(): (ref: OverviewRef) => void {
  const open = useContext(PanelContext);
  if (!open) throw new Error("useOverviewPanel must be used within <OverviewPanelProvider>");
  return open;
}

export function OverviewPanelProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const show = useCallback(
    (ref: OverviewRef) => {
      setOpen(true);
      setData(null);
      setError(null);
      startTransition(async () => {
        try {
          setData(await loadOverview(ref, params.get("period") ?? "90"));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't load this overview.");
        }
      });
    },
    [params]
  );

  return (
    <PanelContext.Provider value={show}>
      {children}
      <BaseDialog.Root open={open} onOpenChange={setOpen}>
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="fixed inset-0 z-[80] bg-[rgba(20,25,32,0.42)] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <BaseDialog.Popup className="fixed inset-y-0 right-0 z-[81] flex w-[min(440px,100vw)] flex-col border-l border-border bg-card shadow-modal outline-none transition-transform duration-200 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
            <div className="flex items-start gap-3 border-b border-divider px-5 pb-3.5 pt-[18px]">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-accent-700">
                  {data ? (data.kind === "unit" ? data.levelLabel : "Cohort") : "Overview"}
                </div>
                <BaseDialog.Title className="mt-0.5 truncate text-[17px] font-bold text-ink">
                  {data?.name ?? (error ? "Not available" : "Loading…")}
                </BaseDialog.Title>
                {data && (
                  <BaseDialog.Description className="mt-0.5 text-xs text-ink-muted">
                    {data.kind === "unit"
                      ? data.leaders.length
                        ? `Led by ${data.leaders.map((l) => l.name).join(", ")}`
                        : `Leader not assigned${data.managedBy ? ` · managed by ${data.managedBy}` : ""}`
                      : data.facilitators.length
                        ? `Facilitator: ${data.facilitators.join(", ")}`
                        : "No facilitator yet"}
                    {data.context ? ` · ${data.context}` : ""}
                  </BaseDialog.Description>
                )}
              </div>
              <BaseDialog.Close
                aria-label="Close overview"
                className="grid size-8 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:bg-hover"
              >
                <X size={15} />
              </BaseDialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error ? (
                <p className="text-[13px] text-accent-2-700">{error}</p>
              ) : !data || pending ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : data.kind === "unit" ? (
                <UnitOverview data={data} />
              ) : (
                <CohortOverview data={data} />
              )}
            </div>
            {data && !error && data.href && (
              <div className="border-t border-divider px-5 py-3">
                <Link
                  href={data.href}
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-control bg-accent px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-600"
                >
                  Open {data.name}
                  <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </PanelContext.Provider>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-control border border-border px-3 py-2.5">
      <div className="text-[11px] font-semibold text-ink-tertiary">{label}</div>
      <div className="mt-1 text-[19px] font-bold leading-none text-ink tabular">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

function UnitOverview({ data }: { data: Extract<OverviewData, { kind: "unit" }> }) {
  const t = data.totals;
  return (
    <div className="flex flex-col gap-5">
      {/* Status and why — the parent's whole question about a child. */}
      <Section title="Status">
        <UnitStatusBadge status={data.status.status} label={data.status.text} />
        {data.status.reasons.length ? (
          <ul className="flex flex-col gap-1">
            {data.status.reasons.map((r) => (
              <li key={r} className={data.status.status === "critical" ? "text-[13px] text-accent-2-700" : "text-[13px] text-yellow-ink"}>
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-muted">Nothing needs attention.</p>
        )}
      </Section>

      <Section title="Responsible">
        {data.leaders.length ? (
          data.leaders.map((l) => (
            <a key={l.email} href={`mailto:${l.email}`} className="text-[13px] font-semibold text-accent-700 hover:underline">
              {l.name} · {l.email}
            </a>
          ))
        ) : (
          <p className="text-[13px] text-ink-muted">Not assigned{data.managedBy ? ` · managed by ${data.managedBy}` : ""}</p>
        )}
      </Section>

      <div className="grid grid-cols-3 gap-2">
        <Mini label="Students" value={t.registered} />
        <Mini label="Active" value={t.active} />
        <Mini label="Graduated" value={t.graduated} />
        <Mini label="Staff" value={data.staff} />
        <Mini label={data.childrenLabel} value={data.children.length} />
        <Mini label="New enrolments" value={data.movement.joined} />
      </div>

      <Section title="Active students over time">
        <GrowthChart points={data.series} height={90} />
      </Section>

      {data.children.length > 0 && (
        <Section title={`${data.childrenLabel} · ${data.children.length}`}>
          <ChildList items={data.children} label={data.childrenLabel} />
        </Section>
      )}
    </div>
  );
}

const CHILD_TONE = { good: "green", attention: "yellow", critical: "magenta", quiet: "grey" } as const;

/** What's directly inside the child — status in words and scale only —
 * in a scrolling table that stays compact however many there are, with a
 * search once the list is long. */
function ChildList({ items, label }: { items: Extract<OverviewData, { kind: "unit" }>["children"]; label: string }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((c) => c.name.toLowerCase().includes(q)) : items;
  return (
    <div className="flex flex-col gap-2">
      {items.length > 8 && <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find in ${label.toLowerCase()}`} />}
      <div className="max-h-[320px] overflow-y-auto rounded-control border border-border">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-[1] bg-subtle">
            <tr className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Students</th>
              <th className="px-3 py-2 text-right">Active</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-t border-divider">
                <td className="max-w-[140px] truncate px-3 py-2 font-semibold text-ink" title={c.name}>
                  {c.name}
                </td>
                <td className="px-3 py-2">
                  <Pill tone={CHILD_TONE[c.status]}>{c.statusText}</Pill>
                </td>
                <td className="px-3 py-2 text-right tabular text-ink">{c.students.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular text-ink-secondary">{c.active.toLocaleString()}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-ink-faint">
                  No match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CohortOverview({ data }: { data: Extract<OverviewData, { kind: "cohort" }> }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <Mini label={data.phase === "finished" ? "Completed" : "Active"} value={data.phase === "finished" ? data.completed : data.active} />
        <Mini label="Attendance" value={data.attendanceRate != null ? `${data.attendanceRate}%` : "—"} />
        <Mini label="Inactive" value={data.inactive} />
      </div>

      <Section title="Progress">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-ink tabular">
            {data.lessonsTaught} of {data.lessonsTotal} lessons taught
          </span>
          <Pill tone={data.schedule === "behind" ? "yellow" : data.schedule === "finished" || data.schedule === "upcoming" ? "grey" : "cyan"}>
            {scheduleText(data)}
          </Pill>
        </div>
        <ProgressBar pct={data.progressPct} height={8} />
        <div className="grid grid-cols-2 gap-2 text-[12px] text-ink-tertiary">
          <div>
            Planned end
            <div className="font-semibold text-ink">{data.plannedEnd ? formatShortDate(data.plannedEnd) : "—"}</div>
          </div>
          <div>
            Now ends
            <div className="font-semibold text-ink">{data.currentEnd ? formatShortDate(data.currentEnd) : "—"}</div>
          </div>
        </div>
      </Section>

      {data.active > 0 && (
        <Section title="How the class is doing">
          <StatusLegend onTrack={data.onTrack} needsHelp={data.needsHelp} atRisk={data.atRisk} />
          <StatusSplit onTrack={data.onTrack} needsHelp={data.needsHelp} atRisk={data.atRisk} />
        </Section>
      )}

      {data.issues.length > 0 && (
        <Section title="Needs attention">
          <ul className="flex flex-col gap-2">
            {data.issues.map((i) => (
              <li key={i.text} className="flex items-start gap-2.5 text-[13px] text-ink">
                <Pill tone={i.severity === "urgent" ? "magenta" : "yellow"}>{i.severity === "urgent" ? "Urgent" : "Watch"}</Pill>
                <span className="min-w-0 flex-1 pt-px">{i.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** A plain text/row element that opens a child's overview when clicked. */
export function OpenOverview({
  kind,
  id,
  className,
  children,
  label,
}: {
  kind: "unit" | "cohort";
  id: string;
  className?: string;
  children: React.ReactNode;
  label?: string;
}) {
  const open = useOverviewPanel();
  return (
    <button type="button" onClick={() => open({ kind, id })} className={className} aria-label={label}>
      {children}
    </button>
  );
}

/**
 * Makes a whole card open a child's overview: an invisible button
 * stretched over the card (so links inside it — an email, "Manage" —
 * still work, sitting above it with `relative z-10`). Put it first inside
 * a `group relative` card.
 */
export function OverviewHitArea({ kind, id, name }: { kind: "unit" | "cohort"; id: string; name: string }) {
  const open = useOverviewPanel();
  return (
    <button
      type="button"
      onClick={() => open({ kind, id })}
      aria-label={`View ${name} overview`}
      className="absolute inset-0 z-0 rounded-card outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
    />
  );
}
