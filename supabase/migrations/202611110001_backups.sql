begin;

-- Each backup includes the local plan, latest BLS cache and immutable review history.
create table public.aurum_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint backup_version check ((payload->>'version') is not distinct from '1'),
  constraint backup_payload check (jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload->'history') is not distinct from 'array'),
  constraint backup_size check (octet_length(payload::text) <= 2000000)
);
create index aurum_backups_owner_created on public.aurum_backups(user_id, created_at desc);
alter table public.aurum_backups enable row level security;
revoke all on public.aurum_backups from public, anon, authenticated;
grant select on public.aurum_backups to authenticated;
grant insert (user_id, payload) on public.aurum_backups to authenticated;
create policy "Read own backups" on public.aurum_backups for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own backups" on public.aurum_backups for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- No update/delete policies: existing backups remain unchanged from the mobile client.
commit;