"use client";

import { useMemo, useRef, useState } from "react";
import { File, UploadSimple, X } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatGrid } from "@/components/ui/stat-card";
import { Pill } from "@/components/ui/pill";
import { cn, formatShortDate, todayISO } from "@/lib/utils";
import type { DedupeResult } from "@/lib/domain/registrations";
import { StepCard } from "./step-card";
import { Tile } from "./stat-tile";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatBirthday(day: number | null, month: number | null): string {
  if (day == null || month == null) return "—";
  return `${day} ${MONTH_ABBR[month - 1]}`;
}

/**
 * Step 2 — Students: the admin uploads their own registration CSV here.
 * Reading + dedupe preview both happen for real (via the server action),
 * nothing is pre-loaded — this is genuinely their file, not a demo one.
 */
export function StepStudents({
  fileName,
  dedupe,
  parsing,
  parseError,
  excludedIds,
  onFile,
  onClearFile,
  toggleExcluded,
  onBack,
  onContinue,
}: {
  fileName: string | null;
  dedupe: DedupeResult | null;
  parsing: boolean;
  parseError: string | null;
  excludedIds: Set<string>;
  onFile: (file: File) => void;
  onClearFile: () => void;
  toggleExcluded: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const willBeEnrolled = dedupe ? dedupe.registrants.length - excludedIds.size : 0;

  const filtered = useMemo(() => {
    if (!dedupe) return [];
    const q = query.trim().toLowerCase();
    if (!q) return dedupe.registrants;
    return dedupe.registrants.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [dedupe, query]);

  if (!dedupe) {
    return (
      <StepCard step={2} onBack={onBack} onContinue={onContinue} continueDisabled>
        <div>
          <h3 className="text-sm font-bold text-ink">Import your registrations</h3>
          <p className="mt-1 text-xs text-ink-muted">
            A CSV export of your sign-up sheet — one row per person. Messy emails, duplicate
            submissions, and missing birthdays are fine; you&rsquo;ll get a chance to review before
            anything is created.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed p-8 text-center",
            "text-ink-muted hover:border-accent-300 hover:text-accent-700",
            parsing && "cursor-default opacity-60"
          )}
          style={{ borderColor: "var(--color-dashed)" }}
        >
          <UploadSimple size={22} />
          <span className="text-[13px] font-semibold">{parsing ? "Reading file…" : "Choose a CSV file"}</span>
          <span className="text-xs">or drop it here</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        {parseError && (
          <div className="rounded-control border border-accent-2-200 bg-accent-2-100 px-3 py-2.5 text-[13px] text-accent-2-700">
            {parseError}
          </div>
        )}
      </StepCard>
    );
  }

  return (
    <StepCard step={2} onBack={onBack} onContinue={onContinue}>
      <div className="flex items-center gap-3 rounded-control border border-border bg-subtle p-3">
        <span className="grid size-9 flex-none place-items-center rounded-[8px] bg-card text-ink-tertiary">
          <File size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{fileName}</div>
          <div className="text-xs text-ink-muted">
            {dedupe.totalRows} rows · uploaded {formatShortDate(todayISO())}
          </div>
        </div>
        <Pill tone="cyan">Imported</Pill>
        <Button type="button" variant="secondary" size="icon" onClick={onClearFile} aria-label="Remove file">
          <X size={14} />
        </Button>
      </div>

      <StatGrid>
        <Tile label="Rows in file" value={dedupe.totalRows} />
        <Tile label="Duplicates merged" value={dedupe.duplicatesMerged} tone="yellow" />
        <Tile label="Test rows dropped" value={dedupe.testRowsDropped} tone="magenta" />
        <Tile label="Will be enrolled" value={willBeEnrolled} tone="cyan" />
      </StatGrid>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Students to enrol</h3>
          <span className="text-xs text-ink-muted">
            {willBeEnrolled} of {dedupe.registrants.length}
          </span>
        </div>
        <Input
          placeholder="Find a name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3"
        />
        <div className="max-h-[330px] overflow-y-auto rounded-control border border-border">
          {filtered.map((r) => {
            const excluded = excludedIds.has(r.id);
            return (
              <label
                key={r.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-divider px-3.5 py-2.5 last:border-b-0",
                  excluded && "opacity-55"
                )}
              >
                <input
                  type="checkbox"
                  checked={!excluded}
                  onChange={() => toggleExcluded(r.id)}
                  className="size-4 flex-none accent-accent"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{r.fullName}</div>
                  <div className="truncate text-[11px] text-ink-muted">{r.email ?? "No email"}</div>
                </div>
                <div className="w-24 flex-none truncate text-xs text-ink-tertiary">{r.country || "—"}</div>
                <div className="w-14 flex-none text-right text-xs text-ink-tertiary tabular">
                  {formatBirthday(r.dobDay, r.dobMonth)}
                </div>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3.5 py-6 text-center text-xs text-ink-muted">No matches.</div>
          )}
        </div>
      </div>
    </StepCard>
  );
}
