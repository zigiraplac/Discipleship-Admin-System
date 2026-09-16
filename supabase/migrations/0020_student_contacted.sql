-- Splitting "Attention" into Follow Up and Catch ups (two nav items instead
-- of one) needs a real "I already reached out, waiting to hear back" state
-- — today that's just a WhatsApp deep-link with nothing recorded. Cleared
-- back to null whenever a new outcome is recorded (recordOutcome) — closing
-- a decision starts the next "needs contact" cycle fresh if the student
-- ever falls below the band again later.

alter table student add column contacted_at timestamptz;
alter table student add column contacted_by uuid references app_user;

comment on column student.contacted_at is
  'When a facilitator/admin last marked this student as contacted while '
  'they were flagged and had no outcome recorded yet. Cleared whenever a '
  'new outcome is recorded — see recordOutcome.';
