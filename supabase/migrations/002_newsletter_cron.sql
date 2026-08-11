-- ════════════════════════════════════════════════════════════════════════
-- NEWSLETTER — Cron Job (checagem automática 09h e 15h, todo dia)
-- ════════════════════════════════════════════════════════════════════════
-- Como rodar: SÓ DEPOIS de publicar a Edge Function "newsletter-send" (veja
-- supabase/functions/newsletter-send/). Antes de rodar este arquivo, troque:
--   1. SEU_PROJECT_REF   → o ref do seu projeto (aparece na URL do painel,
--                           algo como "abcdefghijklmnop")
--   2. SEU_CRON_SECRET   → o MESMO valor que você configurou com
--                           `supabase secrets set CRON_SECRET=...`
--
-- Cole no SQL Editor do Supabase e rode uma vez.
-- ════════════════════════════════════════════════════════════════════════

-- Habilita as extensões necessárias (pg_cron agenda, pg_net faz a chamada HTTP)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 09h e 15h em Brasília (UTC-3) = 12h e 18h em UTC — todo dia da semana
select cron.schedule(
  'newsletter-dispatch',
  '0 12,18 * * *',
  $$
  select net.http_post(
    url := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/newsletter-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'SEU_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pra conferir que o job foi criado:
--   select * from cron.job;
-- Pra remover o job (se precisar):
--   select cron.unschedule('newsletter-dispatch');
-- Pra ver o histórico de execuções:
--   select * from cron.job_run_details order by start_time desc limit 20;
