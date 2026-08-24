-- BCC Console — initial schema
-- Source spec: 02-domain-model.md, 06-roles-and-permissions.md, 08-backend-notes.md
--
-- RBAC design note: RLS is row-level, but one rule in 06-roles-and-permissions.md
-- is column-shaped — teachers may see cohort-wide attendance/quiz *aggregates*
-- (Lessons, Dashboard chart, Calendar chip, Reports) but never the per-student
-- `register.attendance` / `register.quiz` maps or the `outcome` history. Plain
-- table RLS can't express "this role sees the count but not the rows", so the
-- `register` table is closed to teachers entirely and a SECURITY DEFINER
-- function (`lesson_public_stats`) hands back only the aggregate to any role
-- with cohort visibility. Everything else is ordinary row-level scoping.

create extension if not exists "pgcrypto";

-- ───────────────────────── reference data ─────────────────────────

create table class (
  id            smallint primary key,          -- 1..7
  title         text not null,
  part_note     text,                          -- 'Warfare 11 · Listening 5'
  lesson_count  smallint not null,
  position      smallint not null
);

create table lesson (
  id             bigserial primary key,
  class_id       smallint not null references class,
  index_in_class smallint not null,             -- 1..n — the L in "C3 · L7"
  global_index   smallint not null unique,      -- 0..79 — calendar order
  title          text not null,
  has_quiz       boolean not null default false -- global_index % 4 = 3
);

-- ───────────────────────── people ─────────────────────────

create table app_user (
  id     uuid primary key references auth.users on delete cascade,
  name   text not null,
  email  text not null unique,
  role   text not null check (role in ('facilitator', 'admin', 'teacher', 'leadership')),
  state  text not null default 'active' check (state in ('active', 'invited')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── cohorts & students ─────────────────────────

create table cohort (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  city           text,
  start_date     date not null,
  teaching_days  smallint[] not null,           -- 0=Sun .. 6=Sat
  facilitator_id uuid references app_user,
  status         text not null default 'running' check (status in ('running', 'complete', 'archived')),
  created_at     timestamptz not null default now()
);

create table cohort_member (
  cohort_id uuid not null references cohort on delete cascade,
  user_id   uuid not null references app_user on delete cascade,
  capacity  text not null check (capacity in ('facilitator', 'teacher')),
  primary key (cohort_id, user_id, capacity)
);

create table student (
  id             uuid primary key default gen_random_uuid(),
  cohort_id      uuid not null references cohort on delete cascade,
  full_name      text not null,
  full_name_raw  text,
  email          text,
  email_verified boolean not null default false,
  whatsapp       text,
  country        text,
  country_raw    text,
  dob_day        smallint,
  dob_month      smallint,
  registered_at  timestamptz,
  enrolled_at    timestamptz not null default now(),
  left_at        timestamptz
);

-- ───────────────────────── calendar & attendance ─────────────────────────

create table event (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid not null references cohort on delete cascade,
  kind         text not null check (kind in ('lesson', 'crusade')),
  event_date   date not null,
  lesson_id    bigint references lesson,          -- kind='lesson'
  after_class  smallint,                          -- kind='crusade', 1..7
  crusade_day  smallint,                          -- kind='crusade', 0..2
  edited       boolean not null default false,    -- protects manual edits from regeneration
  created_at   timestamptz not null default now()
);

create table register (
  event_id     uuid primary key references event on delete cascade,
  attendance   jsonb not null default '{}',       -- { student_id: 'present' | 'absent' }
  quiz         jsonb not null default '{}',        -- { student_id: 0..100 }
  recorded_by  uuid references app_user,
  recorded_at  timestamptz,
  updated_by   uuid references app_user,
  updated_at   timestamptz
);

create table outcome (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references student on delete cascade,
  cohort_id   uuid not null references cohort on delete cascade,
  kind        text not null check (kind in ('catchup', 'continuing', 'left')),
  note        text,
  recorded_by uuid not null references app_user,
  recorded_at timestamptz not null default now()
);

create table crusade_report (
  id            uuid primary key default gen_random_uuid(),
  cohort_id     uuid not null references cohort on delete cascade,
  after_class   smallint not null,
  souls_reached int,
  conversions   int,
  followups     int,
  notes         text
);

create table org_setting (
  key   text primary key,
  value jsonb not null
);

create table audit_log (
  id         bigserial primary key,
  actor_id   uuid references app_user,
  entity     text not null,
  entity_id  text not null,
  action     text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

create index on event (cohort_id, event_date);
create index on event (cohort_id, kind, event_date);
create index on student (cohort_id);
create index on outcome (student_id, recorded_at desc);
create index on outcome (cohort_id, recorded_at desc);
create index on register using gin (attendance);
create index on cohort_member (user_id);

insert into org_setting (key, value) values
  ('band_active_threshold', '85'),
  ('band_help_threshold', '60');

-- ───────────────────────── RBAC helpers ─────────────────────────

create or replace function current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role from app_user where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from app_user where id = auth.uid()), false);
$$;

create or replace function is_leadership() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'leadership' from app_user where id = auth.uid()), false);
$$;

-- Any role that may see this cohort exists at all (admin, leadership, or a
-- facilitator/teacher assigned to it). No pastoral guarantee.
create or replace function has_cohort_access(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_leadership() or exists (
    select 1 from cohort_member m where m.cohort_id = p_cohort and m.user_id = auth.uid()
  );
$$;

-- Facilitator/admin/leadership only — excludes teacher. Gates registers,
-- outcomes, and anything else that reveals a specific student's standing.
create or replace function has_pastoral_access(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_leadership() or exists (
    select 1 from cohort_member m
    where m.cohort_id = p_cohort and m.user_id = auth.uid() and m.capacity = 'facilitator'
  );
$$;

-- Facilitator/admin only — the write-capable pastoral roles (leadership is read-only).
create or replace function can_write_pastoral(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from cohort_member m
    where m.cohort_id = p_cohort and m.user_id = auth.uid() and m.capacity = 'facilitator'
  );
$$;

-- ───────────────────────── row level security ─────────────────────────

alter table class enable row level security;
alter table lesson enable row level security;
alter table app_user enable row level security;
alter table cohort enable row level security;
alter table cohort_member enable row level security;
alter table student enable row level security;
alter table event enable row level security;
alter table register enable row level security;
alter table outcome enable row level security;
alter table crusade_report enable row level security;
alter table org_setting enable row level security;
alter table audit_log enable row level security;

-- reference data: readable by any authenticated user, written only by migrations
create policy class_read on class for select using (auth.role() = 'authenticated');
create policy lesson_read on lesson for select using (auth.role() = 'authenticated');

-- app_user: admin sees everyone (Settings → People); everyone sees their own row
create policy app_user_read_self on app_user for select using (id = auth.uid());
create policy app_user_read_admin on app_user for select using (is_admin());
create policy app_user_write_admin on app_user for all using (is_admin()) with check (is_admin());

-- cohort
create policy cohort_read on cohort for select using (has_cohort_access(id));
create policy cohort_write_admin on cohort for insert with check (is_admin());
create policy cohort_update_admin on cohort for update using (is_admin()) with check (is_admin());

-- cohort_member: admin sees all; a user can see their own memberships (nav/scoping)
create policy cohort_member_read_self on cohort_member for select using (user_id = auth.uid());
create policy cohort_member_read_admin on cohort_member for select using (is_admin());
create policy cohort_member_write_admin on cohort_member for all using (is_admin()) with check (is_admin());

-- student: no pastoral fields live here (roster/contact only) — every
-- cohort-visible role may read it, including teacher (Calendar birthdays).
create policy student_read on student for select using (has_cohort_access(cohort_id));
create policy student_write_admin on student for insert with check (is_admin());
create policy student_update on student for update
  using (can_write_pastoral(cohort_id)) with check (can_write_pastoral(cohort_id));

-- event: dates/kind only, no pastoral content — same visibility as cohort.
create policy event_read on event for select using (has_cohort_access(cohort_id));
create policy event_write_admin on event for insert with check (is_admin());
create policy event_update_admin on event for update using (is_admin()) with check (is_admin());

-- register: the sensitive table — facilitator/admin/leadership only.
-- Teachers get aggregates via lesson_public_stats(), never these rows.
create policy register_read on register for select using (
  has_pastoral_access((select cohort_id from event where event.id = register.event_id))
);
create policy register_write on register for all using (
  can_write_pastoral((select cohort_id from event where event.id = register.event_id))
) with check (
  can_write_pastoral((select cohort_id from event where event.id = register.event_id))
);

-- outcome: append-only pastoral history — facilitator/admin write, leadership read.
create policy outcome_read on outcome for select using (has_pastoral_access(cohort_id));
create policy outcome_write on outcome for insert with check (can_write_pastoral(cohort_id));

-- crusade_report
create policy crusade_report_read on crusade_report for select using (has_cohort_access(cohort_id));
create policy crusade_report_write on crusade_report for all
  using (can_write_pastoral(cohort_id)) with check (can_write_pastoral(cohort_id));

-- org_setting (status bands): read by anyone signed in, written by admin only
create policy org_setting_read on org_setting for select using (auth.role() = 'authenticated');
create policy org_setting_write_admin on org_setting for all using (is_admin()) with check (is_admin());

-- audit_log: admin only
create policy audit_log_read_admin on audit_log for select using (is_admin());
create policy audit_log_write_admin on audit_log for insert with check (is_admin());

-- ───────────────────────── aggregate-only access for teachers ─────────────────────────

-- One round trip for a whole cohort's lesson list/chart/calendar, rather
-- than N calls per lesson. `recorded` (was the register actually saved) is
-- not pastoral — it's safe to hand back alongside the counts.
create or replace function cohort_lesson_public_stats(p_cohort uuid)
returns table (
  event_id uuid, present int, absent int, rate int,
  quiz_avg numeric, enrolled int, recorded boolean
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
    qa.quiz_avg,
    coalesce(v_enrolled, 0),
    (r.recorded_at is not null)
  from event e
  join lesson l on l.id = e.lesson_id
  join register r on r.event_id = e.id
  left join lateral (
    select count(*) as present_count
    from jsonb_each(r.attendance) kv
    where kv.value = '"present"'
  ) pc on true
  left join lateral (
    select avg((kv.value)::numeric) as quiz_avg
    from jsonb_each_text(r.quiz) kv
    where r.attendance -> kv.key = '"present"'
  ) qa on l.has_quiz
  where e.cohort_id = p_cohort and e.kind = 'lesson';
end;
$$;

grant execute on function cohort_lesson_public_stats(uuid) to authenticated;

-- ───────────────────────── generation invariant ─────────────────────────

-- "Every generated lesson event is instantiated with empty embedded JSON
-- maps ready to accept student attendance and quiz scores" (08-backend-
-- notes.md) — enforced here, at the database, so it holds regardless of
-- which code path inserts the event.
create or replace function create_empty_register() returns trigger
language plpgsql as $$
begin
  if new.kind = 'lesson' then
    insert into register (event_id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger event_creates_register
  after insert on event
  for each row execute function create_empty_register();
