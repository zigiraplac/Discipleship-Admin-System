import { cn } from "@/lib/utils";
import type { Status, CohortHealth } from "@/lib/domain/types";

// cyan/yellow/magenta/grey are the app's original status meaning (on
// track/needs help/at risk) — reused wherever something is genuinely
// good/warning/bad. green is the standard "on track, no risk" status color
// (distinct from cyan/blue, which stays this app's "healthy" tone for the
// attendance-band system already built on it — green is for newer, smaller-
// scoped status reads like a lesson's own state, not a wholesale rename of
// that established system). violet/teal/sky/amber carry no status meaning
// at all: they're for telling categories apart (a role, a kind) where
// nothing is "wrong", so reusing a status color there would misread as a
// health signal that isn't real.
export type PillTone = "cyan" | "yellow" | "magenta" | "grey" | "green" | "violet" | "teal" | "sky" | "amber";

const TONE_CLASSES: Record<PillTone, string> = {
  cyan: "bg-accent-100 text-accent-800",
  yellow: "bg-yellow-100 text-yellow-ink",
  magenta: "bg-accent-2-100 text-accent-2-700",
  grey: "bg-page text-ink-tertiary",
  green: "bg-emerald-100 text-emerald-700",
  violet: "bg-violet-100 text-violet-700",
  teal: "bg-teal-100 text-teal-700",
  sky: "bg-sky-100 text-sky-700",
  amber: "bg-amber-100 text-amber-800",
};

export function Pill({
  tone,
  className,
  children,
}: {
  tone: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center whitespace-nowrap rounded-pill px-2.5 py-[3px] text-[11px] font-semibold",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function toneForStatus(status: Status): PillTone {
  if (status === "On track") return "cyan";
  if (status === "Needs help") return "yellow";
  return "magenta";
}

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <Pill tone={toneForStatus(status)} className={className}>
      {status}
    </Pill>
  );
}

export function toneForHealth(health: CohortHealth): PillTone {
  if (health === "Healthy") return "cyan";
  if (health === "Watch") return "yellow";
  return "magenta";
}

export function HealthPill({ health, className }: { health: CohortHealth; className?: string }) {
  return (
    <Pill tone={toneForHealth(health)} className={className}>
      {health}
    </Pill>
  );
}
