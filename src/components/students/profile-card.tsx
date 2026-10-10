import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill, StatusPill } from "@/components/ui/pill";
import { formatShortDate } from "@/lib/utils";
import { LIFECYCLE_LABELS, type GraduationCheck, type Intervention, type Lifecycle } from "@/lib/domain/student-state";
import type { StudentAggregate } from "@/lib/domain/types";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-ink-tertiary">{label}</div>
      <div className="mt-1 text-[22px] font-bold leading-none text-ink tabular">{value}</div>
    </div>
  );
}

export function ProfileCard({
  student,
  lifecycle,
  intervention,
  graduation,
}: {
  student: StudentAggregate;
  lifecycle: Lifecycle;
  /** Omitted for people without pastoral access. */
  intervention?: Intervention;
  /** Once the cohort has finished: each graduation requirement. */
  graduation?: GraduationCheck | null;
}) {
  const left = lifecycle === "left";
  return (
    <Card className="p-[18px]">
      <div className="flex items-start gap-3.5">
        <Avatar name={student.fullName} size="xl" tinted />
        <div className="flex-1">
          <div className="text-[18px] font-bold text-ink">{student.fullName}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {student.email ?? "No email"} · {student.country ?? "—"}
          </div>
        </div>
      </div>

      {/* Three separate things — never one status that mixes them. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Axis label="Lifecycle">
          <Pill tone={left ? "grey" : lifecycle === "graduated" ? "green" : lifecycle === "completed" ? "teal" : "cyan"}>{LIFECYCLE_LABELS[lifecycle]}</Pill>
        </Axis>
        <Axis label="Performance">
          {left ? (
            <span className="text-[12px] text-ink-faint">—</span>
          ) : student.performance === "Not started" ? (
            <Pill tone="grey">Not started</Pill>
          ) : (
            <StatusPill status={student.performance} />
          )}
        </Axis>
        {intervention && (
          <Axis label="Intervention">
            {intervention.kind === "catch-up" ? (
              <Pill tone={intervention.complete ? "green" : "amber"}>
                {intervention.complete ? "Catch-up done" : `Catch-up ${intervention.recovered}/${intervention.toRecover}`}
              </Pill>
            ) : intervention.kind === "follow-up" ? (
              <Pill tone={intervention.overdue ? "magenta" : "yellow"}>{intervention.overdue ? "Follow-up overdue" : "Follow-up"}</Pill>
            ) : (
              <span className="text-[12px] text-ink-faint">None</span>
            )}
          </Axis>
        )}
      </div>

      {graduation && (
        <div className="mt-3.5 rounded-control border border-border px-3 py-2.5">
          <div className="mb-1.5 text-[11px] font-semibold text-ink-tertiary">Graduation</div>
          <ul className="flex flex-col gap-1 text-[12px] text-ink-secondary">
            <Req ok={graduation.lessonsComplete} text="Every programme lesson delivered" />
            <Req
              ok={graduation.attendanceMet}
              text={`Attendance ${graduation.attendance ?? 0}% — needs ${graduation.threshold}% (lessons owed while enrolled; catch-ups don't change it)`}
            />
            <Req ok={graduation.interventionsResolved} text="No open follow-up or catch-up" />
          </ul>
        </div>
      )}

      {left && (
        <div className="mt-3.5 rounded-control border border-border-soft bg-page px-3 py-2.5 text-xs font-semibold text-ink-tertiary">
          Left {formatShortDate(student.leftAt!.slice(0, 10))}. Their attendance before leaving still counts.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-divider pt-4 sm:grid-cols-4">
        <Stat label="Attendance" value={student.expected ? `${student.rate}%` : "—"} />
        <Stat label="With catch-ups" value={student.expected ? `${student.effectiveRate}%` : "—"} />
        <Stat label="Attended" value={`${student.attended}/${student.expected}`} />
        <Stat label="To make up" value={student.missed} />
      </div>
    </Card>
  );
}

function Req({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-1.5">
      <span className={ok ? "font-bold text-accent-700" : "font-bold text-accent-2-700"}>{ok ? "✓" : "✗"}</span>
      <span>{text}</span>
    </li>
  );
}

function Axis({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-border px-3 py-2.5">
      <div className="mb-1.5 text-[11px] font-semibold text-ink-tertiary">{label}</div>
      {children}
    </div>
  );
}
