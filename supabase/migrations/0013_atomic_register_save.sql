-- saveRegister's optimistic-concurrency check (read the current version)
-- and the write itself (UPDATE ... WHERE event_id = ...) were two separate
-- round trips. A second save landing in the gap between them was written
-- unconditionally on event_id alone, silently overwriting the first save
-- with no error, even though a version mismatch had already happened.
--
-- Folding the version check into the UPDATE's own WHERE clause makes it a
-- single atomic compare-and-swap, the same pattern set_attendance_mark and
-- apply_event_date_updates already use (0009_atomic_writes.sql): the row
-- only changes if its version still matches what the caller last saw, and
-- an empty RETURNING result tells the caller definitively that it lost the
-- race, rather than that being merely likely.
--
-- A register row always exists for every event (auto-created by the
-- `event` insert trigger, 0001_init.sql:334), so this is a pure UPDATE —
-- never an insert. Runs as the caller, not security definer, so it's still
-- bound by the register table's own RLS policy.
create or replace function save_register(
  p_event_id uuid,
  p_attendance jsonb,
  p_actor uuid,
  p_is_correction boolean,
  p_expected_version timestamptz
)
returns table (event_id uuid)
language sql
as $$
  update register
  set attendance = p_attendance,
      recorded_by = case when p_is_correction then recorded_by else p_actor end,
      recorded_at = case when p_is_correction then recorded_at else now() end,
      updated_by = case when p_is_correction then p_actor else updated_by end,
      updated_at = case when p_is_correction then now() else updated_at end
  where register.event_id = p_event_id
    and coalesce(register.updated_at, register.recorded_at) is not distinct from p_expected_version
  returning register.event_id;
$$;
