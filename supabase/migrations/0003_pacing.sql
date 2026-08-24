-- Per-cohort teaching pace: how many lessons a single study session covers.
-- Defaults to 1 so every cohort created before this migration keeps its
-- already-generated schedule exactly as is; new cohorts choose this in the
-- wizard (default 2, per the product's stated ideal pace).
alter table cohort
  add column if not exists lessons_per_session smallint not null default 1
  check (lessons_per_session >= 1 and lessons_per_session <= 5);

-- No new RLS policy for postponing a lesson: the write goes through the
-- `postponeLesson` server action using the service-role client, the same
-- pattern `createCohort` already uses — permission (admin, or a
-- facilitator who is actually a member of that cohort) is checked in
-- application code before the write, not via a table policy.
