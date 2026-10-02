-- Memória das fotos já usadas nos vídeos, pra nunca repetir a mesma imagem (nem uma
-- visualmente parecida) entre vídeos diferentes. Rode uma vez no SQL Editor do Supabase.
-- Pode rodar mesmo se você já rodou a versão anterior deste arquivo.
create table if not exists video_fotos_usadas (
  foto_id text primary key,            -- ex.: "pexels:1234567"
  job_id uuid,
  usado_em timestamptz not null default now()
);
alter table video_fotos_usadas add column if not exists phash text;   -- hash perceptual (16 hex)
alter table video_fotos_usadas add column if not exists termo text;   -- termo de busca que achou a foto
create index if not exists idx_video_fotos_usadas_data on video_fotos_usadas(usado_em desc);
