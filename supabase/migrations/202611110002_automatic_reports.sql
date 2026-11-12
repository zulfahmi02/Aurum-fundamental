begin;

-- Public economic information only. No account, broker, trade or backup data.
create table public.aurum_auto_calendar (
  id text primary key check (id = 'weekly'),
  payload jsonb,
  macro jsonb,
  macro_attempted_at timestamptz,
  checked_at timestamptz not null default now(),
  attempted_at timestamptz,
  error text,
  constraint calendar_size check (payload is null or octet_length(payload::text) <= 1500000),
  constraint macro_size check (macro is null or octet_length(macro::text) <= 100000)
);
create table public.aurum_auto_reports (
  id text primary key,
  event_id text not null,
  generated_at timestamptz not null,
  payload jsonb not null,
  constraint auto_report_format check (
    (payload->>'version') is not distinct from '1'
    and (payload->>'origin') is not distinct from 'server'
    and (payload->>'bias') is not distinct from 'NO_SIGNAL'
    and (payload->>'id') is not distinct from id
    and jsonb_typeof(payload->'reasons') is not distinct from 'array'
    and octet_length(payload::text) <= 100000)
);
create index aurum_auto_reports_time on public.aurum_auto_reports(generated_at desc);
alter table public.aurum_auto_calendar enable row level security;
alter table public.aurum_auto_reports enable row level security;
revoke all on public.aurum_auto_calendar, public.aurum_auto_reports from public, anon, authenticated;
grant select on public.aurum_auto_calendar, public.aurum_auto_reports to anon, authenticated;
grant all on public.aurum_auto_calendar, public.aurum_auto_reports to service_role;
create policy "Read public economic calendar" on public.aurum_auto_calendar for select to anon, authenticated using (true);
create policy "Read public economic reports" on public.aurum_auto_reports for select to anon, authenticated using (true);
-- Mobile clients have no insert, update or delete permission. Existing personal backups are unchanged.

create table public.aurum_auto_locks (id text primary key, until_at timestamptz not null);
alter table public.aurum_auto_locks enable row level security;
revoke all on public.aurum_auto_locks from public, anon, authenticated;
grant all on public.aurum_auto_locks to service_role;
create function public.aurum_auto_acquire() returns boolean
language plpgsql security definer set search_path = '' as $$
declare acquired boolean;
begin
  insert into public.aurum_auto_locks(id, until_at) values ('worker', clock_timestamp() + interval '180 seconds')
  on conflict (id) do update set until_at = excluded.until_at
    where public.aurum_auto_locks.until_at < clock_timestamp()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;
revoke all on function public.aurum_auto_acquire() from public, anon, authenticated;
grant execute on function public.aurum_auto_acquire() to service_role;
commit;
