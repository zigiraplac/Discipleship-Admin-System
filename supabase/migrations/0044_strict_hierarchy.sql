-- The hierarchy is strict: every box sits directly in the level above it
-- (HQ › continent › country › region › church › promotion), and a cohort
-- sits in a promotion. Skipping a level is no longer allowed — matching the
-- app (domain/levels.ts canSitInside), which already refuses it.
--
-- Applies to creating a box and to moving one (changing parent_id), and to
-- changing a box's type. A type change is refused while the box has boxes
-- or cohorts inside it, since it would leave them at the wrong level.
--
-- Existing data is checked first and never restructured: if anything is
-- already placed in a way the new rule refuses, the migration stops with
-- the offending rows named, and nothing changes.

do $$
declare
  v_bad text;
begin
  select string_agg(format('%s "%s" inside %s "%s"', c.type, c.name, p.type, p.name), '; ')
    into v_bad
  from org_unit c
  join org_unit p on p.id = c.parent_id
  where org_unit_level_rank(c.type) <> org_unit_level_rank(p.type) + 1;
  if v_bad is not null then
    raise exception 'Strict hierarchy: these boxes skip a level — fix them first: %', v_bad;
  end if;

  select string_agg(format('cohort "%s" inside %s "%s"', c.name, u.type, u.name), '; ')
    into v_bad
  from cohort c
  join org_unit u on u.id = c.org_unit_id
  where u.type <> 'promotion';
  if v_bad is not null then
    raise exception 'Strict hierarchy: these cohorts are not in a promotion — fix them first: %', v_bad;
  end if;
end $$;

create or replace function org_unit_set_path() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  v_parent_path ltree;
  v_parent_type text;
begin
  -- A box that already holds boxes or cohorts keeps its level.
  if tg_op = 'UPDATE' and new.type is distinct from old.type
     and (exists (select 1 from org_unit where parent_id = old.id)
          or exists (select 1 from cohort where org_unit_id = old.id)) then
    raise exception 'A % that has boxes or cohorts inside it cannot become a %.', old.type, new.type;
  end if;

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
  -- Exactly one level below its parent — no skipping.
  if org_unit_level_rank(new.type) <> org_unit_level_rank(v_parent_type) + 1 then
    raise exception 'A % cannot sit inside a %.', new.type, v_parent_type;
  end if;
  if tg_op = 'UPDATE' and v_parent_path <@ old.path then
    raise exception 'A box cannot be moved inside itself.';
  end if;

  new.path := v_parent_path || text2ltree(replace(new.id::text, '-', '_'));
  return new;
end;
$$;

-- A cohort can only sit in a promotion (no longer directly in a church).
create or replace function cohort_check_org_unit() returns trigger
language plpgsql set search_path = public as $$
declare
  v_type text;
begin
  if new.org_unit_id is null then
    return new;
  end if;
  select type into v_type from org_unit where id = new.org_unit_id;
  if v_type is null or v_type <> 'promotion' then
    raise exception 'A cohort must belong to a promotion.';
  end if;
  return new;
end;
$$;
