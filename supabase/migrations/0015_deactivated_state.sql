-- Deleting a person outright (via the Supabase dashboard) is blocked in
-- practice the moment they've ever recorded a register, an outcome, or
-- any audited action — those foreign keys point at app_user without
-- cascade, on purpose, so history doesn't vanish with the person who made
-- it. "Deactivated" is the real way to remove someone's access: it's just
-- another app_user.state, so every existing row that references them
-- (register.recorded_by, outcome.recorded_by, audit_log.actor_id,
-- cohort_member) stays exactly as it was — they just can't sign in
-- anymore, and it's a one-click reversal if that turns out to be wrong.
alter table app_user drop constraint app_user_state_check;
alter table app_user add constraint app_user_state_check check (state in ('active', 'invited', 'deactivated'));
