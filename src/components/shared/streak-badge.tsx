import { Fire } from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/pill";

/** A single miss isn't a "streak" worth flagging on its own — everyone
 * misses one lesson sometimes. This only shows once someone's gone quiet
 * for real, escalating tone at 4+ the same way `overdue` already treats a
 * lifetime `missed > 8` as worse than a plain "to contact." */
export function StreakBadge({ streak, className }: { streak: number; className?: string }) {
  if (streak < 2) return null;
  return (
    <Pill tone={streak >= 4 ? "magenta" : "yellow"} className={className}>
      <Fire size={11} weight="fill" className="mr-1" />
      {streak} in a row
    </Pill>
  );
}
