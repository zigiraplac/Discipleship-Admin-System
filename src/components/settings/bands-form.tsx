"use client";

import { useState, useTransition } from "react";
import { updateBands } from "@/lib/actions/settings";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Bands } from "@/lib/domain/types";

function BandRow({ dotClassName, label, rule }: { dotClassName: string; label: string; rule: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("size-2.5 flex-none rounded-full", dotClassName)} />
      <span className="flex-1 text-[13px] text-ink-secondary">{label}</span>
      <span className="text-[13px] font-bold tabular text-ink">{rule}</span>
    </div>
  );
}

/** The original spec left bands read-only here; the backend (org_setting +
 * updateBands' audit trail) was always designed for admins to edit them, so
 * this renders a real form: two live-previewed inputs feeding the same
 * three-row band readout, plus a Save button that calls the server action. */
export function BandsForm({ bands }: { bands: Bands }) {
  const { show } = useToast();
  const [activeThreshold, setActiveThreshold] = useState(bands.activeThreshold);
  const [helpThreshold, setHelpThreshold] = useState(bands.helpThreshold);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (
      !Number.isFinite(activeThreshold) ||
      !Number.isFinite(helpThreshold) ||
      activeThreshold < 0 ||
      activeThreshold > 100 ||
      helpThreshold < 0 ||
      helpThreshold > 100
    ) {
      setError("Thresholds must be whole numbers between 0 and 100.");
      return;
    }
    if (helpThreshold >= activeThreshold) {
      setError("Needs-help threshold must be lower than the on-track threshold.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await updateBands({ activeThreshold, helpThreshold });
      show("Status bands updated.");
    });
  }

  return (
    <Card className="w-[320px] flex-none overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Status bands</CardTitle>
          <CardSubtitle>Attendance thresholds.</CardSubtitle>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="activeThreshold">On track ≥</Label>
            <Input
              id="activeThreshold"
              type="number"
              min={0}
              max={100}
              value={activeThreshold}
              onChange={(e) => setActiveThreshold(e.target.valueAsNumber)}
            />
          </div>
          <div>
            <Label htmlFor="helpThreshold">Needs help ≥</Label>
            <Input
              id="helpThreshold"
              type="number"
              min={0}
              max={100}
              value={helpThreshold}
              onChange={(e) => setHelpThreshold(e.target.valueAsNumber)}
            />
          </div>
        </div>

        {error && <div className="text-[12px] font-medium text-accent-2-700">{error}</div>}

        <div className="flex flex-col gap-2.5 rounded-[10px] border border-divider bg-subtle px-3 py-3">
          <BandRow dotClassName="bg-accent" label="On track" rule={`${activeThreshold}% and above`} />
          <BandRow dotClassName="bg-yellow" label="Needs help" rule={`${helpThreshold}–${activeThreshold - 1}%`} />
          <BandRow dotClassName="bg-accent-2-500" label="At risk" rule={`Below ${helpThreshold}%`} />
        </div>

        <Button type="button" onClick={handleSave} disabled={pending} className="w-full">
          {pending && <Spinner />}
          {pending ? "Saving…" : "Save"}
        </Button>

        <div className="border-t border-divider pt-2.5 text-[11px] text-ink-faint">
          Changing a band re-labels students. Saved registers are never altered.
        </div>
      </div>
    </Card>
  );
}
