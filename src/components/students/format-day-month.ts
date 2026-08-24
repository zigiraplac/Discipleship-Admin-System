const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Day + month only — there's no stored birth year, so `formatShortDate`
 * (which expects a full ISO date) doesn't apply here. */
export function formatDayMonth(day: number | null, month: number | null): string {
  if (!day || !month || month < 1 || month > 12) return "—";
  return `${day} ${MONTHS[month - 1]}`;
}
