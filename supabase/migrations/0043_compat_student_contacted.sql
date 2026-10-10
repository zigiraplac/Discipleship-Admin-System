-- TEMPORARY compatibility patch — remove once the new code is deployed.
--
-- 0037 moved contacted_at / contacted_by from student into the pastoral
-- student_follow_up table and dropped the student columns. The deployed
-- app (commit 749f89d) still reads student.contacted_at in every student
-- query, so those pages failed. This re-adds the two columns, filled from
-- student_follow_up, and keeps both places in step while both versions of
-- the app exist:
--   * the old app writes student.contacted_* → copied to student_follow_up;
--   * the new app writes student_follow_up    → copied to student.contacted_*.
-- student_follow_up stays the source of truth. A later migration drops the
-- columns and these triggers once production runs the new code.

alter table student add column if not exists contacted_at timestamptz;
alter table student add column if not exists contacted_by uuid references app_user;

update student s
set contacted_at = f.contacted_at, contacted_by = f.contacted_by
from student_follow_up f
where f.student_id = s.id;

-- old app → follow-up table
create or replace function compat_student_contacted_to_follow_up() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contacted_at is distinct from old.contacted_at or new.contacted_by is distinct from old.contacted_by then
    insert into student_follow_up (student_id, cohort_id, contacted_at, contacted_by, updated_at)
    values (new.id, new.cohort_id, new.contacted_at, new.contacted_by, now())
    on conflict (student_id) do update
      set contacted_at = excluded.contacted_at, contacted_by = excluded.contacted_by, updated_at = now()
      where student_follow_up.contacted_at is distinct from excluded.contacted_at
         or student_follow_up.contacted_by is distinct from excluded.contacted_by;
  end if;
  return new;
end;
$$;

create trigger compat_student_contacted_sync
  after update of contacted_at, contacted_by on student
  for each row execute function compat_student_contacted_to_follow_up();

-- new app → old columns
create or replace function compat_follow_up_to_student_contacted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update student
  set contacted_at = new.contacted_at, contacted_by = new.contacted_by
  where id = new.student_id
    and (contacted_at is distinct from new.contacted_at or contacted_by is distinct from new.contacted_by);
  return new;
end;
$$;

create trigger compat_follow_up_contacted_sync
  after insert or update of contacted_at, contacted_by on student_follow_up
  for each row execute function compat_follow_up_to_student_contacted();
