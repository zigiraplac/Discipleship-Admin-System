"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildEvents } from "@/lib/domain/generator";
import { createCohort, getRegistrationPreview } from "@/lib/actions/cohorts";
import type { DedupeResult } from "@/lib/domain/registrations";
import { useToast } from "@/components/ui/toast";
import { todayISO } from "@/lib/utils";
import { Stepper, type WizardStepDef } from "./stepper";
import { SummaryCard } from "./summary-card";
import { StepCohort } from "./step-cohort";
import { StepStudents } from "./step-students";
import { StepSchedule } from "./step-schedule";
import { StepReview } from "./step-review";

const STEPS: WizardStepDef[] = [
  { n: 1, label: "Cohort", hint: "Name and days" },
  { n: 2, label: "Students", hint: "From registrations" },
  { n: 3, label: "Schedule", hint: "Auto-generated" },
  { n: 4, label: "Review", hint: "Confirm and create" },
];

/**
 * Holds all wizard state in one place: name, city, startDate,
 * teachingDays, the admin's own uploaded CSV (read client-side, nothing on
 * disk), excludedIds, step. Nothing is written until step 4's "Create
 * cohort" calls the `createCohort` server action — every earlier step only
 * ever reads/derives from client state.
 */
export function NewCohortWizard() {
  const router = useRouter();
  const { show } = useToast();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState(() => todayISO());
  const [teachingDays, setTeachingDays] = useState<number[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [dedupe, setDedupe] = useState<DedupeResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const events = useMemo(() => buildEvents(startDate, teachingDays), [startDate, teachingDays]);
  const enrolledCount = dedupe ? dedupe.registrants.length - excludedIds.size : 0;

  function toggleDay(day: number) {
    setTeachingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  function toggleExcluded(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleFile(file: File) {
    setParseError(null);
    setParsing(true);
    setDedupe(null);
    setExcludedIds(new Set());
    try {
      const text = await file.text();
      const result = await getRegistrationPreview(text);
      setCsvText(text);
      setFileName(file.name);
      setDedupe(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't read that file. Try again.");
    } finally {
      setParsing(false);
    }
  }

  function clearFile() {
    setFileName(null);
    setCsvText(null);
    setDedupe(null);
    setExcludedIds(new Set());
    setParseError(null);
  }

  async function handleCreate() {
    if (!csvText || !dedupe) return;
    setError(null);
    setCreating(true);
    try {
      const includedRegistrantIds = dedupe.registrants
        .filter((r) => !excludedIds.has(r.id))
        .map((r) => r.id);
      const result = await createCohort({
        name,
        city,
        startDate,
        teachingDays,
        csvText,
        includedRegistrantIds,
      });
      show(
        `${name} created · ${result.studentsCount} students, ${result.eventsCount} events. Registers are empty and ready.`
      );
      router.push("/cohorts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setCreating(false);
    }
  }

  function goBack() {
    setStep((s) => Math.max(1, s - 1));
  }

  function goNext() {
    if (step === 4) {
      void handleCreate();
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Stepper steps={STEPS} current={step} />
      <div className="grid items-start gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
        <div>
          {step === 1 && (
            <StepCohort
              name={name}
              setName={setName}
              city={city}
              setCity={setCity}
              startDate={startDate}
              setStartDate={setStartDate}
              teachingDays={teachingDays}
              toggleDay={toggleDay}
              events={events}
              onContinue={goNext}
            />
          )}
          {step === 2 && (
            <StepStudents
              fileName={fileName}
              dedupe={dedupe}
              parsing={parsing}
              parseError={parseError}
              excludedIds={excludedIds}
              onFile={handleFile}
              onClearFile={clearFile}
              toggleExcluded={toggleExcluded}
              onBack={goBack}
              onContinue={goNext}
            />
          )}
          {step === 3 && (
            <StepSchedule
              events={events}
              enrolledCount={enrolledCount}
              onBack={goBack}
              onContinue={goNext}
            />
          )}
          {step === 4 && (
            <StepReview
              name={name}
              city={city}
              startDate={startDate}
              teachingDays={teachingDays}
              events={events}
              enrolledCount={enrolledCount}
              creating={creating}
              error={error}
              onBack={goBack}
              onContinue={goNext}
            />
          )}
        </div>
        <SummaryCard name={name} teachingDays={teachingDays} studentsCount={enrolledCount} events={events} />
      </div>
    </div>
  );
}
