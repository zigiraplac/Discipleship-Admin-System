import Link from "next/link";
import { Cake } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { formatBirthdayDate, formatDaysUntil, type UpcomingBirthday } from "@/lib/domain/birthdays";
import { cn } from "@/lib/utils";

/** Surfaces who's coming up soon without having to scroll the calendar
 * forward month by month. `studentHref` is null when the signed-in role
 * has no Students screen to link to (teacher) — the row still renders,
 * just not as a link. */
export function UpcomingBirthdaysCard({
  birthdays,
  studentHref,
}: {
  birthdays: UpcomingBirthday[];
  studentHref: ((studentId: string) => string) | null;
}) {
  return (
    <Card className="p-[18px]">
      <div className="flex items-center gap-2">
        <span className="grid size-6 flex-none place-items-center rounded-[7px] bg-yellow-100 text-yellow-ink">
          <Cake size={14} />
        </span>
        <div className="text-[15px] font-bold text-ink">Upcoming birthdays</div>
      </div>
      <div className="mt-3.5 flex flex-col gap-1">
        {birthdays.map((b) => {
          const row = (
            <span className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 hover:bg-hover">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{b.name}</span>
              <span className="text-xs text-ink-muted tabular">{formatBirthdayDate(b.day, b.month)}</span>
              <span
                className={cn(
                  "flex-none rounded-pill px-2 py-px text-[11px] font-semibold",
                  b.daysUntil <= 1 ? "bg-yellow-100 text-yellow-ink" : "bg-page text-ink-tertiary"
                )}
              >
                {formatDaysUntil(b.daysUntil)}
              </span>
            </span>
          );
          return studentHref ? (
            <Link key={b.studentId} href={studentHref(b.studentId)}>
              {row}
            </Link>
          ) : (
            <div key={b.studentId}>{row}</div>
          );
        })}
        {birthdays.length === 0 && (
          <div className="px-2.5 py-3 text-xs text-ink-muted">No birthdays on file yet.</div>
        )}
      </div>
    </Card>
  );
}
