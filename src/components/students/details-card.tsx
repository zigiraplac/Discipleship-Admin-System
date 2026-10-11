import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { formatShortDate } from "@/lib/utils";
import { formatDayMonth } from "@/components/students/format-day-month";
import { EditStudentDialog } from "@/components/students/edit-student-dialog";
import type { Student } from "@/lib/domain/types";

const ENROLMENT_LABEL = { joined: "Joined", left: "Left", returned: "Came back" } as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-xs font-semibold text-ink-tertiary">{label}</span>
      <span className="text-right text-[13px] text-ink">{value}</span>
    </div>
  );
}

export function DetailsCard({
  cohortId,
  student,
  cohortName,
  facilitatorName,
  canEdit,
}: {
  cohortId: string;
  student: Student;
  cohortName: string;
  facilitatorName: string | null;
  canEdit: boolean;
}) {
  return (
    <Card>
      {/* pr-14: room for the drawer's close button in the corner. */}
      <div className="flex items-center gap-3 border-b border-divider py-4 pr-14 pl-[18px]">
        <Avatar name={student.fullName} size="xl" tinted />
        <div className="min-w-0 flex-1 truncate text-[18px] font-bold text-ink">{student.fullName}</div>
        {canEdit && <EditStudentDialog cohortId={cohortId} student={student} />}
      </div>
      <div className="divide-y divide-divider px-[18px] py-1">
        <Row label="Email" value={student.email ?? "—"} />
        <Row label="WhatsApp" value={student.whatsapp ?? "—"} />
        <Row label="Country" value={student.country ?? "—"} />
        <Row label="Birthday" value={formatDayMonth(student.dobDay, student.dobMonth)} />
        <Row label="Cohort" value={cohortName} />
        <Row label="Facilitator" value={facilitatorName ?? "Unassigned"} />
        {/* Joined, then any time they left or came back. */}
        {enrolmentChanges(student).map((c, i) => (
          <Row key={`${c.kind}-${c.on}-${i}`} label={ENROLMENT_LABEL[c.kind]} value={formatShortDate(c.on)} />
        ))}
      </div>
    </Card>
  );
}

function enrolmentChanges(student: Student): { kind: keyof typeof ENROLMENT_LABEL; on: string }[] {
  if (student.enrolment?.length) return student.enrolment;
  return [
    { kind: "joined", on: student.enrolledAt.slice(0, 10) },
    ...(student.leftAt ? [{ kind: "left" as const, on: student.leftAt.slice(0, 10) }] : []),
  ];
}
