-- A student can now be added one at a time (not just via the CSV import
-- wizard), and the wizard itself moves from fixed-position CSV columns to
-- header-name matching (registrations.ts) — real registration forms carry
-- a "city" column, and other columns (gender, marital status, age range,
-- church, ...) that nothing in the app uses yet but that shouldn't be
-- silently thrown away just because there's no dedicated field for them.

alter table student add column city text;
alter table student add column extra jsonb;

comment on column student.city is 'Free-text city, from the registration form — display only.';
comment on column student.extra is
  'Any CSV column that did not map to a known field, keyed by its original '
  'header (e.g. {"Gender": "M", "Marital status": "single"}). Not read by '
  'any current feature — a lossless holding pen, not a data model.';
