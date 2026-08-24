import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { OUTCOME_NARRATIVE } from "@/components/outcome/outcome-modal";
import { toneForStatus } from "@/components/ui/pill";
import { formatShortDate, todayISO } from "@/lib/utils";
import type { Bands, Outcome, StudentAggregate } from "@/lib/domain/types";

interface Entry {
  tone: "cyan" | "yellow" | "magenta" | "grey";
  title: string;
  date: string;
  text: string;
}

const DOT_CLASSES: Record<Entry["tone"], string> = {
  cyan: "bg-accent",
  yellow: "bg-yellow",
  magenta: "bg-accent-2-500",
  grey: "bg-neutral-border",
};

export function HistoryCard({
  student,
  latestOutcome,
  bands,
  cohortName,
  city,
}: {
  student: StudentAggregate;
  latestOutcome: Outcome | null;
  bands: Bands;
  cohortName: string;
  city: string | null;
}) {
  const entries: Entry[] = [];

  if (latestOutcome) {
    const narrative = OUTCOME_NARRATIVE[latestOutcome.kind];
    entries.push({
      tone: "cyan",
      title: narrative.title,
      date: formatShortDate(latestOutcome.recordedAt.slice(0, 10)),
      text: narrative.text(student.missed),
    });
  }

  if (student.status !== "On track") {
    entries.push({
      tone: toneForStatus(student.status) as "yellow" | "magenta",
      title: `Flagged ${student.status.toLowerCase()}`,
      date: formatShortDate(todayISO()),
      text: `Attendance fell below ${bands.activeThreshold}%.`,
    });
  }

  entries.push({
    tone: "grey",
    title: "Enrolled",
    date: formatShortDate(student.enrolledAt.slice(0, 10)),
    text: [cohortName, city].filter(Boolean).join(" · "),
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>History</CardTitle>
          <CardSubtitle>Newest first</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-4 px-[18px] py-4">
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-2.5">
            <span className={`mt-1.5 size-2 flex-none rounded-full ${DOT_CLASSES[entry.tone]}`} />
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-ink">{entry.title}</span>
                <span className="text-[11px] text-ink-muted">{entry.date}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">{entry.text}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
