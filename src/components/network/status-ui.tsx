import { cn } from "@/lib/utils";
import { STATUS_LABELS, type UnitStatus } from "@/lib/domain/status";

const DOT: Record<UnitStatus, string> = {
  good: "bg-emerald-700",
  attention: "bg-yellow",
  critical: "bg-accent-2-500",
  quiet: "bg-ink-faint",
};
const TEXT: Record<UnitStatus, string> = {
  good: "text-emerald-700",
  attention: "text-yellow-ink",
  critical: "text-accent-2-700",
  quiet: "text-ink-muted",
};

/** 🟢 On track / 🟡 Needs attention / 🔴 At risk / ⚪ No activity — never a number. */
export function UnitStatusBadge({ status, label, className }: { status: UnitStatus; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold", TEXT[status], className)}>
      <span className={cn("size-2.5 flex-none rounded-full", DOT[status])} aria-hidden />
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
