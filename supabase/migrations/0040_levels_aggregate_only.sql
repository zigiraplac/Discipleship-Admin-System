-- Product decision: organisational levels consume summarised intelligence;
-- they don't browse the students below them. 0036 let anyone with a level
-- role read every cohort, roster and register in their branch — that's
-- reverted here. Operational (student-level) access is the cohort's own
-- members, admin and leadership, as before 0036.
--
-- Levels still see everything they need as totals: level pages read
-- per-cohort summaries server-side (no names) after an authorization check
-- (src/lib/authz, capability view_cohort_summary).
--
-- Kept from 0036: registers and catch-ups are operational (readable by the
-- cohort's teachers too), and teachers can take registers.

create or replace function has_cohort_access(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_leadership() or exists (
    select 1 from cohort_member m where m.cohort_id = p_cohort and m.user_id = auth.uid()
  );
$$;
