-- `crusade_report` has existed since 0001_init.sql but nothing has ever
-- written to it — no real crusade-outcome data model existed, so Reports'
-- "Weekend outreach" table just rendered "—" for every cell. This turns
-- it into the real thing: theme, preacher, notes, and highlights, one row
-- per weekend (keyed by cohort + after_class — a weekend spans 2 calendar
-- events, Friday and Saturday, not one). Recording a report *is* how a
-- weekend gets marked as having happened; there's no separate boolean.
--
-- souls_reached/conversions/followups never had any real data either and
-- aren't part of what's being tracked now — dropped rather than left
-- sitting unused alongside the fields that matter.
--
-- No unique constraint existed on (cohort_id, after_class) before, so in
-- principle more than one row could exist per weekend — adding it now
-- makes "the report for this weekend" an actual 1:1 relationship the app
-- can upsert against, same as recordOutcome's cohort_id + after_class
-- equivalent for a lesson's register.
alter table crusade_report
  add column theme text,
  add column preacher text,
  add column highlights text,
  add column recorded_by uuid references app_user,
  add column recorded_at timestamptz;

alter table crusade_report drop column souls_reached;
alter table crusade_report drop column conversions;
alter table crusade_report drop column followups;

alter table crusade_report add constraint crusade_report_cohort_after_class_key unique (cohort_id, after_class);
