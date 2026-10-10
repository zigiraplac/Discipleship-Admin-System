-- Enrolment history: when a student joined, left and came back, as dated
-- facts. Attendance is owed for a lesson only while the student was
-- enrolled on that lesson's date — so leaving no longer erases what they
-- attended before, and joining late never counts earlier lessons.
--
-- student.enrolled_at / left_at stay as the current-state cache the app
-- already reads; this table is the history behind them.
--
-- Before: record_outcome_and_sync_left set left_at = now() on "left" and
-- cleared it whenever the *latest* outcome was anything else. Now only a
-- leaving or returning decision changes enrolment, and each one is kept.

create table student_enrolment_event (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references student on delete cascade,
  cohort_id    uuid not null references cohort on delete cascade,
  kind         text not null check (kind in ('joined', 'left', 'returned')),
  effective_on date not null,
  reason       text,
  recorded_by  uuid references app_user,
  recorded_at  timestamptz not null default now()
);

create index on student_enrolment_event (student_id, effective_on, recorded_at);
create index on student_enrolment_event (cohort_id);

alter table student_enrolment_event enable row level security;

-- Same visibility as the student roster; a reason for leaving is shown only
-- on pastoral pages, which already require pastoral access.
create policy student_enrolment_event_read on student_enrolment_event
  for select using (has_cohort_access(cohort_id));
create policy student_enrolment_event_write on student_enrolment_event
  for insert with check (can_write_pastoral(cohort_id));

-- ── backfill ──────────────────────────────────────────────────────────────
-- joined: from enrolled_at.
insert into student_enrolment_event (student_id, cohort_id, kind, effective_on, recorded_at)
select id, cohort_id, 'joined', enrolled_at::date, enrolled_at from student;

-- left / returned: replay each student's outcomes in order, exactly as the
-- old function interpreted them (left → leaves; anything after a left →
-- comes back), so the history matches what the app has been showing.
do $$
declare
  o record;
  v_left boolean;
  v_student uuid := null;
begin
  for o in select student_id, cohort_id, kind, recorded_at, recorded_by from outcome order by student_id, recorded_at loop
    if v_student is distinct from o.student_id then
      v_student := o.student_id;
      v_left := false;
    end if;
    if o.kind = 'left' and not v_left then
      insert into student_enrolment_event (student_id, cohort_id, kind, effective_on, recorded_by, recorded_at)
      values (o.student_id, o.cohort_id, 'left', o.recorded_at::date, o.recorded_by, o.recorded_at);
      v_left := true;
    elsif o.kind <> 'left' and v_left then
      insert into student_enrolment_event (student_id, cohort_id, kind, effective_on, recorded_by, recorded_at)
      values (o.student_id, o.cohort_id, 'returned', o.recorded_at::date, o.recorded_by, o.recorded_at);
      v_left := false;
    end if;
  end loop;
end $$;

-- A left_at with no matching "left" outcome (set some other way) still
-- needs its history row.
insert into student_enrolment_event (student_id, cohort_id, kind, effective_on, recorded_at)
select s.id, s.cohort_id, 'left', s.left_at::date, s.left_at
from student s
where s.left_at is not null
  and not exists (select 1 from student_enrolment_event e where e.student_id = s.id and e.kind = 'left');

-- ── keeping it current ────────────────────────────────────────────────────
-- Every new student gets a "joined" row; a corrected start date moves it
-- (and the change is in audit_log, so it's never silent).
create or replace function student_enrolment_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into student_enrolment_event (student_id, cohort_id, kind, effective_on, recorded_by, recorded_at)
  values (new.id, new.cohort_id, 'joined', new.enrolled_at::date, auth.uid(), now());
  return new;
end;
$$;

create trigger student_enrolment_joined
  after insert on student
  for each row execute function student_enrolment_on_insert();

create or replace function student_enrolment_on_start_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.enrolled_at::date is distinct from old.enrolled_at::date then
    update student_enrolment_event
      set effective_on = new.enrolled_at::date
      where id = (
        select id from student_enrolment_event
        where student_id = new.id and kind = 'joined'
        order by effective_on, recorded_at limit 1
      );
    insert into audit_log (actor_id, entity, entity_id, cohort_id, action, before, after)
    values (auth.uid(), 'student', new.id::text, new.cohort_id, 'enrolled_on',
            jsonb_build_object('enrolled_on', old.enrolled_at::date),
            jsonb_build_object('enrolled_on', new.enrolled_at::date));
  end if;
  return new;
end;
$$;

create trigger student_enrolment_start_change
  after update of enrolled_at on student
  for each row execute function student_enrolment_on_start_change();

-- Outcomes: a "left" decision ends enrolment (on p_effective_on, default
-- today); a catch-up or resolved decision for someone who had left means
-- they came back. Any other outcome leaves enrolment alone.
drop function if exists record_outcome_and_sync_left(uuid, uuid, text, uuid);

create or replace function record_outcome_and_sync_left(
  p_student_id uuid,
  p_cohort_id uuid,
  p_kind text,
  p_actor uuid,
  p_effective_on date default null
)
returns void
language plpgsql
as $$
declare
  v_left_at timestamptz;
  v_on date := coalesce(p_effective_on, current_date);
begin
  select left_at into v_left_at from student where id = p_student_id for update;

  insert into outcome (student_id, cohort_id, kind, recorded_by)
  values (p_student_id, p_cohort_id, p_kind, p_actor);

  if p_kind = 'left' and v_left_at is null then
    insert into student_enrolment_event (student_id, cohort_id, kind, effective_on, recorded_by)
    values (p_student_id, p_cohort_id, 'left', v_on, p_actor);
    update student set left_at = v_on::timestamptz where id = p_student_id;
  elsif p_kind <> 'left' and v_left_at is not null then
    insert into student_enrolment_event (student_id, cohort_id, kind, effective_on, recorded_by)
    values (p_student_id, p_cohort_id, 'returned', v_on, p_actor);
    update student set left_at = null where id = p_student_id;
  end if;
end;
$$;

-- ── teacher view uses the same rule ──────────────────────────────────────
-- Per lesson: enrolled = students enrolled on that date (including anyone
-- who left later); present only counts those students. Unrecorded lessons
-- report recorded = false and are left out of attendance by the app.
create or replace function student_enrolled_on(p_student uuid, p_on date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select e.kind in ('joined', 'returned')
    from student_enrolment_event e
    -- the latest change on or before the lesson date decides; a leave
    -- takes effect from its own date (lessons that day aren't owed)
    where e.student_id = p_student and e.effective_on <= p_on
    order by e.effective_on desc, e.recorded_at desc
    limit 1
  ), false);
$$;

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
    where s.cohort_id = p_cohort and student_enrolled_on(s.id, e.event_date)
  ) ec on true
  left join lateral (
    select count(*) as present_count
    from jsonb_each(r.attendance) kv
    join student s on s.id = kv.key::uuid
    where kv.value = '"present"'
      and s.cohort_id = p_cohort
      and student_enrolled_on(s.id, e.event_date)
  ) pc on true
  where e.cohort_id = p_cohort and e.kind = 'lesson';
end;
$$;

grant execute on function cohort_lesson_public_stats(uuid) to authenticated;
