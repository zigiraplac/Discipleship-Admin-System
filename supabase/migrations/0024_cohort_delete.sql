-- `cohort` had insert/update policies for admin (0001_init.sql) but no
-- delete policy at all, so even an admin's own session could never
-- actually delete a cohort — Postgres RLS defaults to deny for any
-- operation without a matching policy. The write itself goes through the
-- `deleteCohort` server action's admin-only role check either way (same
-- pattern as `createCohort`), but the policy still needs to exist for a
-- non-service-role client to do it at all.
create policy cohort_delete_admin on cohort for delete using (is_admin());
