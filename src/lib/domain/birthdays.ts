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
 * Days until the next occurrence of an annual day+month from `todayISO`
 * (0 = today), wrapping into next year once it's passed — the one piece of
 * date math both `upcomingBirthdays` and a birthday notification's live
 * countdown (recomputed at render time, not frozen at creation — see
 * notifications-bell.tsx) need.
 */
export function daysUntilAnnual(day: number, month: number, todayISO: string): number {
  const [y, m, d] = todayISO.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  let next = Date.UTC(y, month - 1, day);
  if (next < today) next = Date.UTC(y + 1, month - 1, day);
  return Math.round((next - today) / 86400000);
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
  const withDob = students.filter(
    (s): s is BirthdaySource & { dobDay: number; dobMonth: number } =>
      s.dobDay != null && s.dobMonth != null
  );

  const computed: UpcomingBirthday[] = withDob.map((s) => ({
    studentId: s.id,
    name: s.fullName,
    day: s.dobDay,
    month: s.dobMonth,
    daysUntil: daysUntilAnnual(s.dobDay, s.dobMonth, todayISO),
  }));

  return computed.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, limit);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatBirthdayDate(day: number, month: number): string {
  return `${day} ${MONTH_ABBR[month - 1]}`;
}
