-- Reports' new "What changed" timeline (per cohort) needs to filter
-- audit_log down to one cohort's own history — `entity_id` alone doesn't
-- get you there (it's a lesson/event id, not a cohort id, for a
-- postponement), and there's no join path from every entity type back to a
-- cohort. Nullable: only the cohort-scoped actions this report actually
-- reads (postpone, cohort creation) populate it; a genuinely global action
-- (a person invited, org-wide band thresholds changed) leaves it null.

alter table audit_log add column cohort_id uuid references cohort on delete cascade;

create index on audit_log (cohort_id, created_at desc);
