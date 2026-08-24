"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;

export function PopoverPanel({
  className,
  align = "end",
  width = 300,
  children,
}: {
  className?: string;
  align?: "start" | "end";
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner side="bottom" align={align} sideOffset={7}>
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
