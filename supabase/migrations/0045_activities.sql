-- Activities: a cohort's crusade weekends plus its own occasional
-- activities (agape, fellowship, or any other kind it names).
--
-- Crusade weekends stay generated from the curriculum. Until now a saved
-- report *was* "done"; a report can now also say the weekend didn't happen,
-- with notes. Every existing report was a "done" report.

alter table crusade_report
  add column status text not null default 'done' check (status in ('done', 'not_done'));

-- Other activities are occasional and dated by hand — nothing generates
-- them. `kind` is free text so a cohort can add a new kind of activity
-- without a migration; the app offers Agape and Fellowship by default.
create table activity (
  id            uuid primary key default gen_random_uuid(),
  cohort_id     uuid not null references cohort on delete cascade,
  kind          text not null check (length(btrim(kind)) between 1 and 40),
  activity_date date not null,
  theme         text,
  preacher      text,
  status        text not null default 'planned' check (status in ('planned', 'done', 'not_done')),
  notes         text,
  created_by    uuid references app_user on delete set null,
  created_at    timestamptz not null default now(),
  updated_by    uuid references app_user on delete set null,
  updated_at    timestamptz
);

create index on activity (cohort_id, activity_date);

-- Same access as crusade_report: anyone who can see the cohort reads it;
-- its facilitators and admin write it.
alter table activity enable row level security;
create policy activity_read on activity for select using (has_cohort_access(cohort_id));
create policy activity_write on activity for all
  using (can_write_pastoral(cohort_id)) with check (can_write_pastoral(cohort_id));
