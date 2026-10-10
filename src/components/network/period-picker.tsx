"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";

const OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "3 months" },
  { value: "365", label: "12 months" },
];

/** The time window for "joined / left / completed" — kept in the URL so it
 * survives moving between sections. */
export function PeriodPicker({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Segmented
      options={OPTIONS}
      value={String(value)}
      onChange={(v) => {
        const next = new URLSearchParams(params.toString());
        next.set("period", v);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    />
  );
}
