-- cohort_lesson_public_stats (teacher's read-only attendance numbers)
-- had the same bug just fixed on the client side for facilitator/admin:
-- `enrolled` counted every student row regardless of left_at, and
-- `present` counted every key in the attendance jsonb blob regardless of
-- whether that student is still active — so a lesson where a since-left
-- student was marked present kept inflating the rate even after they
-- stopped counting everywhere else. Same fix: exclude left_at students
-- from both the enrolled denominator and the present numerator.
create or replace function cohort_lesson_public_stats(p_cohort uuid)
returns table (
  event_id uuid, present int, absent int, rate int,
  enrolled int, recorded boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_enrolled int;
begin
  if not has_cohort_access(p_cohort) then
    return;
  end if;

  select count(*) into v_enrolled from student where cohort_id = p_cohort and left_at is null;

  return query
  select
    e.id,
    coalesce(pc.present_count, 0)::int,
    coalesce(v_enrolled, 0) - coalesce(pc.present_count, 0)::int,
    case when v_enrolled > 0
      then round(coalesce(pc.present_count, 0)::numeric / v_enrolled * 100)::int
      else 0
    end,
    coalesce(v_enrolled, 0),
    (r.recorded_at is not null)
  from event e
  join register r on r.event_id = e.id
  left join lateral (
    select count(*) as present_count
    from jsonb_each(r.attendance) kv
    join student s on s.id = kv.key::uuid
    where kv.value = '"present"' and s.left_at is null
  ) pc on true
  where e.cohort_id = p_cohort and e.kind = 'lesson';
end;
$$;
