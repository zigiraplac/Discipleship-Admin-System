-- System authority and programme leadership are different things.
--
--  * Admin (system authority) keeps technical access to everything —
--    accounts, structure, troubleshooting, a cohort when support needs it
--    (the app records each such cohort visit in audit_log).
--  * The "leadership" app role no longer sees every level and cohort.
--    Programme visibility comes only from an organisational assignment
--    (org_unit_member), the same as every other leader or viewer.
--
-- No account currently has the leadership role, so nobody loses access.

create or replace function has_cohort_access(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from cohort_member m where m.cohort_id = p_cohort and m.user_id = auth.uid()
  );
$$;

create or replace function has_pastoral_access(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from cohort_member m
    where m.cohort_id = p_cohort and m.user_id = auth.uid() and m.capacity = 'facilitator'
  );
$$;

create or replace function can_view_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_admin() or exists (
    select 1
    from org_unit_member m
    join org_unit mine on mine.id = m.org_unit_id
    join org_unit target on target.id = p_unit
    where m.user_id = auth.uid() and target.path <@ mine.path
  );
$$;
