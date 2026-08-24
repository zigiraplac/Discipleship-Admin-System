"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, Check } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProgressBar, toneForRate } from "@/components/ui/progress-bar";
import { useToast } from "@/components/ui/toast";
import { saveRegister } from "@/lib/actions/register";
import { cn } from "@/lib/utils";

export interface RegisterRosterEntry {
  id: string;
  fullName: string;
  /** This student's rate/attended/expected among already-recorded lessons. */
  rate: number;
  attended: number;
  expected: number;
}

export interface RegisterFormProps {
  cohortId: string;
  eventId: string;
  lessonTitle: string;
  lessonRef: string;
  dateLong: string;
  hasQuiz: boolean;
  roster: RegisterRosterEntry[];
  initialAttendance: Record<string, "present" | "absent">;
  initialQuiz: Record<string, number>;
  recorded: boolean;
  isFuture: boolean;
  /** True when the signed-in user may tap tiles, enter scores, and save. */
  editable: boolean;
  enrolled: number;
  /** Cohort-wide totals excluding this lesson's own register, used to
   * project "cohort after saving" from the live draft. */
  recordedCountExcludingThis: number;
  totalPresentExcludingThis: number;
  activeThreshold: number;
  helpThreshold: number;
}

export function RegisterForm({
  cohortId,
  eventId,
  lessonTitle,
  lessonRef,
  dateLong,
  hasQuiz,
  roster,
  initialAttendance,
  initialQuiz,
  recorded,
  isFuture,
  editable,
  enrolled,
  recordedCountExcludingThis,
  totalPresentExcludingThis,
  activeThreshold,
  helpThreshold,
}: RegisterFormProps) {
  const router = useRouter();
  const { show } = useToast();

  const [attendance, setAttendance] = useState<Record<string, "present" | "absent">>(initialAttendance);
  const [quiz, setQuiz] = useState<Record<string, number>>(initialQuiz);
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPresent = (id: string) => (attendance[id] ?? "present") === "present";

  function toggle(id: string) {
    if (!editable) return;
    const next: "present" | "absent" = isPresent(id) ? "absent" : "present";
    setAttendance((prev) => ({ ...prev, [id]: next }));
    if (next === "absent") {
      setQuiz((prev) => {
        if (!(id in prev)) return prev;
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
    }
  }

  function setScore(id: string, raw: string) {
    if (!editable) return;
    if (raw === "") {
      setQuiz((prev) => {
        if (!(id in prev)) return prev;
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    setQuiz((prev) => ({ ...prev, [id]: Math.max(0, Math.min(100, Math.round(n))) }));
  }

  const allPresentEnabled = editable && !recorded;
  function resetAllPresent() {
    if (!allPresentEnabled) return;
    setAttendance({});
  }

  const filteredRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [roster, query]);

  const presentCount = roster.filter((r) => isPresent(r.id)).length;
  const absentCount = enrolled - presentCount;

  const thisLessonPct = isFuture ? null : enrolled ? Math.round((presentCount / enrolled) * 100) : null;

  const recordedCountAfter = recordedCountExcludingThis + 1;
  const projectedPct = isFuture
    ? null
    : enrolled && recordedCountAfter
      ? Math.round(((totalPresentExcludingThis + presentCount) / (enrolled * recordedCountAfter)) * 100)
      : 0;

  const quizAvgDraft = useMemo(() => {
    if (isFuture || !hasQuiz) return null;
    const scores = roster
      .filter((r) => isPresent(r.id))
      .map((r) => quiz[r.id])
      .filter((v): v is number => typeof v === "number");
    if (!scores.length) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFuture, hasQuiz, roster, quiz, attendance]);

  let buttonLabel: string;
  if (isFuture) buttonLabel = "Not taught yet";
  else if (!editable) buttonLabel = recorded ? "Register saved" : "View only";
  else if (isSaving) buttonLabel = "Saving…";
  else if (recorded) buttonLabel = "Save correction";
  else buttonLabel = "Save register";
  const buttonDisabled = isFuture || !editable || isSaving;

  async function handleSave() {
    if (buttonDisabled) return;
    setError(null);
    setIsSaving(true);
    const fullAttendance: Record<string, "present" | "absent"> = {};
    for (const r of roster) fullAttendance[r.id] = isPresent(r.id) ? "present" : "absent";
    const fullQuiz: Record<string, number> = {};
    if (hasQuiz) {
      for (const [id, score] of Object.entries(quiz)) {
        if (fullAttendance[id] === "present") fullQuiz[id] = score;
      }
    }
    try {
      await saveRegister({ cohortId, eventId, attendance: fullAttendance, quiz: fullQuiz });
      show(
        `${lessonRef} saved · ${presentCount} present, ${absentCount} absent. Cohort attendance is now ${
          projectedPct ?? 0
        }%.`
      );
      router.push(`/c/${cohortId}/lessons`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the register.");
      setIsSaving(false);
    }
  }

  const thisLessonTone =
    thisLessonPct !== null ? toneForRate(thisLessonPct, activeThreshold, helpThreshold) : "grey";

  return (
    <div className="grid items-start gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) 290px" }}>
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink">{lessonTitle}</div>
            <div className="mt-0.5 text-xs text-ink-muted">
              {lessonRef} · {dateLong}
            </div>
          </div>
          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a name"
              className="w-[180px] pl-8"
            />
          </div>
          <Button
            type="button"
            variant="outlineAccent"
            size="row"
            disabled={!allPresentEnabled}
            onClick={resetAllPresent}
          >
            All present
          </Button>
        </div>

        <div className="p-[18px]">
          <div className="mb-3 text-xs text-ink-muted">Tap a name to mark absent.</div>
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${hasQuiz ? 238 : 190}px, 1fr))` }}
          >
            {filteredRoster.map((entry) => (
              <StudentTile
                key={entry.id}
                entry={entry}
                present={isPresent(entry.id)}
                score={quiz[entry.id]}
                hasQuiz={hasQuiz}
                editable={editable}
                onToggle={() => toggle(entry.id)}
                onScoreChange={(v) => setScore(entry.id, v)}
              />
            ))}
            {filteredRoster.length === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-ink-faint">
                No students match &ldquo;{query}&rdquo;.
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="sticky top-[84px] flex flex-col gap-3.5">
        <Card className="p-[18px]">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[10px] bg-accent-100 p-3">
              <div className="text-[22px] font-bold leading-none text-accent-800 tabular">
                {isFuture ? "—" : presentCount}
              </div>
              <div className="mt-1 text-xs font-semibold text-accent-800">Present</div>
            </div>
            <div className="rounded-[10px] bg-accent-2-100 p-3">
              <div className="text-[22px] font-bold leading-none text-accent-2-700 tabular">
                {isFuture ? "—" : absentCount}
              </div>
              <div className="mt-1 text-xs font-semibold text-accent-2-700">Absent</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-tertiary">
              <span>This lesson</span>
              <span className="tabular font-semibold text-ink">
                {thisLessonPct !== null ? `${thisLessonPct}%` : "—"}
              </span>
            </div>
            <ProgressBar pct={thisLessonPct} tone={thisLessonTone} height={7} className="mt-1.5" />
          </div>

          <div className="mt-3.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-tertiary">
              {editable ? "Cohort after saving" : "Cohort attendance"}
            </span>
            <span className="tabular font-semibold text-ink">
              {projectedPct !== null ? `${projectedPct}%` : "—"}
            </span>
          </div>

          {hasQuiz && (
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink-tertiary">Quiz average</span>
              <span className="tabular font-semibold text-ink">{quizAvgDraft ?? "—"}</span>
            </div>
          )}

          {error && <div className="mt-3 text-xs font-medium text-accent-2-700">{error}</div>}

          <Button
            type="button"
            variant={buttonDisabled ? "inert" : "primary"}
            disabled={buttonDisabled}
            onClick={handleSave}
            className="mt-4 w-full"
          >
            {buttonLabel}
          </Button>
        </Card>
        <div className="px-1 text-xs text-ink-muted">
          Every lesson is created with an empty register and quiz sheet.
        </div>
      </div>
    </div>
  );
}

function StudentTile({
  entry,
  present,
  score,
  hasQuiz,
  editable,
  onToggle,
  onScoreChange,
}: {
  entry: RegisterRosterEntry;
  present: boolean;
  score: number | undefined;
  hasQuiz: boolean;
  editable: boolean;
  onToggle: () => void;
  onScoreChange: (value: string) => void;
}) {
  return (
    <div
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? onToggle : undefined}
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] border p-2.5",
        editable && "cursor-pointer",
        present ? "border-border-soft bg-subtle" : "border-accent-2-200 bg-accent-2-100"
      )}
    >
      <span
        className={cn(
          "flex size-[18px] flex-none items-center justify-center rounded-[5px] border",
          present ? "border-accent bg-accent text-white" : "border-accent-2-400 bg-card"
        )}
      >
        {present && <Check size={12} weight="bold" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{entry.fullName}</span>
        <span className="block text-[11px] text-ink-muted">
          {present ? `${entry.rate}% · ${entry.attended}/${entry.expected}` : "Absent"}
        </span>
      </span>
      {hasQuiz && (
        <input
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          disabled={!editable || !present}
          value={score ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onScoreChange(e.target.value)}
          className="h-[34px] w-[54px] flex-none rounded-[7px] border border-border bg-card px-1.5 text-center text-[13px] text-ink tabular focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:bg-page disabled:text-ink-faint"
        />
      )}
    </div>
  );
}
