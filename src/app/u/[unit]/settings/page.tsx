import { notFound } from "next/navigation";
import { PageHead } from "@/components/shell/page-head";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SettingsLayout, type SettingsSection } from "@/components/ui/settings-layout";
import { childrenLabelFor, unitHref } from "@/components/shell/org-nav";
import { ProgrammePolicy } from "@/components/network/programme-policy";
import { ScheduleSettingsPanel, type CohortScheduleOption } from "@/components/settings/schedule-settings-panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { getScheduleSegments, listCohortsInUnits } from "@/lib/data/cohorts";
import { getLessonEvents } from "@/lib/data/lessons";
import { getAllUnits, getPolicyVersions, getUnitLeaderContacts, requireUnit } from "@/lib/data/org";
import { todayISO } from "@/lib/utils";
import { systemCapabilities, unitCapabilities } from "@/lib/authz";
import { ancestryOf, descendantsOf, LEVELS } from "@/lib/domain/levels";
import type { OrgUnitType } from "@/lib/domain/types";
import { DETAIL_META, EditDetailsDialog } from "@/components/network/unit-details-form";

/** Levels that run cohorts day to day and so manage their schedules. */
// HQ too: the administrator can change any cohort's schedule.
const SCHEDULE_LEVELS: OrgUnitType[] = ["hq", "site", "promotion"];

/** A level's settings: the network-wide programme policy (read-only except
 * for administrators — one policy everywhere), and, at church and promotion
 * level, changing a cohort's teaching schedule. */
export default async function LevelSettingsPage({ params }: { params: Promise<{ unit: string }> }) {
  const { unit: slug } = await params;
  const { unit } = await requireUnit(slug);
  // The level's own leader, or a leader above it (authz/policy).
  const caps = await unitCapabilities(unit);
  if (!caps.has("manage_settings")) notFound();

  const [units, versions, systemCaps] = await Promise.all([getAllUnits(), getPolicyVersions(), systemCapabilities()]);
  const ancestors = ancestryOf(unit, units).slice(0, -1);

  let scheduleOptions: CohortScheduleOption[] = [];
  const showSchedules = SCHEDULE_LEVELS.includes(unit.type) && caps.has("manage_schedule");
  if (showSchedules) {
    // Service role, after the manage_schedule check above.
    const admin = createAdminClient();
    const inside = [unit, ...descendantsOf(unit, units)];
    const byId = new Map(inside.map((u) => [u.id, u]));
    const cohorts = (await listCohortsInUnits(admin, inside.map((u) => u.id))).filter((c) => c.status !== "complete");
    scheduleOptions = await Promise.all(
      cohorts.map(async (cohort) => {
        const [segments, lessons] = await Promise.all([getScheduleSegments(admin, cohort.id), getLessonEvents(admin, cohort.id)]);
        const nextLesson = lessons.find((l) => l.register.recordedAt == null) ?? null;
        const home = cohort.orgUnitId ? byId.get(cohort.orgUnitId) : undefined;
        return {
          cohortId: cohort.id,
          cohortName: home && home.id !== unit.id ? `${home.name} › ${cohort.name.trim()}` : cohort.name.trim(),
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
  }

  const leaders = (await getUnitLeaderContacts()).get(unit.id) ?? [];
  // Same check as the server action (manage_org_structure on this level).
  const canEditDetails = caps.has("manage_org_structure");
  const details = Object.entries(unit.details ?? {}).filter(([, v]) => v != null && v !== "");
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 border-t border-divider py-2.5 first:border-t-0">
      <span className="text-[13px] text-ink-tertiary">{label}</span>
      <span className="text-right text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
  const linkButton = (href: string, text: string) => (
    <Link href={href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
      {text}
    </Link>
  );

  const sections: SettingsSection[] = [
    {
      id: "organisation",
      label: "Organisation",
      description: `This ${LEVELS[unit.type].label.toLowerCase()} and who answers for it.`,
      content: (
        <Card className="px-[18px] py-2">
          {row("Name", unit.name)}
          {row("Level", LEVELS[unit.type].label)}
          {ancestors.length > 0 && row("Part of", ancestors.map((a) => a.name).join(" › "))}
          {row("Responsible", leaders.length ? leaders.map((l) => l.name).join(", ") : "Not assigned")}
          {details.map(([k, v]) => row(DETAIL_META[k as keyof typeof DETAIL_META]?.label ?? k, String(v)))}
          <div className="flex flex-wrap gap-2 border-t border-divider py-3">
            {canEditDetails && <EditDetailsDialog unitId={unit.id} unitName={unit.name} type={unit.type} details={unit.details ?? {}} />}
            {linkButton(unitHref(unit.slug, "children"), `Manage ${childrenLabelFor(unit.type).toLowerCase()}`)}
          </div>
        </Card>
      ),
    },
    {
      id: "programme",
      label: "Programme rules",
      description: "Attendance thresholds, the inactive rule and graduation — one policy for the whole network.",
      // One network-wide policy: shown to every level, changed only by administrators.
      content: <ProgrammePolicy versions={versions} today={todayISO()} canEdit={systemCaps.has("manage_policy")} />,
    },
    ...(showSchedules
      ? [
          {
            id: "schedule",
            label: "Schedules",
            description: "Teaching days and pace for the cohorts this level runs.",
            content: (
              <Card className="overflow-hidden">
                <CardHeader>
                  <div>
                    <CardTitle>Cohort schedule</CardTitle>
                    <CardSubtitle>A change applies from today; earlier lessons keep their plan.</CardSubtitle>
                  </div>
                </CardHeader>
                <div className="px-[18px] py-4">
                  {scheduleOptions.length ? (
                    <ScheduleSettingsPanel options={scheduleOptions} />
                  ) : (
                    <p className="py-4 text-center text-[13px] text-ink-muted">No running or upcoming cohorts here.</p>
                  )}
                </div>
              </Card>
            ),
          },
        ]
      : []),
    {
      id: "staff",
      label: "Staff & access",
      description: "Who works here and what they can do.",
      content: (
        <Card className="px-[18px] py-4">
          <p className="text-[13px] text-ink-secondary">
            Appoint, move and invite the people responsible for the levels directly below this one on the Staff page.
            {systemCaps.has("manage_accounts") ? " Sign-in accounts are managed under Accounts." : ""}
          </p>
          <div className="mt-3 flex gap-2">
            {unit.type !== "promotion" && linkButton(unitHref(unit.slug, "staff"), "Open Staff")}
            {systemCaps.has("manage_accounts") && linkButton("/settings", "Open Accounts")}
          </div>
        </Card>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Settings" subtitle={unit.name} />
      <SettingsLayout sections={sections} />
    </div>
  );
}

