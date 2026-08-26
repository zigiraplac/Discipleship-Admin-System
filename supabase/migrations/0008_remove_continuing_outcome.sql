-- Attention exists to flag an attendance problem, and every flagged
-- student should land on one of exactly two real decisions: they'll catch
-- up the missed lessons, or they're gone. "Continuing" ("spoke to them,
-- no change needed") resolved neither and just sat there unactioned.
--
-- Existing continuing rows are deleted rather than relabeled — force-
-- mapping "no change needed" onto catchup or left would misrepresent
-- what was actually decided. The student just reverts to "no outcome
-- recorded" and reappears under "To contact" if still below the band.
delete from outcome where kind = 'continuing';

alter table outcome drop constraint outcome_kind_check;
alter table outcome add constraint outcome_kind_check check (kind in ('catchup', 'left'));
