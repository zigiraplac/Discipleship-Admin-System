-- 0034's restore used UPDATE … FROM lesson_catchup, which applies only one
-- matching catch-up per register row — so where several students caught up
-- the same lesson, only one of them got their original absence back. This
-- sets every caught-up student on a lesson back to absent in one write
-- (also satisfying the register_keeps_catchups guard, which checks the
-- whole register). The audit_log rows from 0034 already cover all 24.
update register r
set attendance = r.attendance || (
  select jsonb_object_agg(lc.student_id::text, 'absent')
  from lesson_catchup lc
  where lc.event_id = r.event_id
)
where exists (
  select 1 from lesson_catchup lc
  where lc.event_id = r.event_id
    and r.attendance ->> (lc.student_id::text) = 'present'
);
