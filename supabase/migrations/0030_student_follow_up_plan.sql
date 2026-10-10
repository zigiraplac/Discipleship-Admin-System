-- Follow-up plan for a struggling student: who follows up, and when to
-- check again. Sits next to the existing "contacted" mark
-- (contacted_at / contacted_by) rather than in a new table: the Follow Up
-- page already treats a student's current follow-up state as living on
-- the student row, and recordOutcome already clears it when a decision is
-- recorded. "Overdue follow-up" = follow_up_next_on is in the past while
-- the student still needs attention.
alter table student add column follow_up_assignee uuid references app_user on delete set null;
alter table student add column follow_up_next_on date;

comment on column student.follow_up_assignee is
  'Who is responsible for following up with this student (null = not assigned).';
comment on column student.follow_up_next_on is
  'When to check on this student again. Past this date while they still need attention = overdue.';
