-- ════════════════════════════════════════════════════════════════════════
-- Retenção dos arquivos de vídeo publicados (Storage)
-- ════════════════════════════════════════════════════════════════════════
-- Antes, o Storage era limpo (vídeo/capa apagados) logo após a publicação
-- no YouTube. Agora os arquivos ficam retidos por alguns dias (padrão: 5,
-- ver scripts/10-limpar-jobs-travados.mjs) para permitir baixá-los no admin
-- ("Vídeos p/ Redes") e postar manualmente no X, Instagram, Facebook,
-- LinkedIn e TikTok.
--
-- Esta coluna guarda o instante em que o job foi marcado "publicado", que é
-- o início da contagem da janela de retenção.
--
-- Rode este script uma vez no SQL Editor do seu projeto Supabase.

alter table video_jobs
  add column if not exists publicado_em timestamptz;

-- Preenche retroativamente jobs já publicados que ainda não têm a data
-- registrada, usando a data de criação como aproximação. Sem isso, a
-- primeira rodada de limpeza depois de aplicar esta migration apagaria (ou
-- deixaria de apagar) todo o histórico de uma vez só.
update video_jobs
  set publicado_em = criado_em
  where status = 'publicado' and publicado_em is null;
