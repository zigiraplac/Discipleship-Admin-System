export interface BirthdaySource {
  id: string;
  fullName: string;
  dobDay: number | null;
  dobMonth: number | null;
}

export interface UpcomingBirthday {
  studentId: string;
  name: string;
  day: number;
  month: number;
  daysUntil: number; // 0 = today
}

/**
 * Students with a known day+month, ordered by how soon their next
 * birthday falls (wrapping into next year past today) — not by raw
 * month/day, which would put a January birthday "later" than a December
 * one on the day after New Year's.
 */
export function upcomingBirthdays(
  students: BirthdaySource[],
  todayISO: string,
  limit = 5
): UpcomingBirthday[] {
  const [y, m, d] = todayISO.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);

  const withDob = students.filter(
    (s): s is BirthdaySource & { dobDay: number; dobMonth: number } =>
      s.dobDay != null && s.dobMonth != null
  );

  const computed: UpcomingBirthday[] = withDob.map((s) => {
    let next = Date.UTC(y, s.dobMonth - 1, s.dobDay);
    if (next < today) next = Date.UTC(y + 1, s.dobMonth - 1, s.dobDay);
    const daysUntil = Math.round((next - today) / 86400000);
    return { studentId: s.id, name: s.fullName, day: s.dobDay, month: s.dobMonth, daysUntil };
  });

  return computed.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, limit);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatBirthdayDate(day: number, month: number): string {
  return `${day} ${MONTH_ABBR[month - 1]}`;
}
