import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill, StatusPill } from "@/components/ui/pill";
import { formatShortDate } from "@/lib/utils";
import type { StudentAggregate } from "@/lib/domain/types";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-ink-tertiary">{label}</div>
      <div className="mt-1 text-[22px] font-bold leading-none text-ink tabular">{value}</div>
    </div>
  );
}

export function ProfileCard({ student }: { student: StudentAggregate }) {
  const left = student.leftAt != null;
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
        {left ? <Pill tone="grey">Left</Pill> : <StatusPill status={student.status} />}
      </div>

      {left && (
        <div className="mt-3.5 rounded-control border border-border-soft bg-page px-3 py-2.5 text-xs font-semibold text-ink-tertiary">
          No longer part of the cohort — left {formatShortDate(student.leftAt!.slice(0, 10))}.
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-divider pt-4">
        <Stat label="Attendance" value={`${student.rate}%`} />
        <Stat label="Attended" value={`${student.attended}/${student.expected}`} />
        <Stat label="To make up" value={student.missed} />
      </div>
    </Card>
  );
}
