-- create_cohort_with_schedule has never set student.enrolled_at, so every
-- CSV-imported student silently got the column default (now() — the exact
-- moment the cohort row was created) instead of the cohort's own
-- start_date. aggregateCohort (metrics.ts) excludes any lesson before a
-- student's enrolled_at from their own expected/attended totals — so a
-- cohort entered into the system any time after its real start date left
-- every one of its students permanently reading "Not started", no matter
-- how correctly those lessons get recorded.
--
-- Fix, two parts:
-- 1. New cohorts: enrolled_at defaults to the cohort's start_date, not
--    the insert moment.
-- 2. Existing cohorts: backfill only the rows that are unambiguously the
--    bug (enrolled_at within 5 minutes of the cohort's own created_at —
--    i.e. never touched since the bulk import — *and* dated after the
--    cohort's start_date). A student deliberately enrolled later (e.g.
--    added mid-cohort, or backdated by hand for a specific reason) has an
--    enrolled_at nowhere near their cohort's creation timestamp and is
--    left exactly as it is.

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
  insert into cohort (name, city, start_date, teaching_days, lessons_per_session, status, slug)
  values (p_name, p_city, p_start_date, p_teaching_days, p_lessons_per_session, 'running', generate_cohort_slug(p_name))
  returning id into v_cohort_id;

  if jsonb_array_length(p_students) > 0 then
    insert into student (
      cohort_id, full_name, full_name_raw, email, email_verified, whatsapp,
      country, country_raw, city, extra, dob_day, dob_month, registered_at, enrolled_at
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
      s->>'city',
      s->'extra',
      nullif(s->>'dob_day', '')::int,
      nullif(s->>'dob_month', '')::int,
      nullif(s->>'registered_at', '')::timestamptz,
      p_start_date::timestamptz
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

update student s
set enrolled_at = c.start_date::timestamptz
from cohort c
where s.cohort_id = c.id
  and s.left_at is null
  and abs(extract(epoch from (s.enrolled_at - c.created_at))) < 300
  and s.enrolled_at::date > c.start_date;
