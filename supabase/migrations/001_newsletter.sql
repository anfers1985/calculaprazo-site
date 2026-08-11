-- ════════════════════════════════════════════════════════════════════════
-- NEWSLETTER — schema inicial
-- ════════════════════════════════════════════════════════════════════════
-- Como rodar: cole este arquivo inteiro no SQL Editor do painel do Supabase
-- (Project → SQL Editor → New query) e clique em "Run". É seguro rodar uma
-- única vez; rodar de novo por engano vai dar erro de "já existe" (não some
-- nada, só recusa recriar).
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── Assinantes ────────────────────────────────────────────────────────
create table newsletter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  status           text not null default 'active' check (status in ('active','unsubscribed')),
  subscribed_at    timestamptz not null default now(),
  unsubscribed_at  timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid()
);

create index idx_newsletter_subscribers_status on newsletter_subscribers(status);

-- RLS: a tabela fica totalmente fechada por padrão. Nenhum acesso direto
-- (nem leitura, nem escrita) é permitido via API pública — tudo passa pelas
-- Edge Functions, que usam a service_role key (acesso irrestrito, só no
-- backend, nunca exposta no navegador).
alter table newsletter_subscribers enable row level security;

-- ─── Campanhas ─────────────────────────────────────────────────────────
create table newsletter_campaigns (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null,
  body_markdown    text not null default '',
  article_ids      jsonb not null default '[]'::jsonb,   -- [{"id":"slug-do-post","show_image":true}, ...]
  calculator_slugs jsonb not null default '[]'::jsonb,   -- ["calculadora-imc", ...]
  status           text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed')),
  scheduled_for    timestamptz,                           -- nulo = ainda sem data marcada
  sent_at          timestamptz,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_newsletter_campaigns_status_sched on newsletter_campaigns(status, scheduled_for);

alter table newsletter_campaigns enable row level security;
-- Mesma lógica: fechada por padrão, só as Edge Functions (service_role) mexem aqui.

-- ─── Log de envios (auditoria simples — quantos e-mails saíram por campanha) ──
create table newsletter_sends_log (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references newsletter_campaigns(id) on delete cascade,
  sent_count   integer not null default 0,
  failed_count integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table newsletter_sends_log enable row level security;

-- ─── Função utilitária: atualiza "updated_at" automaticamente ──────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_newsletter_campaigns_updated_at
  before update on newsletter_campaigns
  for each row execute function set_updated_at();
