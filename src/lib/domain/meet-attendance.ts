import Papa from "papaparse";
import { normalizeNameKey } from "./registrations";

/**
 * Attendance reports from a Google Meet call, in either of two shapes
 * this app accepts:
 *
 * - **CSV** — Google's own native export (Workspace → a Google Sheet
 *   emailed to the organizer, downloaded as CSV): name + total in-call
 *   duration per participant, no percentage column.
 * - **PDF** — a third-party report generator ("Meet Attendance Tracker"
 *   and similar Chrome extensions/Workspace Marketplace add-ons render
 *   the same underlying data as a formatted PDF table, this one
 *   *with* an "Attended percentage" column already computed). Verified
 *   against a real export: `pdf-parse`'s plain text extraction
 *   (`src/lib/actions/meet-attendance.ts`, Node-only, hence a server
 *   action rather than client-side parsing like the CSV path) comes out
 *   as clean one-row-per-line text, no OCR or table-geometry detection
 *   needed — each row reads
 *   `<no.> <NAME> <first-seen HH:MM:SS> <duration> <pct>%`.
 *
 * Both paths converge on the same `MeetParticipant[]` shape so matching/
 * threshold logic below doesn't care which format a given file was.
 */

const HEADER_ALIASES: Record<string, string[]> = {
  fullName: ["name", "participant name", "full name", "participant"],
  firstName: ["first name", "firstname"],
  lastName: ["last name", "lastname"],
  email: ["email", "email address"],
  duration: [
    "duration (minutes)",
    "duration (in minutes)",
    "duration",
    "time in call",
    "in-call duration",
    "total duration",
    "attended duration",
  ],
  percentage: ["attended percentage", "percentage", "attendance", "attendance %"],
};

function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MeetParticipant {
  name: string;
  nameKey: string;
  email: string | null;
  durationMinutes: number;
  /** Given directly by the source (e.g. the PDF's own "Attended
   * percentage" column) — preferred over deriving one from
   * `durationMinutes` ÷ meeting length whenever present. */
  sourcePct: number | null;
}

/** `"38:12"` (mm:ss), `"1:02:14"` (h:mm:ss), `"53 min 25s"` / `"1h 5min
 * 3s"` (the PDF tool's own wording), a bare number of minutes, or `"42
 * min"` — every source this app accepts writes duration differently, so
 * this tries the colon form, then an hours/minutes/seconds word pattern,
 * then just the first number found. */
function parseDurationMinutes(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map(Number);
    if (parts.every((n) => Number.isFinite(n))) {
      if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
      if (parts.length === 2) return parts[0] + parts[1] / 60;
    }
  }

  const worded = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?\s*(?:(\d+)\s*s)?$/i.exec(trimmed);
  if (worded && (worded[1] || worded[2] || worded[3])) {
    const h = Number(worded[1] ?? 0);
    const m = Number(worded[2] ?? 0);
    const s = Number(worded[3] ?? 0);
    return h * 60 + m + s / 60;
  }

  const match = /[\d.]+/.exec(trimmed);
  return match ? Number(match[0]) : 0;
}

/**
 * Parses the CSV and collapses it to one row per person, summing duration
 * across rows — defensive in case a given export (or a rejoin) produces
 * more than one row per participant, even though Google's own report is
 * documented to already fold rejoin sessions into one total per person.
 */
export function parseMeetAttendanceCsv(raw: string): MeetParticipant[] {
  const { data } = Papa.parse<string[]>(raw, { skipEmptyLines: true });
  if (data.length < 2) return [];
  const header = data[0];
  const body = data.slice(1);

  const indexFor: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  header.forEach((raw, i) => {
    const normalized = normalizeHeader(raw ?? "");
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (field in indexFor) continue;
      if (aliases.includes(normalized)) indexFor[field as keyof typeof HEADER_ALIASES] = i;
    }
  });

  const cell = (cols: string[], key: keyof typeof HEADER_ALIASES): string => {
    const i = indexFor[key];
    return i == null ? "" : (cols[i] ?? "").trim();
  };

  const byKey = new Map<string, MeetParticipant>();
  for (const cols of body) {
    if (!cols.some((c) => c && c.trim())) continue;
    const fullNameCol = cell(cols, "fullName");
    const name = fullNameCol || [cell(cols, "firstName"), cell(cols, "lastName")].filter(Boolean).join(" ");
    if (!name) continue;

    const nameKey = normalizeNameKey(name);
    const durationMinutes = parseDurationMinutes(cell(cols, "duration"));
    const pctCell = cell(cols, "percentage");
    const sourcePct = pctCell ? Number(pctCell.replace(/[^\d.]/g, "")) || null : null;
    const existing = byKey.get(nameKey);
    if (existing) {
      existing.durationMinutes += durationMinutes;
    } else {
      byKey.set(nameKey, { name, nameKey, email: cell(cols, "email") || null, durationMinutes, sourcePct });
    }
  }

  return [...byKey.values()];
}

/**
 * The "Meet Attendance Tracker"-style PDF report, after `pdf-parse`'s
 * plain-text extraction (see `src/lib/actions/meet-attendance.ts`) —
 * verified line-for-line against a real export. Each participant row
 * reads `<no.> <NAME> <HH:MM:SS> <duration> <pct>%`; every other line in
 * the report (title, summary block, header row) simply doesn't match and
 * is skipped, so this doesn't need to locate the table by section first.
 */
const PDF_ROW_RE = /^(\d+)\s+(.+?)\s+(\d{1,2}:\d{2}:\d{2})\s+((?:\d+\s*h\s*)?(?:\d+\s*min\s*)?(?:\d+\s*s)?)\s+(\d+)%$/;

export function parseMeetAttendancePdfText(text: string): MeetParticipant[] {
  const byKey = new Map<string, MeetParticipant>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = PDF_ROW_RE.exec(line);
    if (!m) continue;
    const [, , rawName, , durationText, pctText] = m;
    const name = rawName.trim();
    if (!name) continue;

    const nameKey = normalizeNameKey(name);
    const durationMinutes = parseDurationMinutes(durationText);
    const sourcePct = Number(pctText);
    const existing = byKey.get(nameKey);
    if (existing) {
      existing.durationMinutes += durationMinutes;
    } else {
      byKey.set(nameKey, { name, nameKey, email: null, durationMinutes, sourcePct });
    }
  }
  return [...byKey.values()];
}

/** Only reached when a source doesn't already carry its own percentage
 * (`sourcePct`) — the longest single participant's duration stands in for
 * the meeting's total length, since the host or an early, persistent
 * joiner reliably spans close to the whole call. Editable in the review
 * UI in case a given file makes this look wrong. */
export function meetingDurationMinutes(participants: MeetParticipant[]): number {
  return participants.reduce((max, p) => Math.max(max, p.durationMinutes), 0);
}

export interface RosterStudent {
  id: string;
  fullName: string;
}

export interface MatchedAttendance {
  studentId: string;
  fullName: string;
  matched: MeetParticipant | null;
  pct: number | null;
}

export interface MatchResult {
  matches: MatchedAttendance[];
  /** Meet rows that didn't match any roster student by name — a guest, a
   * visiting facilitator, or simply a spelling/nickname mismatch. Offered
   * in the review UI as manual-assignment candidates for any roster
   * student that came up unmatched. */
  unmatchedParticipants: MeetParticipant[];
}

/**
 * Exact, word-order-insensitive matching only (reusing `normalizeNameKey`,
 * the same key CSV registration import already dedupes on) — a Meet
 * display name is whatever's on someone's own Google account, which can
 * genuinely diverge from the roster (nickname, shared family device,
 * joined under someone else's login). Anything that doesn't match is left
 * for a human to resolve rather than guessed at with a similarity score.
 */
export function matchToRoster(participants: MeetParticipant[], roster: RosterStudent[], totalMinutes: number): MatchResult {
  const byKey = new Map(participants.map((p) => [p.nameKey, p]));
  const usedKeys = new Set<string>();

  const matches: MatchedAttendance[] = roster.map((s) => {
    const key = normalizeNameKey(s.fullName);
    const matched = byKey.get(key) ?? null;
    if (matched) usedKeys.add(matched.nameKey);
    const pct = matched ? (matched.sourcePct ?? (totalMinutes > 0 ? Math.round((matched.durationMinutes / totalMinutes) * 100) : null)) : null;
    return { studentId: s.id, fullName: s.fullName, matched, pct };
  });

  const unmatchedParticipants = participants.filter((p) => !usedKeys.has(p.nameKey));
  return { matches, unmatchedParticipants };
}

/** Below `thresholdPct` (or no match at all) → absent; at or above →
 * present. Every roster student gets an explicit mark, never left to the
 * register form's own "missing key defaults to present" convention — a
 * result this feature computes should never rely on that default. */
export function attendanceFromMatches(matches: MatchedAttendance[], thresholdPct: number): Record<string, "present" | "absent"> {
  const result: Record<string, "present" | "absent"> = {};
  for (const m of matches) {
    result[m.studentId] = m.pct !== null && m.pct >= thresholdPct ? "present" : "absent";
  }
  return result;
}
