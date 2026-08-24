"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  solid = false,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Reports variant: active segment is a solid cyan chip, not a white one. */
  solid?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 rounded-control bg-hover p-[3px]", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[7px] px-3 py-1.5 text-xs font-medium text-ink-tertiary",
              active &&
                (solid
                  ? "bg-accent font-bold text-white"
                  : "border border-border bg-card font-bold text-ink")
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
