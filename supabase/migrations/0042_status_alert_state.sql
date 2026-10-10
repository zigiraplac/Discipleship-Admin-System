-- The minimum needed for one-level-up status alerts: each level's (and
-- cohort's) current alert status, a status waiting to be confirmed on a
-- second daily check, and when its parent was last told. Not a history —
-- one row per subject, overwritten daily by the notifications job.
-- Service role only (no RLS policies): nobody reads it directly.

create table status_alert_state (
  subject_type         text not null check (subject_type in ('unit', 'cohort')),
  subject_id           uuid not null,
  status               text not null check (status in ('good', 'attention', 'critical', 'quiet')),
  pending_status       text check (pending_status in ('good', 'attention', 'critical', 'quiet')),
  pending_since        date,
  last_notified_status text check (last_notified_status in ('good', 'attention', 'critical', 'quiet')),
  last_notified_at     date,
  updated_at           timestamptz not null default now(),
  primary key (subject_type, subject_id)
);

alter table status_alert_state enable row level security;
