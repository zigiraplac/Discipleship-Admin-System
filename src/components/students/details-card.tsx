import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayMonth } from "@/components/students/format-day-month";
import type { Student } from "@/lib/domain/types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-xs font-semibold text-ink-tertiary">{label}</span>
      <span className="text-right text-[13px] text-ink">{value}</span>
    </div>
  );
}

export function DetailsCard({
  student,
  cohortName,
  facilitatorName,
}: {
  student: Student;
  cohortName: string;
  facilitatorName: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <div className="divide-y divide-divider px-[18px] py-1">
        <Row label="Email" value={student.email ?? "—"} />
        <Row label="Country" value={student.country ?? "—"} />
        <Row label="Birthday" value={formatDayMonth(student.dobDay, student.dobMonth)} />
        <Row label="Cohort" value={cohortName} />
        <Row label="Facilitator" value={facilitatorName ?? "—"} />
      </div>
    </Card>
  );
}
