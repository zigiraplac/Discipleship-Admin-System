import { cn } from "@/lib/utils";
import type { Status, CohortHealth } from "@/lib/domain/types";

export type PillTone = "cyan" | "yellow" | "magenta" | "grey";

const TONE_CLASSES: Record<PillTone, string> = {
  cyan: "bg-accent-100 text-accent-800",
  yellow: "bg-yellow-100 text-yellow-ink",
  magenta: "bg-accent-2-100 text-accent-2-700",
  grey: "bg-page text-ink-tertiary",
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
