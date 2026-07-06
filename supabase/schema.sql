-- Tabela de orquestração da pipeline de vídeo.
-- Cada linha = um vídeo (Short ou longo) gerado a partir de um post do blog.

create table if not exists video_jobs (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null,
  post_url text not null,
  tipo text not null default 'short' check (tipo in ('short', 'longo')),

  status text not null default 'queued' check (status in (
    'queued',
    'roteiro_ok',
    'narracao_ok',
    'legendas_ok',
    'imagens_ok',
    'thumbnail_ok',
    'render_ok',
    'publicado',
    'erro'
  )),

  -- payloads de cada etapa (JSON), preenchidos progressivamente
  roteiro jsonb,          -- {titulo_seo, descricao, hashtags, cenas: [{texto, narracao, prompt_imagem, duracao_seg}]}
  narracao_path text,     -- caminho/URL do áudio gerado
  legendas_path text,     -- caminho/URL do .srt
  imagens jsonb,          -- array de caminhos/URLs por cena
  thumbnail_path text,
  video_path text,        -- vídeo final renderizado
  youtube_video_id text,

  erro_mensagem text,     -- populado quando status = 'erro'
  erro_etapa text,        -- em qual etapa falhou, para retomar dali

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_video_jobs_status on video_jobs(status);

-- Atualiza "atualizado_em" automaticamente
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_video_jobs_atualizado on video_jobs;
create trigger trg_video_jobs_atualizado
  before update on video_jobs
  for each row execute function set_atualizado_em();
