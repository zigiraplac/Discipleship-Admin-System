import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The colored stat tile used on the wizard's Students and Schedule steps —
 * same shape as `StatCard`, but the value can carry a tone (yellow/magenta/
 * cyan) instead of always being plain ink. */
export function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "yellow" | "magenta" | "cyan";
}) {
  return (
    <Card className="p-3.5 px-4">
      <div className="text-xs font-semibold text-ink-tertiary">{label}</div>
      <div
        className={cn(
          "mt-2 text-[26px] font-bold leading-none tabular",
          tone === "yellow" && "text-yellow-ink",
          tone === "magenta" && "text-accent-2-700",
          tone === "cyan" && "text-accent-700",
          !tone && "text-ink"
        )}
      >
        {value}
      </div>
    </Card>
  );
}
