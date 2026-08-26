-- Until now there was no way to actually close a catch-up decision once
-- it succeeded — the outcome would just sit there saying "catchup"
-- forever, even after every missed lesson was made up, because the only
-- other option was "left" (which is the opposite of what happened).
-- "resolved" is that missing third decision: a real, recorded "this
-- worked, they're back to normal" — kept in the same append-only history
-- as catchup/left rather than deleting or overwriting anything.
alter table outcome drop constraint outcome_kind_check;
alter table outcome add constraint outcome_kind_check check (kind in ('catchup', 'left', 'resolved'));
