-- Organization levels above the cohort: HQ › Continent › Country › Region ›
-- Site (shown as "Church") › Promotion › Cohort.
--
-- Additive only: nothing about cohorts, students, registers, cohort_member
-- or their RLS changes. Cohorts gain a nullable `org_unit_id` pointing at
-- the promotion (or site) they belong to.
--
-- Access model (see can_view_unit / can_lead_unit below):
--   * admin and leadership keep seeing everything (they act as HQ);
--   * anyone else sees a box only if they have a role on it or on a box
--     above it (org_unit_member), and never anything beside or above it;
--   * upper levels get totals only — the app reads cohort rows for them
--     server-side after checking can_view_unit, and never sends student
--     rows to a level page.

create extension if not exists ltree with schema extensions;

create table org_unit (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references org_unit on delete restrict,
  type        text not null check (type in ('hq', 'continent', 'country', 'region', 'site', 'promotion')),
  name        text not null check (length(trim(name)) > 0),
  slug        text not null unique,
  -- Ancestry as a path of ids, kept up to date by triggers below, so
  -- "everything inside this box" is one indexed query.
  path        extensions.ltree not null,
  -- Level-specific details set at creation (time zone, languages, city,
  -- address, phone, start/end year, ...). Free-form on purpose: each level
  -- asks for different things.
  details     jsonb not null default '{}',
  created_by  uuid references app_user on delete set null,
  created_at  timestamptz not null default now()
);

create index org_unit_path_gist on org_unit using gist (path);
create index org_unit_parent on org_unit (parent_id);
create unique index org_unit_sibling_name on org_unit (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));

create table org_unit_member (
  org_unit_id uuid not null references org_unit on delete cascade,
  user_id     uuid not null references app_user on delete cascade,
  -- leader: sees progress and manages the box (adds boxes inside it,
  -- appoints their leaders). viewer: sees progress only.
  role        text not null check (role in ('leader', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (org_unit_id, user_id)
);
create index org_unit_member_user on org_unit_member (user_id);

alter table cohort add column org_unit_id uuid references org_unit on delete restrict;
create index cohort_org_unit on cohort (org_unit_id);

-- ───────────── path maintenance ─────────────

create or replace function org_unit_level_rank(p_type text) returns int
language sql immutable as $$
  select array_position(array['hq', 'continent', 'country', 'region', 'site', 'promotion'], p_type);
$$;

create or replace function org_unit_set_path() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  v_parent_path ltree;
  v_parent_type text;
begin
  if new.parent_id is null then
    if new.type <> 'hq' then
      raise exception 'Only HQ can sit at the top. A % needs a parent.', new.type;
    end if;
    new.path := text2ltree(replace(new.id::text, '-', '_'));
    return new;
  end if;

  if new.type = 'hq' then
    raise exception 'HQ cannot sit inside another box.';
  end if;

  select path, type into v_parent_path, v_parent_type from org_unit where id = new.parent_id;
  if v_parent_path is null then
    raise exception 'Parent box not found.';
  end if;
  -- A box must be a lower level than its parent. Skipping levels (e.g. a
  -- country directly under HQ) is allowed.
  if org_unit_level_rank(new.type) <= org_unit_level_rank(v_parent_type) then
    raise exception 'A % cannot sit inside a %.', new.type, v_parent_type;
  end if;
  if tg_op = 'UPDATE' and v_parent_path <@ old.path then
    raise exception 'A box cannot be moved inside itself.';
  end if;

  new.path := v_parent_path || text2ltree(replace(new.id::text, '-', '_'));
  return new;
end;
$$;

create trigger org_unit_path_before
  before insert or update of parent_id, type on org_unit
  for each row execute function org_unit_set_path();

-- Moving a box moves everything inside it.
create or replace function org_unit_move_subtree() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.path is distinct from old.path then
    update org_unit
      set path = new.path || subpath(path, nlevel(old.path))
      where path <@ old.path and id <> new.id;
  end if;
  return null;
end;
$$;

create trigger org_unit_path_after
  after update of path on org_unit
  for each row execute function org_unit_move_subtree();

-- A cohort can only sit in a promotion (or directly in a site).
create or replace function cohort_check_org_unit() returns trigger
language plpgsql set search_path = public as $$
declare
  v_type text;
begin
  if new.org_unit_id is null then
    return new;
  end if;
  select type into v_type from org_unit where id = new.org_unit_id;
  if v_type is null or v_type not in ('promotion', 'site') then
    raise exception 'A cohort must belong to a promotion or a church.';
  end if;
  return new;
end;
$$;

create trigger cohort_org_unit_check
  before insert or update of org_unit_id on cohort
  for each row execute function cohort_check_org_unit();

-- ───────────── access helpers ─────────────

-- Can the current user see this box (it, or a box above it, is theirs)?
create or replace function can_view_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_admin() or is_leadership() or exists (
    select 1
    from org_unit_member m
    join org_unit mine on mine.id = m.org_unit_id
    join org_unit target on target.id = p_unit
    where m.user_id = auth.uid() and target.path <@ mine.path
  );
$$;

-- Is this box above one of the current user's own boxes? Lets someone
-- read the names of the boxes they sit inside ("Part of Africa › Rwanda")
-- without seeing anything else about them.
create or replace function is_unit_above_mine(p_unit uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from org_unit_member m
    join org_unit mine on mine.id = m.org_unit_id
    join org_unit target on target.id = p_unit
    where m.user_id = auth.uid() and mine.path <@ target.path
  );
$$;

-- Can the current user manage this box (add boxes inside it, appoint the
-- leaders of the boxes directly inside it)? Only its own leader, or admin.
create or replace function can_lead_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from org_unit_member m
    where m.user_id = auth.uid() and m.org_unit_id = p_unit and m.role = 'leader'
  );
$$;

grant execute on function can_view_unit(uuid) to authenticated;
grant execute on function is_unit_above_mine(uuid) to authenticated;
grant execute on function can_lead_unit(uuid) to authenticated;

-- ───────────── row level security ─────────────

alter table org_unit enable row level security;
alter table org_unit_member enable row level security;

create policy org_unit_read on org_unit for select
  using (can_view_unit(id) or is_unit_above_mine(id));

create policy org_unit_member_read on org_unit_member for select
  using (user_id = auth.uid() or can_view_unit(org_unit_id));

-- No write policies: boxes and appointments are written by server actions
-- through the service role, after can_lead_unit is checked — the same
-- pattern every other admin-style write in this app already uses.

-- ───────────── settings ─────────────

-- "Inactive" = still enrolled but missed this many lessons in a row.
insert into org_setting (key, value) values ('inactive_streak', '3')
  on conflict (key) do nothing;
