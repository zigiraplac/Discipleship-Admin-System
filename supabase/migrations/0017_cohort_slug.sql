-- Cohort URLs are keyed by raw uuid (/c/bf08ed64-9f2b-.../calendar) — not
-- something anyone can read or communicate. A slug generated from the
-- cohort's own name (e.g. "Cohort 01" -> "cohort-01") replaces it in
-- every link the app builds from now on.
--
-- The uuid keeps working as a fallback (application code tries slug, then
-- id) — notification rows already sitting in people's inboxes have a uuid
-- baked into their stored href, and nothing should 404 just because this
-- shipped.
alter table cohort add column slug text;

-- Shared by the backfill below and create_cohort_with_schedule, so slug
-- generation is defined exactly once. Collisions (two cohorts producing
-- the same base slug) get a numeric suffix.
create or replace function generate_cohort_slug(p_name text, p_exclude_id uuid default null)
returns text
language plpgsql set search_path = public as $$
declare
  base_slug text;
  candidate text;
  suffix int := 1;
begin
  base_slug := lower(regexp_replace(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));
  if base_slug = '' then
    base_slug := 'cohort';
  end if;

  candidate := base_slug;
  while exists (
    select 1 from cohort
    where slug = candidate and (p_exclude_id is null or id <> p_exclude_id)
  ) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

do $$
declare
  r record;
begin
  for r in select id, name from cohort where slug is null order by created_at loop
    update cohort set slug = generate_cohort_slug(r.name, r.id) where id = r.id;
  end loop;
end $$;

alter table cohort alter column slug set not null;
create unique index cohort_slug_key on cohort (slug);

-- New cohorts get a slug at creation time, same generator as the backfill.
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
