-- A birthday (or crusade-weekend) notification's "In N days" text used to
-- be frozen into `body` at creation time and never updated — so a
-- notification sitting unread for a few days quietly went stale ("In 5
-- days" showing on day 4, or worse, after the day itself). `data` carries
-- the structured fields needed to recompute the countdown live, at render
-- time, every time it's shown.

alter table notification add column data jsonb;

comment on column notification.data is
  'Structured payload for kinds that need a live-recomputed display (e.g. '
  'birthday: {studentId, dobDay, dobMonth}, crusade_upcoming: {cohortId, '
  'afterClass, date}) — see notifications-bell.tsx. Null for kinds whose '
  'body text never goes stale.';
