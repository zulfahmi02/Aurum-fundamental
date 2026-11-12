begin;
-- Preserve old snapshots. New directional reports require a versioned explanation.
alter table public.aurum_auto_reports drop constraint auto_report_format;
alter table public.aurum_auto_reports add constraint auto_report_format check (
  (payload->>'version') is not distinct from '1'
  and (payload->>'origin') is not distinct from 'server'
  and coalesce(payload->>'bias' in ('NO_SIGNAL', 'BUY', 'SELL', 'NEUTRAL'), false)
  and (payload->>'id') is not distinct from id
  and jsonb_typeof(payload->'reasons') is not distinct from 'array'
  and (payload->>'bias' = 'NO_SIGNAL' or (
    (payload->'analysis'->>'model') is not distinct from 'fundamental-scenario-v1'
    and (payload->'analysis'->>'experimental') is not distinct from 'true'
    and (payload->'analysis'->>'bias') is not distinct from (payload->>'bias')
    and jsonb_typeof(payload->'analysis'->'reasons') is not distinct from 'array'
    and (payload->'analysis'->'blockers') is not distinct from '[]'::jsonb
  ))
  and octet_length(payload::text) <= 100000
);
-- RLS and write privileges remain service-only.
commit;
