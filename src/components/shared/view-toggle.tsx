"use client";

import { Segmented, type SegmentedOption } from "@/components/ui/segmented";

export type ViewMode = "cards" | "list";

const OPTIONS: SegmentedOption<ViewMode>[] = [
  { value: "cards", label: "Cards" },
  { value: "list", label: "List" },
];

/** Shared Cards/List switch — Catch ups, Follow Up, and Cohorts each let a
 * viewer pick whichever reads better for what they're doing: cards for a
 * scan of a handful of things, a dense list for comparing many at once. */
export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
}) {
  return <Segmented options={OPTIONS} value={value} onChange={onChange} className={className} />;
}
