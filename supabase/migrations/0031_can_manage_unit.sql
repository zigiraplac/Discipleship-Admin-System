-- Can the current user manage this box from above — its staff, its name,
-- removing it? True for admin, or for the leader of any box *above* it
-- (not the box itself: a box's own leader is appointed from above). This
-- is what lets a continent leader manage country, region and church
-- leaders across their whole branch, not only the level directly below.
create or replace function can_manage_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_admin() or exists (
    select 1
    from org_unit_member m
    join org_unit mine on mine.id = m.org_unit_id
    join org_unit target on target.id = p_unit
    where m.user_id = auth.uid()
      and m.role = 'leader'
      and target.path <@ mine.path
      and target.id <> mine.id
  );
$$;

grant execute on function can_manage_unit(uuid) to authenticated;
