# Guia de Implantação — Pipeline de Vídeo Calcula Prazo (Fase 1: Shorts)

Este é o guia único. Siga na ordem — cada passo depende do anterior.

---

## ✅ Checklist rápido (visão geral)

- [ ] 1. Copiar os arquivos para o repositório
- [ ] 2. Criar a tabela no Supabase
- [ ] 3. Gerar a chave gratuita do Gemini
- [ ] 4. Criar projeto + credencial OAuth2 no Google Cloud (YouTube)
- [ ] 5. Gerar o refresh token do YouTube (rodar 1 script local)
- [ ] 6. Cadastrar os secrets no GitHub
- [ ] 7. Dar push e acompanhar a primeira execução
- [ ] 8. Testar com 1 post antes de deixar 100% automático

---

## Passo 1 — Copiar os arquivos

Descompacte `video-pipeline.zip` e copie **todo o conteúdo** para a raiz do repositório
`calculaprazo-site` (ou um repositório novo, separado do site — tanto faz, desde que o
workflow tenha acesso ao arquivo `data/posts.json`).

Estrutura que deve ficar na raiz do repo:
```
.github/workflows/video-pipeline.yml
supabase/schema.sql
config/prompts.json
package.json
scripts/  (todos os .mjs e .py)
remotion/ (projeto de renderização)
README.md
```

---

## Passo 2 — Supabase

1. Pode ser o mesmo projeto Supabase do motor-cct, ou um novo — sua escolha.
2. Abra **SQL Editor** no painel do Supabase.
3. Cole e rode o conteúdo de `supabase/schema.sql` (cria a tabela `video_jobs`).
4. Vá em **Project Settings → API** e copie:
   - **Project URL** → vai virar o secret `SUPABASE_URL`
   - **service_role key** (⚠️ não é a `anon key`) → vai virar `SUPABASE_SERVICE_KEY`

---

## Passo 3 — Gemini (gratuito, sem cartão)

1. Acesse https://aistudio.google.com/apikey
2. Clique em "Create API key" — não pede cartão de crédito.
3. Guarde essa chave → vai virar o secret `GEMINI_API_KEY`.
4. Essa mesma chave é usada tanto para o roteiro (texto) quanto para as imagens das
   cenas — é o mesmo jeito que seu admin já usa hoje.

---

## Passo 4 — Google Cloud + YouTube (OAuth2)

1. Acesse https://console.cloud.google.com e crie um projeto (ou use um existente).
2. Vá em **APIs e Serviços → Biblioteca**, procure **YouTube Data API v3** e clique
   em **Ativar**.
3. Vá em **APIs e Serviços → Credenciais → Criar Credenciais → ID do cliente OAuth**.
4. Tipo de aplicativo: **App para computador (Desktop app)**.
5. Copie o **Client ID** e o **Client Secret** gerados — vão virar os secrets
   `YOUTUBE_CLIENT_ID` e `YOUTUBE_CLIENT_SECRET`.

Isso não custa nada e não tem cota que cobre dinheiro — só unidades de uso diário,
bem acima do que você vai precisar (ver observação no fim deste guia).

---

## Passo 5 — Gerar o refresh token do YouTube (roda 1 vez, no seu notebook)

Esse passo precisa ser feito no seu computador, não no GitHub — porque exige abrir um
link e fazer login com a conta **dona do canal @CalculaPrazo**.

```bash
cd video-pipeline
npm install googleapis
export YOUTUBE_CLIENT_ID="cole aqui o Client ID do passo 4"
export YOUTUBE_CLIENT_SECRET="cole aqui o Client Secret do passo 4"
node scripts/gerar-refresh-token-youtube.mjs
```

O terminal vai mostrar um link. Abra, faça login com a conta do canal, autorize, e
cole de volta no terminal o código que a Google mostrar. O script vai imprimir o
`refresh_token` — guarde-o, ele não expira. Vira o secret `YOUTUBE_REFRESH_TOKEN`.

---

## Passo 6 — Cadastrar os secrets no GitHub

No repositório: **Settings → Secrets and variables → Actions → New repository secret**.
Cadastre um por um:

| Secret | De onde veio |
|---|---|
| `SUPABASE_URL` | Passo 2 |
| `SUPABASE_SERVICE_KEY` | Passo 2 |
| `WORKER_SECRET` | O mesmo valor que já é `ADMIN_SECRET` no seu Worker `calculaprazo-views-api` hoje |
| `GEMINI_API_KEY` | Passo 3 |
| `YOUTUBE_CLIENT_ID` | Passo 4 |
| `YOUTUBE_CLIENT_SECRET` | Passo 4 |
| `YOUTUBE_REFRESH_TOKEN` | Passo 5 |

Não precisa cadastrar `AI_MODEL` — é opcional, só usa se seu Worker exigir isso
explicitamente (hoje não exige, pelo que vi no seu `admin/index.html`).

---

## Passo 7 — Ativar e acompanhar

1. Dê `git push` com os arquivos do Passo 1 já no repositório.
2. O workflow **Video Pipeline** roda automaticamente:
   - toda vez que `data/posts.json` mudar (novo post publicado);
   - e também de hora em hora (pra pegar qualquer job pendente ou com erro).
3. Acompanhe em **Actions** no GitHub. Cada job de vídeo vira uma linha na tabela
   `video_jobs` do Supabase — dá pra ver o status ali também (`queued`, `roteiro_ok`,
   `narracao_ok`, ..., `publicado`, ou `erro`).
4. Se algum job der `erro`, o campo `erro_etapa` mostra onde parou. Rodar o workflow de
   novo (manual, via "Run workflow", ou esperar a próxima hora) retoma dali — não refaz
   o que já deu certo.

---

## Passo 8 — Testar com 1 post antes de confiar 100%

Recomendo fortemente: publique (ou escolha) **1 post** e deixe só ele na fila antes de
soltar pra todo post novo automaticamente. Veja o vídeo final publicado no canal, cheque
narração, legendas, imagens e thumbnail. Ajustes de prompt ficam em `config/prompts.json`
(edite e dê push de novo).

Se quiser testar uma etapa isolada, sem esperar o workflow inteiro:
```bash
export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
node scripts/02-gerar-roteiro.mjs <job_id>
python3 scripts/03-narracao.py <job_id>
node scripts/05-imagens.mjs <job_id>
# etc — os ids ficam na tabela video_jobs
```

---

## O que já está resolvido nesta versão

- Narração 100% local (Piper, MIT, zero custo, sem cartão) — roda dentro do próprio
  GitHub Actions, não precisa do seu notebook ligado.
- Thumbnail sem IA (HTML/CSS renderizado via Playwright) — identidade visual sempre
  idêntica, sem gastar tokens.
- Fallback automático se o Gemini recusar gerar imagem de um tema sensível (trabalho
  escravo, assédio etc.) — o job continua com um card de marca no lugar.
- Reprocessamento automático a partir da etapa que falhou, sem refazer o que já deu certo.

## O que ainda não está pronto (próximas fases, se quiser seguir depois)

- Vídeo longo (16:9) — hoje só gera Shorts verticais.
- Centro de Configuração de Prompts (painel admin visual) — por enquanto os prompts se
  editam direto em `config/prompts.json`.
- Cota do YouTube: hoje (2026) o upload consome ~100 unidades de um total de 10.000/dia,
  então cabem dezenas de vídeos por dia sem qualquer custo — não é um limitador real no
  seu volume.
