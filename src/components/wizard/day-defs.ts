/**
 * Teaching-day toggle order for the wizard: displayed Mon..Sun, but each
 * value is the domain's 0=Sun..6=Sat convention (`Cohort.teachingDays`).
 */
export interface DayDef {
  value: number;
  label: string;
}

export const DAY_DEFS: DayDef[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/** Selected day values, formatted in fixed Mon..Sun order — e.g. "Fri · Sat · Sun". */
export function formatTeachingDays(teachingDays: number[]): string {
  return DAY_DEFS.filter((d) => teachingDays.includes(d.value))
    .map((d) => d.label)
    .join(" · ");
}
