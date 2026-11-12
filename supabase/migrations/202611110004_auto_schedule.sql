-- Apply after configure-auto-worker.py has deployed the function and set its secret.
begin;
drop function public.aurum_auto_bootstrap_secret();
-- Run only after the migration and Edge Function are deployed.
-- Store AURUM_CRON_SECRET in Edge Function secrets AND as aurum_cron_secret in Vault.
-- Store https://YOUR_PROJECT.supabase.co in Vault as aurum_project_url.
-- Never place these secrets in EXPO_PUBLIC_* or commit their values.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'aurum_cron_secret' and length(decrypted_secret) >= 32)
    or not exists (select 1 from vault.decrypted_secrets where name = 'aurum_project_url' and decrypted_secret = 'https://silaakpxbykwoguiajdb.supabase.co') then
    raise exception 'Configure aurum_cron_secret and aurum_project_url in Vault first.';
  end if;
end $$;

-- Named job: repeated setup updates this job rather than creating duplicate workers.
select cron.schedule('aurum-auto-reports', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'aurum_project_url') || '/functions/v1/auto-reports',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-aurum-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'aurum_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

commit;
