import { cohortCapabilities } from "@/lib/authz";
import Link from "next/link";
import { notFound } from "next/navigation";
import { X } from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/lib/auth";
import { getCohortWithBands } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { getStudent, getStudents } from "@/lib/data/students";
import { getLessonEvents } from "@/lib/data/lessons";
import { aggregateCohort } from "@/lib/domain/metrics";
import { todayISO } from "@/lib/utils";
import { StudentDetail } from "@/components/students/student-detail";

/** The open student, shown beside the Students list (students/layout.tsx).
 * Links from notifications land here too. */
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ cohortId: string; studentId: string }>;
}) {
  const { cohortId: routeParam, studentId } = await params;
  await requireUser();

  const supabase = await createClient();
  const [[cohort, bands], student] = await Promise.all([
    getCohortWithBands(supabase, routeParam),
    getStudent(supabase, studentId),
  ]);
  if (!cohort) notFound();
  const cohortId = cohort.id;
  // What this person may do in *this* cohort (authz/policy), not their account role.
  const caps = await cohortCapabilities(cohortId);
  if (!caps.has("view_student")) notFound();

  const [students, lessonEvents] = await Promise.all([
    getStudents(supabase, cohortId),
    getLessonEvents(supabase, cohortId),
  ]);

  if (!student || student.cohortId !== cohortId) notFound();

  const today = todayISO();
  const agg = aggregateCohort(students, lessonEvents, bands, today);
  const studentAgg = agg.roster.find((s) => s.id === studentId);
  if (!studentAgg) notFound();

  return (
    <section aria-label={`${student.fullName} details`} className="relative">
      {/* Sits in the details card's top-right corner. */}
      <Link
        href={`/c/${cohort.slug}/students`}
        scroll={false}
        aria-label="Close student details"
        className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-control border border-border bg-card text-ink-muted hover:bg-hover"
      >
        <X size={16} />
      </Link>

      <StudentDetail
        cohort={cohort}
        bands={bands}
        caps={caps}
        student={student}
        studentAgg={studentAgg}
        lessonEvents={lessonEvents}
        today={today}
        compact
      />
    </section>
  );
}
