-- Starting organization tree, and where today's cohorts sit in it.
-- Church and region names are placeholders and can be renamed in the app.
--
--   Global HQ
--   ├── Africa › Rwanda
--   │   ├── Kigali City
--   │   │   ├── Kigali Central Church › Promotion 2026: Cohort 01, Cohort 02, Promo A, Promo B
--   │   │   └── Kigali East Church › Promotion 2026–2027: Promotion 2026-2027 A
--   │   └── Northern Province › Musanze Church › Promotion 2026: Cohort Test
--   └── Asia › Turkey › Ankara › Ankara Church › Promotion 2026: Cohort 4
--
-- Cohorts are matched by slug; any that don't exist (e.g. on a fresh
-- database) are simply skipped.

do $$
declare
  v_hq uuid; v_africa uuid; v_rwanda uuid; v_kigali uuid; v_north uuid;
  v_central uuid; v_east uuid; v_musanze uuid;
  v_p_central uuid; v_p_east uuid; v_p_musanze uuid;
  v_asia uuid; v_turkey uuid; v_ankara uuid; v_ankara_church uuid; v_p_ankara uuid;
begin
  insert into org_unit (type, name, slug) values ('hq', 'Global HQ', 'global-hq') returning id into v_hq;

  insert into org_unit (parent_id, type, name, slug) values (v_hq, 'continent', 'Africa', 'africa') returning id into v_africa;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_africa, 'country', 'Rwanda', 'rwanda', '{"timeZone": "Africa/Kigali", "languages": "Kinyarwanda, English, French"}')
    returning id into v_rwanda;
  insert into org_unit (parent_id, type, name, slug) values (v_rwanda, 'region', 'Kigali City', 'kigali-city') returning id into v_kigali;
  insert into org_unit (parent_id, type, name, slug) values (v_rwanda, 'region', 'Northern Province', 'northern-province') returning id into v_north;

  insert into org_unit (parent_id, type, name, slug, details)
    values (v_kigali, 'site', 'Kigali Central Church', 'kigali-central-church', '{"city": "Kigali"}') returning id into v_central;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_kigali, 'site', 'Kigali East Church', 'kigali-east-church', '{"city": "Kigali"}') returning id into v_east;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_north, 'site', 'Musanze Church', 'musanze-church', '{"city": "Musanze"}') returning id into v_musanze;

  insert into org_unit (parent_id, type, name, slug, details)
    values (v_central, 'promotion', 'Promotion 2026', 'kigali-central-church-promotion-2026', '{"startYear": 2026, "endYear": 2027}')
    returning id into v_p_central;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_east, 'promotion', 'Promotion 2026–2027', 'kigali-east-church-promotion-2026-2027', '{"startYear": 2026, "endYear": 2027}')
    returning id into v_p_east;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_musanze, 'promotion', 'Promotion 2026', 'musanze-church-promotion-2026', '{"startYear": 2026, "endYear": 2027}')
    returning id into v_p_musanze;

  insert into org_unit (parent_id, type, name, slug) values (v_hq, 'continent', 'Asia', 'asia') returning id into v_asia;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_asia, 'country', 'Turkey', 'turkey', '{"timeZone": "Europe/Istanbul", "languages": "Turkish"}')
    returning id into v_turkey;
  insert into org_unit (parent_id, type, name, slug) values (v_turkey, 'region', 'Ankara', 'ankara') returning id into v_ankara;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_ankara, 'site', 'Ankara Church', 'ankara-church', '{"city": "Ankara"}') returning id into v_ankara_church;
  insert into org_unit (parent_id, type, name, slug, details)
    values (v_ankara_church, 'promotion', 'Promotion 2026', 'ankara-church-promotion-2026', '{"startYear": 2026, "endYear": 2027}')
    returning id into v_p_ankara;

  update cohort set org_unit_id = v_p_central where slug in ('cohort-01', 'cohort-02', 'promo-a', 'promo-b');
  update cohort set org_unit_id = v_p_east where slug = 'promotion-2026-2027-a';
  update cohort set org_unit_id = v_p_musanze where slug = 'cohort-test';
  update cohort set org_unit_id = v_p_ankara where slug = 'cohort-4';
end;
$$;
