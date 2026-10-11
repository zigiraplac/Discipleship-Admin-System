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
import { cn, formatShortDate } from "@/lib/utils";
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

/** Loads a child's overview (summary data via a server action) for the
 * chosen period. Shared by the pop-out panel and the in-table drawer. */
export function useOverviewLoader() {
  const params = useSearchParams();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    (ref: OverviewRef) => {
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

  return { data, error, pending, load };
}

/** A child's overview: header (name, who leads it), its figures, and a
 * button to open it when the viewer may. `close` is the close control. */
export function OverviewContent({
  data,
  error,
  pending,
  close,
  onOpenLink,
}: {
  data: OverviewData | null;
  error: string | null;
  pending: boolean;
  close: React.ReactNode;
  onOpenLink?: () => void;
}) {
  return (
    <>
      <div className="flex items-start gap-3 border-b border-divider px-5 pb-3.5 pt-[18px]">
        <div className="min-w-0 flex-1">
          {/* A level is named by itself; a cohort is labelled (its name is in its card). */}
          {data?.kind !== "unit" && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-accent-700">{data ? "Cohort" : "Overview"}</div>
          )}
          {/* A cohort's name and people are in its information card below. */}
          {data?.kind !== "cohort" && (
            <h2 className="mt-0.5 truncate text-[17px] font-bold text-ink">{data?.name ?? (error ? "Not available" : "Loading…")}</h2>
          )}
          {data?.kind === "unit" && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {data.leaders.length
                ? `Led by ${data.leaders.map((l) => l.name).join(", ")}`
                : `Leader not assigned${data.managedBy ? ` · managed by ${data.managedBy}` : ""}`}
              {data.context ? ` · ${data.context}` : ""}
            </p>
          )}
        </div>
        {close}
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
            onClick={onOpenLink}
            className="flex w-full items-center justify-center gap-1.5 rounded-control bg-accent px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-600"
          >
            Open {data.name}
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </>
  );
}

export function OverviewPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data, error, pending, load } = useOverviewLoader();

  const show = useCallback(
    (ref: OverviewRef) => {
      setOpen(true);
      load(ref);
    },
    [load]
  );

  return (
    <PanelContext.Provider value={show}>
      {children}
      <BaseDialog.Root open={open} onOpenChange={setOpen}>
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="fixed inset-0 z-[80] bg-[rgba(20,25,32,0.42)] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <BaseDialog.Popup
            aria-label={data?.name ?? "Overview"}
            className="fixed inset-y-0 right-0 z-[81] flex w-[min(440px,100vw)] flex-col border-l border-border bg-card shadow-modal outline-none transition-transform duration-200 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full"
          >
            <OverviewContent
              data={data}
              error={error}
              pending={pending}
              onOpenLink={() => setOpen(false)}
              close={
                <BaseDialog.Close
                  aria-label="Close overview"
                  className="grid size-8 flex-none place-items-center rounded-control border border-border bg-card text-ink-secondary hover:bg-hover"
                >
                  <X size={15} />
                </BaseDialog.Close>
              }
            />
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
      <div className="grid grid-cols-2 gap-2">
        <Mini
          label={data.childrenLabel}
          value={data.worldTotal ? `${data.childrenWithBcc} / ${data.worldTotal}` : data.children.filter((c) => !c.notSetUp).length}
        />
        <Mini label="Students" value={t.registered.toLocaleString()} />
        <Mini label="Graduated" value={t.graduated.toLocaleString()} />
        <Mini label="Staff" value={data.staff} />
      </div>

      {data.children.length > 0 && (
        <Section title={`${data.childrenLabel} · ${data.children.length}`}>
          <ChildList items={data.children} label={data.childrenLabel} />
        </Section>
      )}
    </div>
  );
}

/** What's directly inside, in numbers — students, sites, active
 * promotions and staff — in a scrolling
 * table that stays compact however many there are, with a search once the
 * list is long. */
function ChildList({ items, label }: { items: Extract<OverviewData, { kind: "unit" }>["children"]; label: string }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((c) => c.name.toLowerCase().includes(q)) : items;
  return (
    <div className="flex flex-col gap-2">
      {items.length > 8 && <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find in ${label.toLowerCase()}`} />}
      <div className="max-h-[420px] overflow-auto rounded-control border border-border">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-[1] bg-subtle">
            <tr className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-right">Students</th>
              <th className="px-3 py-2 text-right">Sites</th>
              <th className="px-3 py-2 text-right" title="Promotions with a running cohort">Active promotions</th>
              <th className="px-3 py-2 text-right">Staff</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className={cn("border-t border-divider", c.notSetUp && "text-ink-faint opacity-60")} title={c.notSetUp ? "Not set up yet" : undefined}>
                <td className="max-w-[160px] truncate px-3 py-2 font-semibold text-ink" title={c.name}>
                  {c.name}
                </td>
                <td className="px-3 py-2 text-right tabular text-ink">{c.students.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular text-ink-secondary">{c.churches}</td>
                <td className="px-3 py-2 text-right tabular text-ink-secondary">{c.activePromotions}</td>
                <td className="px-3 py-2 text-right tabular text-ink-secondary">{c.staff}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-ink-faint">
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue, Thu · 2 lessons a session · every week". */
function scheduleSummary(days: number[], perSession: number, weeks: number): string {
  const when = [...days].sort((x, y) => x - y).map((d) => DAY_NAMES[d]).join(", ") || "No days set";
  const pace = `${perSession} ${perSession === 1 ? "lesson" : "lessons"} a session`;
  const every = weeks === 1 ? "every week" : `every ${weeks} weeks`;
  return `${when} · ${pace} · ${every}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="flex-none text-xs font-semibold text-ink-tertiary">{label}</span>
      <span className="min-w-0 text-right text-[13px] text-ink">{value}</span>
    </div>
  );
}

/** Like a student's drawer: the cohort's own information first, then how
 * it's going — each fact shown once. */
function CohortOverview({ data }: { data: Extract<OverviewData, { kind: "cohort" }> }) {
  const ended = data.currentEnd && data.plannedEnd && data.currentEnd !== data.plannedEnd;
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-card border border-border">
        <div className="border-b border-divider px-4 py-3 text-[17px] font-bold text-ink">{data.name}</div>
        <div className="divide-y divide-divider px-4 py-1">
          <InfoRow label="Facilitator" value={data.facilitators.join(", ") || "Not assigned"} />
          {data.teachers.length > 0 && <InfoRow label={data.teachers.length === 1 ? "Teacher" : "Teachers"} value={data.teachers.join(", ")} />}
          <InfoRow label="Part of" value={data.context || "—"} />
          {data.city && <InfoRow label="City" value={data.city} />}
          <InfoRow label="Created" value={formatShortDate(data.createdAt.slice(0, 10))} />
          <InfoRow label={data.phase === "upcoming" ? "Starts" : "Started"} value={data.startsOn ? formatShortDate(data.startsOn) : "—"} />
          <InfoRow label="Schedule" value={scheduleSummary(data.teachingDays, data.lessonsPerSession, data.intervalWeeks)} />
          <InfoRow
            label={data.phase === "finished" ? "Ended" : "Ends"}
            value={
              data.phase === "finished" && data.finishedOn
                ? formatShortDate(data.finishedOn)
                : data.currentEnd
                  ? `${formatShortDate(data.currentEnd)}${ended ? ` (planned ${formatShortDate(data.plannedEnd!)})` : ""}`
                  : "—"
            }
          />
          <InfoRow
            label="Students"
            value={`${data.registered.toLocaleString()}${data.phase === "finished" ? ` · ${data.completed} completed` : ""}`}
          />
        </div>
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
      </Section>

      {data.active > 0 && (
        <Section title={`How the class is doing${data.attendanceRate != null ? ` (${data.attendanceRate}% attendance)` : ""}`}>
          <div className="text-[12px] text-ink-muted">
            {data.active} active{data.inactive > 0 ? ` · ${data.inactive} inactive` : ""}
          </div>
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
