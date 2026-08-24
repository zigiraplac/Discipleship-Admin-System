-- Quiz tracking is dropped entirely — not part of what this ministry wants
-- tracked. Removes the columns and folds cohort_lesson_public_stats() back
-- down to attendance-only.

alter table lesson drop column if exists has_quiz;
alter table register drop column if exists quiz;

-- Return shape lost a column (quiz_avg) — Postgres won't let create-or-replace
-- change OUT-parameter shape, so drop first.
drop function if exists cohort_lesson_public_stats(uuid);

create function cohort_lesson_public_stats(p_cohort uuid)
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

  select count(*) into v_enrolled from student where cohort_id = p_cohort;

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
    where kv.value = '"present"'
  ) pc on true
  where e.cohort_id = p_cohort and e.kind = 'lesson';
end;
$$;

grant execute on function cohort_lesson_public_stats(uuid) to authenticated;
