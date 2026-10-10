-- A catch-up is a recovery, not a rewrite of what happened.
--
-- Before: marking a lesson as caught up flipped the student's register mark
-- from absent to present (set_attendance_mark), so the original absence was
-- lost, and a later register correction could flip it back while the
-- lesson_catchup row stayed — two tables saying different things.
--
-- Now: the register always holds what happened on the day; lesson_catchup
-- is the separate record that the absence was made up. Both are enforced
-- here in the database, not only in the app.

-- ── restore the original absences ────────────────────────────────────────
-- Every existing catch-up was created from an absence (the old action
-- refused anything else, and each one has a catchup_mark audit entry), so
-- the true original mark is "absent". Keep a record of the change first.
insert into audit_log (actor_id, entity, entity_id, cohort_id, action, before, after)
select null, 'register', lc.event_id::text, e.cohort_id, 'catchup_restore_absence',
       jsonb_build_object('student_id', lc.student_id, 'mark', r.attendance -> (lc.student_id::text)),
       jsonb_build_object('student_id', lc.student_id, 'mark', 'absent')
from lesson_catchup lc
join register r on r.event_id = lc.event_id
join event e on e.id = lc.event_id
where r.attendance ->> (lc.student_id::text) = 'present';

update register r
set attendance = jsonb_set(r.attendance, array[lc.student_id::text], '"absent"')
from lesson_catchup lc
where lc.event_id = r.event_id
  and r.attendance ->> (lc.student_id::text) = 'present';

-- ── guards ───────────────────────────────────────────────────────────────
-- 1. A catch-up needs a recorded register where the student was absent.
create or replace function lesson_catchup_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_recorded timestamptz;
  v_mark text;
begin
  select recorded_at, attendance ->> (new.student_id::text) into v_recorded, v_mark
  from register where event_id = new.event_id;
  if v_recorded is null then
    raise exception 'This lesson has no recorded register yet.' using errcode = 'P0001';
  end if;
  if v_mark = 'present' then
    raise exception 'This student was present at this lesson, so there is nothing to catch up.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger lesson_catchup_requires_absence
  before insert or update on lesson_catchup
  for each row execute function lesson_catchup_check();

-- 2. A register edit can't turn a caught-up absence into "present" — that
--    would silently contradict the catch-up. Remove the catch-up first.
create or replace function register_catchup_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_conflicts int;
begin
  select count(*) into v_conflicts
  from lesson_catchup lc
  where lc.event_id = new.event_id
    and new.attendance ->> (lc.student_id::text) = 'present';
  if v_conflicts > 0 then
    raise exception 'CATCHUP_CONFLICT: % caught-up student(s) can''t be marked present on this lesson. Undo their catch-up first.', v_conflicts
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger register_keeps_catchups
  before update of attendance on register
  for each row execute function register_catchup_guard();

-- ── rule history ─────────────────────────────────────────────────────────
-- Status bands and the inactive rule can change. Calculations use today's
-- rule, but every change is kept with when it took effect, so a past
-- report can always be read against the rule in force at the time.
create table rule_change (
  id             bigserial primary key,
  org_unit_id    uuid references org_unit on delete cascade, -- null = network default
  key            text not null check (key in ('bands', 'inactive_streak')),
  value          jsonb,                                       -- null = back to inherited
  effective_from timestamptz not null default now(),
  changed_by     uuid references app_user
);

create index on rule_change (org_unit_id, key, effective_from desc);

alter table rule_change enable row level security;
create policy rule_change_read on rule_change for select using (auth.uid() is not null);

-- Baseline: the rules in force when history starts.
insert into rule_change (org_unit_id, key, value, effective_from)
select null, 'bands',
       jsonb_build_object(
         'activeThreshold', (select value from org_setting where key = 'band_active_threshold'),
         'helpThreshold', (select value from org_setting where key = 'band_help_threshold')),
       now()
where exists (select 1 from org_setting where key = 'band_active_threshold');

insert into rule_change (org_unit_id, key, value, effective_from)
select null, 'inactive_streak', value, now() from org_setting where key = 'inactive_streak';

insert into rule_change (org_unit_id, key, value, effective_from)
select id, 'bands', settings -> 'bands', now() from org_unit where settings ? 'bands';
insert into rule_change (org_unit_id, key, value, effective_from)
select id, 'inactive_streak', settings -> 'inactiveStreak', now() from org_unit where settings ? 'inactiveStreak';
