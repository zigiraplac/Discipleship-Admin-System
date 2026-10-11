"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;

export function PopoverPanel({
  className,
  align = "end",
  side = "bottom",
  width = 300,
  children,
}: {
  className?: string;
  align?: "start" | "end";
  /** "top" for a trigger near the bottom of the screen. */
  side?: "top" | "bottom";
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner side={side} align={align} sideOffset={7}>
        <BasePopover.Popup
          className={cn(
            "z-40 overflow-hidden rounded-[12px] border border-border bg-card shadow-dropdown outline-none",
            "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className
          )}
          style={{ width }}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
