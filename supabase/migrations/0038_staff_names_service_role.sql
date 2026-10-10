-- cohort_staff_names (0037) checks has_cohort_access, which is false for
-- the service role (no signed-in user). Server-side roll-ups read with the
-- service role after their own authorization check, so let it through.
create or replace function cohort_staff_names(p_cohorts uuid[])
returns table (cohort_id uuid, capacity text, name text)
language sql stable security definer set search_path = public as $$
  select m.cohort_id, m.capacity, u.name
  from cohort_member m
  join app_user u on u.id = m.user_id
  where m.cohort_id = any(p_cohorts)
    and (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or has_cohort_access(m.cohort_id));
$$;
