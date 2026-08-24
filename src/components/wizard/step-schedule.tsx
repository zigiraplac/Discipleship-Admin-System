"use client";

import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatGrid } from "@/components/ui/stat-card";
import { formatShortDate } from "@/lib/utils";
import { CURRICULUM } from "@/lib/domain/curriculum";
import type {
  GeneratedEvent,
  GeneratedLessonEvent,
  GeneratedCrusadeEvent,
} from "@/lib/domain/generator";
import { StepCard } from "./step-card";
import { Tile } from "./stat-tile";

function isLesson(e: GeneratedEvent): e is GeneratedLessonEvent {
  return e.kind === "lesson";
}
function isCrusade(e: GeneratedEvent): e is GeneratedCrusadeEvent {
  return e.kind === "crusade";
}

/**
 * Step 3 — Schedule: purely derived from step 1's inputs via `buildEvents`
 * (computed once in the parent and passed down) — nothing editable here.
 */
export function StepSchedule({
  events,
  enrolledCount,
  onBack,
  onContinue,
}: {
  events: GeneratedEvent[];
  enrolledCount: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const lessonEvents = events.filter(isLesson);
  const crusadeEvents = events.filter(isCrusade);
  const core = lessonEvents.length + crusadeEvents.length;

  const rows = CURRICULUM.map((cls) => {
    const inClass = lessonEvents.filter((e) => e.classNumber === cls.n);
    const crusadeFriday = crusadeEvents.find((e) => e.afterClass === cls.n && e.crusadeDay === 0);
    return {
      cls,
      count: inClass.length,
      starts: inClass[0]?.date ?? null,
      ends: inClass[inClass.length - 1]?.date ?? null,
      crusade: crusadeFriday?.date ?? null,
    };
  });

  return (
    <StepCard step={3} onBack={onBack} onContinue={onContinue}>
      <StatGrid>
        <Tile label="Lesson events" value={lessonEvents.length} />
        <Tile label="Crusade days" value={crusadeEvents.length} />
        <Tile label="Core events" value={core} />
        <Tile label="With birthdays" value={core + enrolledCount} tone="cyan" />
      </StatGrid>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">Class schedule</h3>
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TH>Class</TH>
              <TH align="right">Lessons</TH>
              <TH align="right">Starts</TH>
              <TH align="right">Ends</TH>
              <TH align="right">Crusade</TH>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.cls.n}>
                  <TD>
                    <div className="text-[13px] font-semibold text-ink">{r.cls.title}</div>
                    <div className="text-[11px] text-ink-muted">{r.cls.parts}</div>
                  </TD>
                  <TD align="right" className="tabular">
                    {r.count}
                  </TD>
                  <TD align="right" className="tabular">
                    {r.starts ? formatShortDate(r.starts) : "—"}
                  </TD>
                  <TD align="right" className="tabular">
                    {r.ends ? formatShortDate(r.ends) : "—"}
                  </TD>
                  <TD align="right" className="tabular font-semibold text-accent-2-700">
                    {r.crusade ? formatShortDate(r.crusade) : "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </StepCard>
  );
}
