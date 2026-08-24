import type { DB } from "./types";
import { CURRICULUM } from "@/lib/domain/curriculum";

/**
 * Idempotently ensures the fixed reference curriculum (7 classes / 80
 * lessons) exists. There is no separate seed step for this and no UI for
 * it either — it's the same curriculum for every cohort, forever, so it
 * only needs to exist once. Called automatically the first time an admin
 * creates a cohort (`createCohort`); a no-op on every call after that.
 */
export async function ensureCurriculumSeeded(db: DB): Promise<void> {
  const { count, error: countErr } = await db
    .from("class")
    .select("id", { count: "exact", head: true });
  if (countErr) throw countErr;
  if (count && count > 0) return;

  const classRows = CURRICULUM.map((c) => ({
    id: c.n,
    title: c.title,
    part_note: c.parts,
    lesson_count: c.lessons.length,
    position: c.n,
  }));
  const { error: classErr } = await db.from("class").upsert(classRows);
  if (classErr) throw classErr;

  let globalIndex = 0;
  const lessonRows: {
    class_id: number;
    index_in_class: number;
    global_index: number;
    title: string;
    has_quiz: boolean;
  }[] = [];
  for (const cls of CURRICULUM) {
    cls.lessons.forEach((title, li) => {
      lessonRows.push({
        class_id: cls.n,
        index_in_class: li + 1,
        global_index: globalIndex,
        title,
        has_quiz: globalIndex % 4 === 3,
      });
      globalIndex++;
    });
  }
  const { error: lessonErr } = await db.from("lesson").upsert(lessonRows, { onConflict: "global_index" });
  if (lessonErr) throw lessonErr;
}
