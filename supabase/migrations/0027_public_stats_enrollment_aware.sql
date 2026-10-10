-- cohort_lesson_public_stats (the teacher's totals-only attendance view)
-- counted every active student as "expected" at every lesson, including
-- students who joined the cohort after that lesson happened. The app's own
-- calculation (lessonSeats / aggregateCohort) only counts a student for
-- lessons on or after their enrolment date, so a teacher and a facilitator
-- looking at the same cohort saw different percentages.
--
-- Same rule here now: per lesson, `enrolled` = active students who had
-- joined by the lesson's date, and `present` only counts those students.
-- Return shape is unchanged, so callers need no change.
create or replace function cohort_lesson_public_stats(p_cohort uuid)
returns table (
  event_id uuid, present int, absent int, rate int,
  enrolled int, recorded boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_cohort_access(p_cohort) then
    return;
  end if;

  return query
  select
    e.id,
    coalesce(pc.present_count, 0)::int,
    (coalesce(ec.n, 0) - coalesce(pc.present_count, 0))::int,
    case when coalesce(ec.n, 0) > 0
      then round(coalesce(pc.present_count, 0)::numeric / ec.n * 100)::int
      else 0
    end,
    coalesce(ec.n, 0)::int,
    (r.recorded_at is not null)
  from event e
  join register r on r.event_id = e.id
  left join lateral (
    select count(*) as n
    from student s
    where s.cohort_id = p_cohort
      and s.left_at is null
      and s.enrolled_at::date <= e.event_date
  ) ec on true
  left join lateral (
    select count(*) as present_count
    from jsonb_each(r.attendance) kv
    join student s on s.id = kv.key::uuid
    where kv.value = '"present"'
      and s.cohort_id = p_cohort
      and s.left_at is null
      and s.enrolled_at::date <= e.event_date
  ) pc on true
  where e.cohort_id = p_cohort and e.kind = 'lesson';
end;
$$;

grant execute on function cohort_lesson_public_stats(uuid) to authenticated;
