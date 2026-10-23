-- ═════════════════════════════════════════════════
-- 005 — Pipeline de vídeos gerados pelo admin (SEPARADO de video_jobs)
-- ═════════════════════════════════════════════════
-- Tabela própria: o pipeline antigo (video_jobs, Remotion, Shorts automáticos) não é tocado.
-- Arquivos no Storage ficam em pipeline/admin-videos/<id>/ (o workflow "Limpar Storage" atual só olha jobs/).
-- Só a service role acessa (RLS ligado, sem policies).

create table if not exists public.video_admin_jobs (
  id               uuid primary key default gen_random_uuid(),
  post_slug        text        not null,
  post_url         text        not null,
  post_titulo      text,
  tipo             text        not null check (tipo in ('short','longo')),
  duracao_alvo_seg int         not null check (duracao_alvo_seg between 15 and 900),
  tom              text        not null default 'neutro'    check (tom in ('neutro','empresa','empregado')),
  voz              text        not null default 'francisca' check (voz in ('francisca','thalita-hd','gemini')),
  publicacao       text        not null default 'privado'   check (publicacao in ('privado','publico','agendado')),
  agendar_em       timestamptz,
  status           text        not null default 'na_fila'
                   check (status in ('na_fila','roteiro_ok','narracao_ok','render_ok','publicado','erro')),
  etapa_atual      text,
  erro_etapa       text,
  erro_mensagem    text,
  tentativas       int         not null default 0,
  roteiro          jsonb,
  duracao_real_seg numeric,
  narracao_path    text,
  video_path       text,
  thumbnail_path   text,
  youtube_video_id text,
  youtube_url      text,
  github_run_url   text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  publicado_em     timestamptz,
  arquivos_apagados_em timestamptz
);

create index if not exists video_admin_jobs_criado_idx on public.video_admin_jobs (criado_em desc);
create index if not exists video_admin_jobs_status_idx on public.video_admin_jobs (status);

create or replace function public.video_admin_set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists video_admin_jobs_atualizado on public.video_admin_jobs;
create trigger video_admin_jobs_atualizado
  before update on public.video_admin_jobs
  for each row execute function public.video_admin_set_atualizado_em();

alter table public.video_admin_jobs enable row level security;
