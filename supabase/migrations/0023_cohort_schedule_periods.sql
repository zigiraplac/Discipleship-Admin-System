-- A cohort's teaching cadence (which weekdays, how many lessons per
-- session, how many weeks between sessions) used to be fixed forever at
-- creation — the only edit tool, postponeLesson, reflows dates but always
-- with the cohort's *original* cadence. Leadership sometimes deliberately
-- slows or speeds up mid-course (e.g. weekly -> every two weeks); this
-- table records each such change as its own "segment" so pace tracking
-- judges each stretch of the cohort by whatever cadence was actually in
-- force at the time, instead of silently rewriting history the moment
-- cadence changes. `cohort.teaching_days`/`lessons_per_session` stay put as
-- the *original* (segment 0) cadence — never overwritten by a change, so
-- history stays replayable; "current" cadence is the latest row here, if
-- any, else the cohort's own base columns.

alter table cohort
  add column if not exists interval_weeks smallint not null default 1
  check (interval_weeks >= 1 and interval_weeks <= 8);

create table cohort_schedule_period (
  id                   uuid primary key default gen_random_uuid(),
  cohort_id            uuid not null references cohort on delete cascade,
  starts_at_position   smallint not null,   -- 0-based index into curriculumScheduleItems()
  teaching_days        smallint[] not null,
  lessons_per_session  smallint not null check (lessons_per_session >= 1 and lessons_per_session <= 5),
  interval_weeks       smallint not null default 1 check (interval_weeks >= 1 and interval_weeks <= 8),
  effective_date       date not null,
  reason               text,
  actor_id             uuid references app_user,
  created_at           timestamptz not null default now()
);

create index on cohort_schedule_period (cohort_id, starts_at_position);

alter table cohort_schedule_period enable row level security;

create policy cohort_schedule_period_read on cohort_schedule_period
  for select using (has_cohort_access(cohort_id));

-- No write policy: same pattern as `event` (0003_pacing.sql) — the write
-- goes through the `changeCohortSchedule` server action via the
-- service-role client; permission (admin, or a facilitator who's actually
-- a member of this cohort) is checked in application code.
