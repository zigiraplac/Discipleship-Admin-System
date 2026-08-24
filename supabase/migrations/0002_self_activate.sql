-- A newly-invited person accepts their email invite, sets a password on
-- our /auth/set-password page, and needs to flip their own app_user.state
-- from 'invited' to 'active'. A broad "users can update their own row"
-- RLS policy would let them also rewrite their own `role` — privilege
-- escalation. This function is the narrow, safe alternative: it only
-- ever touches `state`, only for the caller's own row, only invited -> active.
create or replace function activate_self() returns void
language plpgsql security definer set search_path = public as $$
begin
  update app_user set state = 'active' where id = auth.uid() and state = 'invited';
end;
$$;

grant execute on function activate_self() to authenticated;
