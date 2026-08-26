-- recordOutcome's insert, its "read the true latest outcome" query, and
-- the student.left_at write were three separate round trips. Two outcomes
-- recorded for the same student in close succession (e.g. two
-- facilitators, one marking "left" and one marking "resolved") could each
-- read a "latest" that didn't yet include the other's insert, so
-- left_at ends up reflecting whichever UPDATE happened to land last, not
-- whichever outcome is chronologically latest.
--
-- Locking the student row for the duration of the function (`for update`)
-- serializes concurrent calls for the same student: the second call
-- blocks until the first commits, so by the time it reads "the latest
-- outcome" that read is guaranteed to include the first call's insert.
-- plpgsql wraps the whole thing in one implicit transaction, same pattern
-- as apply_event_date_updates (0009_atomic_writes.sql). Runs as the
-- caller, not security definer — still bound by outcome/student RLS.
create or replace function record_outcome_and_sync_left(
  p_student_id uuid,
  p_cohort_id uuid,
  p_kind text,
  p_actor uuid
)
returns void
language plpgsql
as $$
declare
  v_latest_kind text;
begin
  perform 1 from student where id = p_student_id for update;

  insert into outcome (student_id, cohort_id, kind, recorded_by)
  values (p_student_id, p_cohort_id, p_kind, p_actor);

  select kind into v_latest_kind
  from outcome
  where student_id = p_student_id
  order by recorded_at desc
  limit 1;

  update student
  set left_at = case when v_latest_kind = 'left' then now() else null end
  where id = p_student_id;
end;
$$;
