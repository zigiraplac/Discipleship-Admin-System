"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Shared step-body chrome: content area + footer with Back (hidden on
 * step 1) / "Step X of 4" / Continue (relabelled "Create cohort" on step 4). */
export function StepCard({
  step,
  onBack,
  onContinue,
  continueDisabled,
  continueLabel = "Continue",
  children,
}: {
  step: number;
  onBack?: () => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex flex-col gap-4 p-[18px]">{children}</div>
      <div className="flex items-center justify-between border-t border-divider px-[18px] py-3.5">
        {onBack ? (
          <Button type="button" variant="outlineAccent" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <span className="text-xs text-ink-muted">Step {step} of 4</span>
        <Button type="button" variant="primary" onClick={onContinue} disabled={continueDisabled}>
          {continueLabel}
        </Button>
      </div>
    </Card>
  );
}
