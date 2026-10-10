-- Follow-up state is pastoral detail. It lived on the student row
-- (contacted_at/by, follow_up_assignee/next_on), which every level above
-- the cohort can now read (operational access, 0036). It moves to its own
-- table with pastoral access: the cohort's facilitators, admin, leadership.
-- Level totals (how many overdue, how many not contacted) are computed
-- server-side and never expose who or when.

create table student_follow_up (
  student_id  uuid primary key references student on delete cascade,
  cohort_id   uuid not null references cohort on delete cascade,
  contacted_at timestamptz,
  contacted_by uuid references app_user,
  assignee    uuid references app_user on delete set null,
  next_on     date,
  updated_at  timestamptz not null default now()
);

create index on student_follow_up (cohort_id);
create index on student_follow_up (contacted_by);

alter table student_follow_up enable row level security;
create policy student_follow_up_read on student_follow_up
  for select using (has_pastoral_access(cohort_id));
create policy student_follow_up_write on student_follow_up
  for all using (can_write_pastoral(cohort_id)) with check (can_write_pastoral(cohort_id));

insert into student_follow_up (student_id, cohort_id, contacted_at, contacted_by, assignee, next_on)
select id, cohort_id, contacted_at, contacted_by, follow_up_assignee, follow_up_next_on
from student
where contacted_at is not null or contacted_by is not null or follow_up_assignee is not null or follow_up_next_on is not null;

alter table student drop column contacted_at;
alter table student drop column contacted_by;
alter table student drop column follow_up_assignee;
alter table student drop column follow_up_next_on;

-- Facilitator / teacher names for cohorts the viewer can see. app_user
-- rows stay private (emails etc.); this returns names only.
create or replace function cohort_staff_names(p_cohorts uuid[])
returns table (cohort_id uuid, capacity text, name text)
language sql stable security definer set search_path = public as $$
  select m.cohort_id, m.capacity, u.name
  from cohort_member m
  join app_user u on u.id = m.user_id
  where m.cohort_id = any(p_cohorts) and has_cohort_access(m.cohort_id);
$$;

grant execute on function cohort_staff_names(uuid[]) to authenticated;
