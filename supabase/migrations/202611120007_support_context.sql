begin;
alter table public.aurum_auto_calendar add column support jsonb;
alter table public.aurum_auto_calendar add constraint support_size check (support is null or octet_length(support::text) <= 100000);
create table public.aurum_auto_context_history (
  id text primary key,
  captured_at timestamptz not null,
  payload jsonb not null,
  constraint support_history_format check (
    (payload->>'version') is not distinct from '1'
    and jsonb_typeof(payload->'series') is not distinct from 'array'
    and jsonb_typeof(payload->'checkedAt') is not distinct from 'number'
    and octet_length(payload::text) <= 100000
  )
);
create index aurum_auto_context_history_time on public.aurum_auto_context_history(captured_at desc);
alter table public.aurum_auto_context_history enable row level security;
revoke all on public.aurum_auto_context_history from public, anon, authenticated;
grant select on public.aurum_auto_context_history to anon, authenticated;
grant select, insert on public.aurum_auto_context_history to service_role;
create policy "Read public economic context history" on public.aurum_auto_context_history for select to anon, authenticated using (true);
-- Captured versions, not reconstructed first-release vintages. No personal data.
commit;
