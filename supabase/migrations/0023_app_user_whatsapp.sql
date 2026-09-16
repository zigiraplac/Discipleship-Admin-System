-- Every app_user gets a WhatsApp number on file — needed so a birthday
-- reminder (see ensureBirthdayFacilitatorReminders, src/lib/data/
-- notifications.ts) actually has someone real to reach, not just the
-- student's own number a facilitator already sees on their profile.

alter table app_user add column whatsapp text;

-- Same reasoning as update_own_name (0005_notifications_and_profile.sql):
-- a narrow SECURITY DEFINER function rather than a general "update your
-- own row" policy, so self-service editing this field can never be used
-- to also rewrite `role` or `state`.
create or replace function update_own_whatsapp(new_whatsapp text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update app_user set whatsapp = nullif(trim(new_whatsapp), '') where id = auth.uid();
end;
$$;

grant execute on function update_own_whatsapp(text) to authenticated;
