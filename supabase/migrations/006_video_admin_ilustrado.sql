-- ═════════════════════════════════════════════════
-- 006 — Short ILUSTRADO (imagens por IA) + par do dia (longo + Short)
-- ═════════════════════════════════════════════════
-- Só ACRESCENTA colunas; nenhum dado existente é alterado e os status continuam os mesmos
-- (as imagens são geradas dentro da etapa "render" e ficam em cache no Storage).
-- Rode no SQL Editor do Supabase DEPOIS da 005.

-- 'slides' = vídeo do estilo "Direto ao Ponto" (longo e Shorts antigos); 'ilustrado' = Short com ilustrações por IA
alter table public.video_admin_jobs add column if not exists estilo text not null default 'slides';
alter table public.video_admin_jobs drop constraint if exists video_admin_jobs_estilo_check;
alter table public.video_admin_jobs add constraint video_admin_jobs_estilo_check check (estilo in ('slides','ilustrado'));

-- jobs criados juntos pelo botão "Gerar o par do dia" compartilham o mesmo par_id
alter table public.video_admin_jobs add column if not exists par_id uuid;
