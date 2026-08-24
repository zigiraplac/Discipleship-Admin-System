import type { CrusadeEventView } from "@/lib/domain/types";

/** Normalized lesson shape Calendar needs — built server-side from either
 * the full register view (facilitator/admin) or the public aggregate view
 * (teacher), so the client component doesn't need to know which role it's
 * rendering for. */
export interface CalendarLessonEvent {
  eventId: string;
  date: string; // YYYY-MM-DD
  lessonRef: string; // "C2 · L13"
  lessonTitle: string;
  recorded: boolean;
  rate: number | null; // % present, only meaningful when recorded
}

export interface BirthdayEntry {
  id: string;
  fullName: string;
  dobDay: number;
  dobMonth: number;
}

export type ChipTone = "cyan" | "magenta" | "yellow" | "violet";

export interface ChipData {
  key: string;
  tone: ChipTone;
  title: string;
  detail: string;
  href: string | null;
}

export type { CrusadeEventView };
