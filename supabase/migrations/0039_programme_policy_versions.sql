-- One programme policy for the whole network, kept as effective-dated,
-- immutable versions. Replaces the editable org_setting band keys, the
-- per-level overrides (org_unit.settings, 0032) and the rule_change log
-- (0034): a policy change is a new version from a date, never an edit.
--
-- Each version holds the attendance status bands, the inactive rule and
-- the graduation attendance threshold. A calculation for a date uses the
-- version in force on that date — so a later change (say On track 85% →
-- 70% from 2027) never re-interprets earlier periods.

create table programme_policy (
  version                          int primary key,
  effective_from                   date not null unique,
  on_track_threshold               int not null check (on_track_threshold between 1 and 100),
  needs_help_threshold             int not null check (needs_help_threshold between 0 and 99),
  inactive_streak                  int not null check (inactive_streak between 2 and 20),
  graduation_attendance_threshold  int not null check (graduation_attendance_threshold between 1 and 100),
  note                             text,
  created_by                       uuid references app_user,
  created_at                       timestamptz not null default now(),
  check (needs_help_threshold < on_track_threshold)
);

alter table programme_policy enable row level security;
create policy programme_policy_read on programme_policy for select using (auth.uid() is not null);
-- No write policies: new versions go through create_policy_version (admin).

-- Versions are history: never edited, never removed.
create or replace function programme_policy_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Policy versions cannot be changed or removed — create a new version instead.' using errcode = 'P0001';
end;
$$;

create trigger programme_policy_no_update before update on programme_policy
  for each row execute function programme_policy_immutable();
create trigger programme_policy_no_delete before delete on programme_policy
  for each row execute function programme_policy_immutable();

-- New versions are forward-only: from today or later, and after the latest
-- existing version.
create or replace function programme_policy_forward_only() returns trigger
language plpgsql as $$
declare
  v_last date;
begin
  select max(effective_from) into v_last from programme_policy;
  if v_last is not null and (new.effective_from <= v_last or new.effective_from < current_date) then
    raise exception 'A new policy version must start today or later, and after the current latest version (%).', v_last using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger programme_policy_forward before insert on programme_policy
  for each row execute function programme_policy_forward_only();

-- Version 1: the rules in force so far, from before any cohort started.
insert into programme_policy (version, effective_from, on_track_threshold, needs_help_threshold, inactive_streak, graduation_attendance_threshold, note)
values (
  1,
  least(date '2026-01-01', coalesce((select min(start_date) from cohort), date '2026-01-01')),
  coalesce((select (value #>> '{}')::int from org_setting where key = 'band_active_threshold'), 85),
  coalesce((select (value #>> '{}')::int from org_setting where key = 'band_help_threshold'), 60),
  coalesce((select (value #>> '{}')::int from org_setting where key = 'inactive_streak'), 3),
  85,
  'Initial programme policy'
);

-- Retire the old mechanisms (no level ever set its own rules).
delete from org_setting where key in ('band_active_threshold', 'band_help_threshold', 'inactive_streak');
alter table org_unit drop column settings;
drop table rule_change;
