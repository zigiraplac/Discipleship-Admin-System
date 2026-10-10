-- Visibility ≠ action, enforced in the database as well as the app
-- (src/lib/authz). Three tiers of data:
--   aggregate   — totals (level pages; read through the service role after
--                 an app-side check)
--   operational — cohorts, schedule, roster, attendance, catch-ups
--   pastoral    — follow-up outcomes and notes
--
-- Before: only admin/leadership and the cohort's own members could read a
-- cohort at all, so a country leader could never open a cohort or student
-- below them, and registers counted as pastoral (teachers couldn't read
-- or take them).
--
-- Now:
--   * Operational read: admin, leadership, the cohort's members, and anyone
--     with a role (leader or viewer) on the cohort's level or a level above.
--   * Pastoral read: unchanged — admin, leadership, the cohort's facilitators.
--   * Taking attendance: admin, and the cohort's facilitators *and* teachers.
--   * Pastoral writes (outcomes, follow-ups, student edits): unchanged —
--     admin and the cohort's facilitators.

-- Operational read now includes the levels above the cohort.
create or replace function has_cohort_access(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_admin() or is_leadership()
    or exists (select 1 from cohort_member m where m.cohort_id = p_cohort and m.user_id = auth.uid())
    or exists (
      select 1 from cohort c
      join org_unit cu on cu.id = c.org_unit_id
      join org_unit_member om on om.user_id = auth.uid()
      join org_unit mine on mine.id = om.org_unit_id
      where c.id = p_cohort and cu.path <@ mine.path
    );
$$;

-- Attendance is operational: readable wherever the cohort is.
drop policy if exists register_read on register;
create policy register_read on register for select using (
  has_cohort_access((select cohort_id from event where event.id = register.event_id))
);

drop policy if exists lesson_catchup_read on lesson_catchup;
create policy lesson_catchup_read on lesson_catchup for select using (
  has_cohort_access((select cohort_id from event where event.id = lesson_catchup.event_id))
);

-- Who may take or correct a register: admin, or any member of the cohort
-- (facilitator or teacher).
create or replace function can_record_attendance(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from cohort_member m where m.cohort_id = p_cohort and m.user_id = auth.uid()
  );
$$;

drop policy if exists register_write on register;
create policy register_write on register for all using (
  can_record_attendance((select cohort_id from event where event.id = register.event_id))
) with check (
  can_record_attendance((select cohort_id from event where event.id = register.event_id))
);

-- Names of the people running a cohort are operational too (shown on
-- cohort cards and dashboards to anyone who can see the cohort).
create policy cohort_member_read_scoped on cohort_member
  for select using (has_cohort_access(cohort_id));
