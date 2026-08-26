-- recordOutcome only started setting student.left_at when the "left"
-- outcome was recorded in the same session that added this behavior
-- (outcomes.ts). Any "left" outcome recorded before that still has its
-- history row in `outcome`, but the student it's about was never actually
-- marked departed — so they kept counting in cohort-wide numbers and the
-- "Left the program" KPI read 0 even with a real departure on record.
-- One-time backfill: for every student whose most recent outcome is
-- "left" and who isn't already marked, set left_at from that outcome's
-- own recorded_at (the closest real timestamp for when the decision was
-- made) rather than "now".
with latest_outcome as (
  select distinct on (student_id) student_id, kind, recorded_at
  from outcome
  order by student_id, recorded_at desc
)
update student
set left_at = latest_outcome.recorded_at
from latest_outcome
where student.id = latest_outcome.student_id
  and latest_outcome.kind = 'left'
  and student.left_at is null;
