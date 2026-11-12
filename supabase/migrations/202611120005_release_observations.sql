begin;
alter table public.aurum_auto_calendar
  add column fed jsonb,
  add column fed_attempted_at timestamptz,
  add column macro_error text,
  add column release_attempts jsonb not null default '{}'::jsonb,
  add constraint fed_size check (fed is null or octet_length(fed::text) <= 150000);

create table public.aurum_auto_outcomes (
  id text primary key,
  event_id text not null,
  captured_at timestamptz not null,
  payload jsonb not null,
  constraint outcome_format check (
    (payload->>'version') is not distinct from '1'
    and (payload->>'id') is not distinct from id
    and (payload->>'eventId') is not distinct from event_id
    and coalesce((payload->>'quality') in ('official-statement', 'post-release-observation'), false)
    and octet_length(payload::text) <= 100000)
);
create index aurum_auto_outcomes_time on public.aurum_auto_outcomes(captured_at desc);
alter table public.aurum_auto_outcomes enable row level security;
revoke all on public.aurum_auto_outcomes from public, anon, authenticated;
grant select on public.aurum_auto_outcomes to anon, authenticated;
grant all on public.aurum_auto_outcomes to service_role;
create policy "Read public release observations" on public.aurum_auto_outcomes for select to anon, authenticated using (true);
commit;
