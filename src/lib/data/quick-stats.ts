import type { DB } from "./types";
import type { Bands, Role, CohortHealth } from "@/lib/domain/types";
import { getStudents } from "./students";
import { getLessonEvents, getLessonEventsPublic } from "./lessons";
import { aggregateCohort } from "@/lib/domain/metrics";
import { cohortHealth } from "@/lib/domain/bands";

export interface QuickStats {
  enrolled: number;
  rate: number;
  health: CohortHealth;
}

/**
 * Cheap cohort-wide numbers for the cohort switcher and the Cohorts screen.
 * For facilitator/admin/leadership this runs the real aggregate (they have
 * pastoral access to their own cohorts anyway). For teacher — who has no
 * register access — it falls back to the aggregate-only RPC and treats
 * at-risk count as 0 for the health formula; a documented simplification,
 * since a teacher's *own* Dashboard/Lessons/Reports use the correct public
 * path already and this only feeds a secondary dropdown.
 */
export async function getQuickStats(
  db: DB,
  cohortId: string,
  bands: Bands,
  todayISO: string,
  role: Role
): Promise<QuickStats> {
  if (role === "teacher") {
    const [{ count }, pub] = await Promise.all([
      db.from("student").select("id", { count: "exact", head: true }).eq("cohort_id", cohortId),
      getLessonEventsPublic(db, cohortId),
    ]);
    const enrolled = count ?? 0;
    const recorded = pub.filter((p) => p.recorded);
    const totalPresent = recorded.reduce((a, p) => a + (p.present ?? 0), 0);
    const rate = enrolled && recorded.length ? Math.round((totalPresent / (enrolled * recorded.length)) * 100) : 0;
    return { enrolled, rate, health: cohortHealth(rate, 0, enrolled) };
  }

  const [students, lessonEvents] = await Promise.all([
    getStudents(db, cohortId),
    getLessonEvents(db, cohortId),
  ]);
  const agg = aggregateCohort(students, lessonEvents, bands, todayISO);
  return { enrolled: agg.enrolled, rate: agg.rate, health: agg.health };
}
