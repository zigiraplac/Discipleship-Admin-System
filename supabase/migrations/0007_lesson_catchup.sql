-- Tracks "this specific present mark came from a catch-up correction, not
-- from being there on the day". The actual attendance record on `register`
-- IS updated to present when a lesson is caught up (the same correction
-- path a facilitator uses to fix a mistake), so this table is not the
-- source of truth for attendance — it's a side note that lets the
-- attendance grid color that one mark differently. A student can only be
-- marked caught up on a lesson they were genuinely absent for — enforced
-- by the app (server action), not the schema, the same way other write
-- paths in this app check business rules in code.
create table lesson_catchup (
  student_id   uuid not null references student on delete cascade,
  event_id     uuid not null references event on delete cascade,
  caught_up_at timestamptz not null default now(),
  recorded_by  uuid references app_user,
  primary key (student_id, event_id)
);

alter table lesson_catchup enable row level security;

-- Same pastoral-access rules as register/outcome — sensitive per-student
-- follow-up detail, not visible to teachers. lesson_catchup has no
-- cohort_id column of its own, so the check goes through event, same
-- pattern as register_read/register_write.
create policy lesson_catchup_read on lesson_catchup for select using (
  has_pastoral_access((select cohort_id from event where event.id = lesson_catchup.event_id))
);
create policy lesson_catchup_write on lesson_catchup for all using (
  can_write_pastoral((select cohort_id from event where event.id = lesson_catchup.event_id))
) with check (
  can_write_pastoral((select cohort_id from event where event.id = lesson_catchup.event_id))
);
