begin;
-- Generate the worker credential inside Vault; no secret value appears in source control.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'aurum_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'aurum_cron_secret', 'Aurum scheduled worker credential');
  end if;
  if not exists (select 1 from vault.secrets where name = 'aurum_project_url') then
    perform vault.create_secret('https://silaakpxbykwoguiajdb.supabase.co', 'aurum_project_url', 'Aurum worker project');
  end if;
end $$;
-- Temporary service-role-only bridge for deployment. Removed by migration 004 after
-- the function secret is configured. Anonymous/mobile clients cannot execute it.
create function public.aurum_auto_bootstrap_secret() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'aurum_cron_secret';
$$;
revoke all on function public.aurum_auto_bootstrap_secret() from public, anon, authenticated;
grant execute on function public.aurum_auto_bootstrap_secret() to service_role;
commit;
