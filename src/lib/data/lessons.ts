import type { DB } from "./types";
import type { CrusadeEventView, LessonEventView } from "@/lib/domain/types";
import { lessonAt } from "@/lib/domain/curriculum";

interface LessonEventRow {
  id: string;
  event_date: string;
  edited: boolean;
  lesson: { global_index: number; title: string; has_quiz: boolean } | { global_index: number; title: string; has_quiz: boolean }[] | null;
  register:
    | { attendance: Record<string, "present" | "absent">; quiz: Record<string, number>; recorded_by: string | null; recorded_at: string | null; updated_by: string | null; updated_at: string | null }
    | { attendance: Record<string, "present" | "absent">; quiz: Record<string, number>; recorded_by: string | null; recorded_at: string | null; updated_by: string | null; updated_at: string | null }[]
    | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const EMPTY_REGISTER = {
  attendance: {} as Record<string, "present" | "absent">,
  quiz: {} as Record<string, number>,
  recorded_by: null as string | null,
  recorded_at: null as string | null,
  updated_by: null as string | null,
  updated_at: null as string | null,
};

/**
 * Full lesson-event view with real register content — for facilitator,
 * admin, leadership. RLS (`has_pastoral_access`) enforces this at the
 * database too; a teacher's client would simply get `register: null` back
 * per row, which is why teacher-facing screens use
 * `getLessonEventsPublic` instead.
 */
export async function getLessonEvents(db: DB, cohortId: string): Promise<LessonEventView[]> {
  const { data, error } = await db
    .from("event")
    .select(
      "id, event_date, edited, lesson:lesson_id(global_index, title, has_quiz), register(attendance, quiz, recorded_by, recorded_at, updated_by, updated_at)"
    )
    .eq("cohort_id", cohortId)
    .eq("kind", "lesson")
    .order("event_date");
  if (error) throw error;

  const rows = (data ?? []) as unknown as LessonEventRow[];
  return rows
    .map((row) => {
      const lesson = one(row.lesson);
      if (!lesson) return null;
      const loc = lessonAt(lesson.global_index);
      const reg = one(row.register) ?? EMPTY_REGISTER;
      const view: LessonEventView = {
        eventId: row.id,
        cohortId,
        date: row.event_date,
        globalIndex: lesson.global_index,
        classNumber: loc.classNumber,
        classIndex: loc.classIndex,
        lessonRef: loc.ref,
        lessonTitle: lesson.title,
        hasQuiz: lesson.has_quiz,
        edited: row.edited,
        register: {
          eventId: row.id,
          attendance: reg.attendance ?? {},
          quiz: reg.quiz ?? {},
          recordedBy: reg.recorded_by ?? null,
          recordedAt: reg.recorded_at ?? null,
          updatedBy: reg.updated_by ?? null,
          updatedAt: reg.updated_at ?? null,
        },
      };
      return view;
    })
    .filter((v): v is LessonEventView => v !== null)
    .sort((a, b) => a.globalIndex - b.globalIndex);
}

export interface LessonPublicView {
  eventId: string;
  cohortId: string;
  date: string;
  globalIndex: number;
  classNumber: number;
  classIndex: number;
  lessonRef: string;
  lessonTitle: string;
  hasQuiz: boolean;
  recorded: boolean;
  present: number | null;
  absent: number | null;
  rate: number | null;
  quizAvg: number | null;
  enrolled: number;
}

/** Teacher-safe: aggregate counts only, via the `cohort_lesson_public_stats`
 * SECURITY DEFINER function — never the per-student attendance/quiz maps. */
export async function getLessonEventsPublic(db: DB, cohortId: string): Promise<LessonPublicView[]> {
  const [{ data: eventRows, error: eventErr }, { data: statRows, error: statErr }] = await Promise.all([
    db
      .from("event")
      .select("id, event_date, lesson:lesson_id(global_index, title, has_quiz)")
      .eq("cohort_id", cohortId)
      .eq("kind", "lesson")
      .order("event_date"),
    db.rpc("cohort_lesson_public_stats", { p_cohort: cohortId }),
  ]);
  if (eventErr) throw eventErr;
  if (statErr) throw statErr;

  const statsByEvent = new Map((statRows ?? []).map((r) => [r.event_id, r]));
  const rows = (eventRows ?? []) as unknown as Omit<LessonEventRow, "register">[];

  return rows
    .map((row) => {
      const lesson = one(row.lesson);
      if (!lesson) return null;
      const loc = lessonAt(lesson.global_index);
      const s = statsByEvent.get(row.id);
      const view: LessonPublicView = {
        eventId: row.id,
        cohortId,
        date: row.event_date,
        globalIndex: lesson.global_index,
        classNumber: loc.classNumber,
        classIndex: loc.classIndex,
        lessonRef: loc.ref,
        lessonTitle: lesson.title,
        hasQuiz: lesson.has_quiz,
        recorded: s?.recorded ?? false,
        present: s?.recorded ? s.present : null,
        absent: s?.recorded ? s.absent : null,
        rate: s?.recorded ? s.rate : null,
        quizAvg: s?.recorded ? s.quiz_avg : null,
        enrolled: s?.enrolled ?? 0,
      };
      return view;
    })
    .filter((v): v is LessonPublicView => v !== null)
    .sort((a, b) => a.globalIndex - b.globalIndex);
}

export async function getCrusadeEvents(db: DB, cohortId: string): Promise<CrusadeEventView[]> {
  const { data, error } = await db
    .from("event")
    .select("id, event_date, after_class, crusade_day")
    .eq("cohort_id", cohortId)
    .eq("kind", "crusade")
    .order("event_date");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    eventId: row.id,
    cohortId,
    date: row.event_date,
    afterClass: row.after_class ?? 0,
    crusadeDay: row.crusade_day ?? 0,
  }));
}
