"use client";

import { Card } from "@/components/ui/card";
import type { GeneratedEvent } from "@/lib/domain/generator";
import { formatTeachingDays } from "./day-defs";

/** Persistent 300px summary shown beside every step, kept in sync with
 * live state — nothing here is ever written until step 4 is confirmed. */
export function SummaryCard({
  name,
  teachingDays,
  studentsCount,
  events,
}: {
  name: string;
  teachingDays: number[];
  studentsCount: number;
  events: GeneratedEvent[];
}) {
  const lessonsCount = events.filter((e) => e.kind === "lesson").length;
  const crusadesCount = events.filter((e) => e.kind === "crusade").length;
  const daysLabel = formatTeachingDays(teachingDays);

  const rows: [string, React.ReactNode][] = [
    ["Name", name || "—"],
    ["Days", daysLabel || "—"],
    ["Students", studentsCount],
    ["Lessons", lessonsCount],
    ["Crusades", crusadesCount],
  ];

  return (
    <Card className="flex flex-col gap-3.5 p-[18px]">
      <div className="text-[13px] font-bold text-ink">Summary</div>
      <div className="flex flex-col gap-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{label}</span>
            <span className="max-w-[170px] truncate text-right font-semibold text-ink tabular">{value}</span>
          </div>
        ))}
      </div>
      <p className="border-t border-divider pt-3 text-xs text-ink-muted">
        Every lesson is created with an empty register and quiz sheet.
      </p>
    </Card>
  );
}
