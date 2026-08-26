-- Two read-modify-write races, fixed by moving the write itself into the
-- database instead of round-tripping the current value through the app
-- and writing a locally-mutated copy back.

-- toggleLessonCatchup used to read the whole `attendance` jsonb blob,
-- flip one student's key in JS, and write the whole object back. Two
-- students on the same lesson toggled close together could race: the
-- second write, built from a value read before the first one landed,
-- would silently revert it. jsonb_set inside a single UPDATE statement
-- is atomic per row — Postgres serializes concurrent UPDATEs to the same
-- row, so the second one always applies on top of the first, not instead
-- of it. Runs as the caller (not security definer), so it's still bound
-- by the register table's own RLS policy — no change to who can write.
create or replace function set_attendance_mark(
  p_event_id uuid,
  p_student_id uuid,
  p_present boolean,
  p_actor uuid
)
returns void
language sql
as $$
  update register
  set attendance = jsonb_set(
        coalesce(attendance, '{}'::jsonb),
        array[p_student_id::text],
        to_jsonb(case when p_present then 'present' else 'absent' end)
      ),
      updated_by = p_actor,
      updated_at = now()
  where event_id = p_event_id;
$$;

-- postponeLesson used to reflow every later lesson's date with a plain
-- sequential loop of individually-awaited updates — a failure partway
-- through could leave some lessons shifted and others not, with no
-- rollback. A single plpgsql function call is one implicit transaction,
-- the same pattern already used for cohort creation
-- (0006_cohort_transaction.sql): either every date in the batch lands, or
-- none do. Called via the admin client, same as the rest of this action's
-- writes (event is admin-write-only by RLS; a facilitator's access is
-- checked in application code, not here).
create or replace function apply_event_date_updates(p_updates jsonb)
returns void
language plpgsql
as $$
declare
  u jsonb;
begin
  for u in select * from jsonb_array_elements(p_updates)
  loop
    update event
    set event_date = (u->>'event_date')::date,
        edited = true
    where id = (u->>'id')::uuid;
  end loop;
end;
$$;
