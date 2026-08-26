-- Cohort creation used to be three separate round trips from the server
-- action (insert cohort, insert students, insert events) — a failure
-- partway through (e.g. the event batch) could leave a cohort with
-- students but no schedule, with nothing to automatically notice or undo
-- it. A single Postgres function call is one implicit transaction: if
-- anything inside it raises, everything it did is rolled back, so this
-- makes "cohort + students + schedule" genuinely all-or-nothing.
--
-- Called only via the service-role client from createCohort() (already
-- gated on requireRole("admin") in application code before this runs), so
-- this doesn't need SECURITY DEFINER — the service role already bypasses
-- RLS regardless.
create or replace function create_cohort_with_schedule(
  p_name text,
  p_city text,
  p_start_date date,
  p_teaching_days smallint[],
  p_lessons_per_session smallint,
  p_students jsonb,
  p_events jsonb
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_cohort_id uuid;
begin
  insert into cohort (name, city, start_date, teaching_days, lessons_per_session, status)
  values (p_name, p_city, p_start_date, p_teaching_days, p_lessons_per_session, 'running')
  returning id into v_cohort_id;

  if jsonb_array_length(p_students) > 0 then
    insert into student (
      cohort_id, full_name, full_name_raw, email, email_verified, whatsapp,
      country, country_raw, dob_day, dob_month, registered_at
    )
    select
      v_cohort_id,
      s->>'full_name',
      s->>'full_name_raw',
      s->>'email',
      coalesce((s->>'email_verified')::boolean, false),
      s->>'whatsapp',
      s->>'country',
      s->>'country_raw',
      nullif(s->>'dob_day', '')::int,
      nullif(s->>'dob_month', '')::int,
      nullif(s->>'registered_at', '')::timestamptz
    from jsonb_array_elements(p_students) as s;
  end if;

  if jsonb_array_length(p_events) > 0 then
    insert into event (cohort_id, kind, event_date, lesson_id, after_class, crusade_day)
    select
      v_cohort_id,
      e->>'kind',
      (e->>'event_date')::date,
      nullif(e->>'lesson_id', '')::bigint,
      nullif(e->>'after_class', '')::int,
      nullif(e->>'crusade_day', '')::int
    from jsonb_array_elements(p_events) as e;
  end if;

  return v_cohort_id;
end;
$$;
