begin;
-- Indicative public XAUUSD bid/ask recorded live at T−5 minutes (entry) and T+1 minute (exit)
-- of each calendar event. Not an HFM/Exness account price. No personal or trade data.
create table public.aurum_auto_prices (
  id text primary key,
  event_id text not null,
  captured_at timestamptz not null,
  payload jsonb not null,
  constraint price_format check (
    (payload->>'version') is not distinct from '1'
    and (payload->>'id') is not distinct from id
    and (payload->>'eventId') is not distinct from event_id
    and coalesce(payload->>'leg' in ('entry', 'exit'), false)
    and id = event_id || '-' || (payload->>'leg')
    and jsonb_typeof(payload->'bid') is not distinct from 'number'
    and jsonb_typeof(payload->'ask') is not distinct from 'number'
    and octet_length(payload::text) <= 2000)
);
create index aurum_auto_prices_time on public.aurum_auto_prices(captured_at desc);
alter table public.aurum_auto_prices enable row level security;
revoke all on public.aurum_auto_prices from public, anon, authenticated;
grant select on public.aurum_auto_prices to anon, authenticated;
-- Insert-only for the worker: a recorded quote is never updated or deleted by code.
grant select, insert on public.aurum_auto_prices to service_role;
create policy "Read public price records" on public.aurum_auto_prices for select to anon, authenticated using (true);
commit;
