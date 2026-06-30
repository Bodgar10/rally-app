-- 017 · Programa la reconstrucción de ratings (nocturna) vía pg_cron + pg_net.
-- Habilitar antes en el dashboard: Database → Extensions → pg_cron, pg_net.
-- El CRON_SECRET debe coincidir con el secret de la Edge Function.

select cron.schedule(
  'recompute-ratings-nightly',
  '0 8 * * *',   -- 08:00 UTC (~02:00 CDMX). Ajustar a gusto.
  $$
  select net.http_post(
    url     := 'https://xnyhgikcrzalzquzlzyu.supabase.co/functions/v1/cron-recompute-ratings',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', current_setting('app.cron_secret', true)),
    body    := '{}'::jsonb
  );
  $$
);
-- Nota: define el secret con
--   alter database postgres set app.cron_secret = '<CRON_SECRET>';
-- o incrusta el header directamente si prefieres no usar GUC.
