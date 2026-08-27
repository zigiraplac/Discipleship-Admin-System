-- A crusade weekend is 3 auto-generated calendar events (Fri/Sat/Sun,
-- sharing the same after_class) with no way to mark that the outreach
-- actually happened — unlike a lesson, there's no register to save. This
-- is the crusade equivalent: one row per weekend (keyed by cohort +
-- after_class, not a single event_id, since the weekend spans 3 of
-- them), marked manually by a facilitator/admin.
create table crusade_completion (
  cohort_id    uuid not null references cohort on delete cascade,
  after_class  smallint not null,
  completed_at timestamptz not null default now(),
  completed_by uuid not null references app_user,
  primary key (cohort_id, after_class)
);

alter table crusade_completion enable row level security;

-- Same visibility as the crusade calendar chips themselves (everyone with
-- cohort access, including teacher); same write gate as a register
-- correction (facilitator/admin only, leadership stays read-only).
create policy crusade_completion_read on crusade_completion for select using (has_cohort_access(cohort_id));
create policy crusade_completion_write on crusade_completion for all
  using (can_write_pastoral(cohort_id)) with check (can_write_pastoral(cohort_id));
