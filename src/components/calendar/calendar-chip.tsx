import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ChipData, ChipTone } from "./calendar-types";

const TONE_CLASSES: Record<ChipTone, string> = {
  cyan: "bg-accent-100 text-accent-800",
  magenta: "bg-accent-2-100 text-accent-2-700",
  yellow: "bg-yellow-100 text-yellow-ink",
};

/** A single event chip inside a calendar cell — a link when the viewer's
 * role can act on it, an inert block otherwise (see calendar-grid's
 * `lessonHref` / `canOpenStudent` resolution). */
export function CalendarChip({ chip }: { chip: ChipData }) {
  const classes = cn(
    "block w-full rounded-[7px] px-[5px] py-[3.5px] text-left leading-tight",
    TONE_CLASSES[chip.tone],
    chip.href && "cursor-pointer hover:brightness-95"
  );

  const inner = (
    <>
      <div className="truncate text-[10px] font-semibold">{chip.title}</div>
      <div className="truncate text-[9px] opacity-80">{chip.detail}</div>
    </>
  );

  if (chip.href) {
    return (
      <Link href={chip.href} className={classes}>
        {inner}
      </Link>
    );
  }
  return <div className={classes}>{inner}</div>;
}
