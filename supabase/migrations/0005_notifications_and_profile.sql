-- Notifications: a plain per-user feed. Always written by the server
-- (service role, from inside a server action that has already done its own
-- permission check) — there is no insert/update policy for `authenticated`
-- here on purpose, so a signed-in client can never post a notification to
-- itself or anyone else, only read its own.
create table notification (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  href       text,
  -- Set only for notifications that aren't a discrete one-time event (a
  -- birthday recurs every year) — (user_id, dedupe_key) is unique so
  -- opportunistically re-checking on every page load can never double-post.
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notification_user_created_idx on notification (user_id, created_at desc);
create unique index notification_dedupe_idx on notification (user_id, dedupe_key) where dedupe_key is not null;

alter table notification enable row level security;
create policy notification_read_self on notification for select using (user_id = auth.uid());

-- Self-service profile: a user may change their own name, never their own
-- role — mirrors activate_self()'s reasoning in 0002_self_activate.sql.
-- (Password changes go through supabase.auth.updateUser() directly, which
-- Supabase Auth already scopes to the caller's own account.)
create or replace function update_own_name(new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if new_name is null or length(trim(new_name)) = 0 then
    raise exception 'Name cannot be empty.';
  end if;
  update app_user set name = trim(new_name) where id = auth.uid();
end;
$$;

grant execute on function update_own_name(text) to authenticated;
