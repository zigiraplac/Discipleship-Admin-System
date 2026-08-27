"use client";

import { useEffect, useRef, useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { TrendUp, TrendDown } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
      {children}
    </div>
  );
}

export type DeltaTone = "ok" | "warn" | "bad";
type FlashDirection = "up-good" | "up-bad" | "neutral";
type Flash = "good" | "bad" | "neutral";

const FLASH_CLASSES: Record<Flash, string> = {
  good: "border-emerald-500 bg-emerald-100",
  bad: "border-accent-2-500 bg-accent-2-100",
  neutral: "border-accent bg-accent-100",
};

export function KpiCard({
  icon: IconEl,
  label,
  value,
  delta,
  deltaTone,
  sub,
  trackValue,
  flashDirection = "neutral",
}: {
  icon: Icon;
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaTone?: DeltaTone;
  sub: React.ReactNode;
  /**
   * A plain number to compare against its own previous render, purely to
   * decide whether (and which color) to flash — decoupled from `value`
   * since `value` is often a formatted string ("On pace", "82%"). Omit to
   * leave this card's border/background alone entirely.
   *
   * This only ever fires from a `router.refresh()` after your own action
   * (saving a register, recording an outcome, ...) — Next.js merges that
   * refresh into the already-mounted tree rather than remounting it, so
   * the ref below survives across it and can tell "changed" from "first
   * paint." A fresh page load (this component mounting for the first
   * time) never flashes, only a change *while already on screen* does.
   */
  trackValue?: number;
  /** Which direction of change reads as good vs bad for this particular
   * metric — a rising attendance rate is good, a rising at-risk count
   * isn't, so this can't be inferred from the number alone. */
  flashDirection?: FlashDirection;
}) {
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    if (trackValue === undefined) return;
    const prev = prevRef.current;
    prevRef.current = trackValue;
    if (prev === null || prev === trackValue) return;

    const increased = trackValue > prev;
    const tone: Flash =
      flashDirection === "neutral" ? "neutral" : increased === (flashDirection === "up-good") ? "good" : "bad";
    setFlash(tone);
    const timer = setTimeout(() => setFlash(null), 1000);
    return () => clearTimeout(timer);
  }, [trackValue, flashDirection]);

  return (
    <Card className={cn("p-[15px] px-4 transition-colors duration-1000", flash && FLASH_CLASSES[flash])}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-tertiary">{label}</span>
        <span className="grid size-8 flex-none place-items-center rounded-full bg-accent-100 text-accent-800">
          <IconEl size={15} />
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[28px] font-bold leading-none text-ink tabular">{value}</span>
        {delta && (
          <span
            className={cn(
              "inline-flex flex-none items-center gap-1 rounded-pill px-2 py-[3px] text-[11px] font-bold",
              deltaTone === "ok" && "bg-emerald-100 text-emerald-700",
              deltaTone === "warn" && "bg-yellow-100 text-yellow-ink",
              deltaTone === "bad" && "bg-accent-2-100 text-accent-2-700"
            )}
          >
            {deltaTone === "ok" && <TrendUp size={11} weight="bold" />}
            {deltaTone === "bad" && <TrendDown size={11} weight="bold" />}
            {delta}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-ink-muted">{sub}</div>
    </Card>
  );
}
