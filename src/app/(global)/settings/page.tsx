import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople, getCohortScopesByUser } from "@/lib/data/people";
import { getBands, listCohorts, getScheduleSegments } from "@/lib/data/cohorts";
import { getLessonEventsPublic } from "@/lib/data/lessons";
import { PageHead } from "@/components/shell/page-head";
import { PeopleTable } from "@/components/settings/people-table";
import { BandsForm } from "@/components/settings/bands-form";
import { AddPersonDialog } from "@/components/settings/add-person-dialog";
import { ScheduleSettingsPanel, type CohortScheduleOption } from "@/components/settings/schedule-settings-panel";
import { SettingsTabs } from "@/components/settings/settings-tabs";

/** Admin-only. `requireRole` throws a plain Error for the wrong role, which
 * would surface as a raw error page — so we read the user ourselves and
 * render Next's real 404 instead. */
export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();

  const supabase = await createClient();
  const [people, scopesByUser, bands, cohorts] = await Promise.all([
    getPeople(supabase),
    getCohortScopesByUser(supabase),
    getBands(supabase),
    listCohorts(supabase),
  ]);

  // Cohort counts are tiny (2-3 cohorts) — same tradeoff as the Cohorts
  // list page: a couple of extra queries per cohort here beats a bespoke
  // client-side fetch just for this one panel.
  const scheduleOptions: CohortScheduleOption[] = await Promise.all(
    cohorts.map(async (cohort) => {
      const [segments, lessons] = await Promise.all([
        getScheduleSegments(supabase, cohort.id),
        getLessonEventsPublic(supabase, cohort.id),
      ]);
      const nextLesson = lessons.find((l) => !l.recorded) ?? null;
      return {
        cohortId: cohort.id,
        cohortName: cohort.name,
        cohort: {
          startDate: cohort.startDate,
          teachingDays: cohort.teachingDays,
          lessonsPerSession: cohort.lessonsPerSession,
          intervalWeeks: cohort.intervalWeeks,
        },
        segments,
        nextLesson: nextLesson
          ? { eventId: nextLesson.eventId, lessonRef: nextLesson.lessonRef, globalIndex: nextLesson.globalIndex }
          : null,
      };
    })
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Settings" subtitle="Roles, thresholds, and cohort schedules" />
      <SettingsTabs
        people={
          <PeopleTable
            people={people}
            scopesByUser={scopesByUser}
            cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))}
            currentUserId={user.id}
            headerAction={<AddPersonDialog cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))} />}
          />
        }
        bands={<BandsForm bands={bands} />}
        schedule={<ScheduleSettingsPanel options={scheduleOptions} />}
      />
    </div>
  );
}
