import { formatBirthdayDate, type UpcomingBirthday } from "@/lib/domain/birthdays";
import { UpcomingEventsCard, type UpcomingEventRow } from "@/components/shared/upcoming-events";

function dayLabel(daysUntil: number, day: number, month: number): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return formatBirthdayDate(day, month);
}

/** Surfaces who's coming up soon without having to scroll the calendar
 * forward month by month — same card as "Up next" and the Calendar's
 * "This week" panel, so every "what's coming up" list reads the same way.
 * `studentHref` is null when the signed-in role has no Students screen to
 * link to (teacher) — the row still renders, just not as a link. */
export function UpcomingBirthdaysCard({
  birthdays,
  studentHref,
}: {
  birthdays: UpcomingBirthday[];
  studentHref: ((studentId: string) => string) | null;
}) {
  const rows: UpcomingEventRow[] = birthdays.map((b) => ({
    id: `birthday-${b.studentId}`,
    tone: "yellow",
    kind: "birthday",
    title: b.name,
    meta: "Birthday",
    dateLabel: dayLabel(b.daysUntil, b.day, b.month),
    href: studentHref ? studentHref(b.studentId) : null,
  }));

  return <UpcomingEventsCard title="Upcoming birthdays" rows={rows} emptyLabel="No birthdays on file yet." />;
}
