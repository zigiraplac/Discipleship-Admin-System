-- Per-level settings that every box and cohort below follows (status
-- bands, inactive rule). Empty = inherit from the box above; the network
-- defaults stay in org_setting. Written through the service role after an
-- application-side can_lead_unit / can_manage_unit check, like every other
-- org_unit write.
alter table org_unit add column if not exists settings jsonb not null default '{}'::jsonb;
