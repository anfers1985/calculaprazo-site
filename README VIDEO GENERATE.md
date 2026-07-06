# Pipeline de Vídeo — Calcula Prazo (Fase 1: Shorts)

Gera e publica automaticamente um YouTube Short a partir de cada post novo do blog,
sem intervenção humana depois da publicação do artigo.

Custo de operação: **zero**, dentro dos limites gratuitos de GitHub Actions e Gemini free
tier. Nenhum componente exige cartão de crédito: a narração usa Piper (TTS local, MIT,
sem conta em nenhum serviço), a thumbnail é renderizada por HTML/CSS (sem IA), e o
YouTube Data API v3 não cobra nada.

## O que esta pasta contém

```
video-pipeline/
├── .github/workflows/video-pipeline.yml   ← orquestrador (roda tudo)
├── supabase/schema.sql                    ← tabela de controle dos jobs
├── config/prompts.json                    ← prompt do roteiro (editável)
├── scripts/                               ← cada módulo da pipeline
└── remotion/                              ← projeto de renderização do vídeo
```

## Passo a passo de configuração (uma vez só)

### 1. Copiar para o seu repositório
Copie o conteúdo desta pasta para a raiz do repositório `calculaprazo-site` (ou um repo
separado, se preferir manter isolado do site).

### 2. Supabase
Você já usa Supabase no motor-cct — pode ser o mesmo projeto ou um novo.
1. Abra o SQL Editor do seu projeto Supabase e rode o conteúdo de `supabase/schema.sql`.
2. Em Project Settings → API, copie a **Project URL** e a **service_role key** (não a
   `anon key` — os scripts precisam de permissão de escrita).

### 3. Gemini (para as imagens das cenas)
1. Gere uma API key gratuita em https://aistudio.google.com/apikey (não pede cartão).
2. Guarde como `GEMINI_API_KEY`.

### 4. YouTube (OAuth2, uma única vez)
1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto e ative
   a **YouTube Data API v3**.
2. Em "Credenciais", crie uma credencial OAuth2 do tipo **App para computador**. Copie
   o Client ID e o Client Secret.
3. No seu notebook, exporte as duas variáveis e rode:
   ```
   export YOUTUBE_CLIENT_ID=...
   export YOUTUBE_CLIENT_SECRET=...
   node scripts/gerar-refresh-token-youtube.mjs
   ```
4. Siga as instruções na tela (fazer login com a conta dona do canal @CalculaPrazo).
   Isso gera o `refresh_token` — guarde-o, ele não expira.

### 5. Secrets no GitHub
Em Settings → Secrets and variables → Actions, cadastre:

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | service_role key do Supabase |
| `WORKER_SECRET` | o mesmo `ADMIN_SECRET` do seu Worker `calculaprazo-views-api` |
| `GEMINI_API_KEY` | chave do passo 3 (usada tanto no roteiro quanto nas imagens, igual ao admin faz hoje) |
| `AI_MODEL` | opcional — só se o seu Worker exigir o nome do modelo Gemini explicitamente |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REFRESH_TOKEN` | do passo 4 |

### 6. Ativar
Dê push. O workflow roda automaticamente quando `data/posts.json` muda, e também de
hora em hora (pra reprocessar qualquer job que tenha ficado pendente ou com erro).

## Como funciona o reprocessamento em caso de falha

Cada etapa grava seu progresso na tabela `video_jobs` do Supabase. Se uma etapa falhar
(ex: a IA devolveu um JSON malformado, ou o Gemini recusou uma imagem), o job fica com
`status = 'erro'` e `erro_etapa` indicando onde parou. Na próxima rodada (automática, de
hora em hora, ou manual via "Run workflow" no GitHub), a pipeline retoma exatamente
daquela etapa — não refaz o que já deu certo.

## Limitações conhecidas desta primeira versão (Fase 1)

- Só gera Shorts (vídeo vertical, até ~60s). Vídeo longo é a Fase 2.
- A voz do Piper (`pt_BR-faber-medium`) é masculina — hoje é a única voz pt-BR estável e
  gratuita disponível nesse motor. Se quiser trocar de voz/motor de TTS no futuro, a
  única coisa que muda é `scripts/03-narracao.py` — o resto da pipeline não é afetado.
- As legendas são sincronizadas por cena (não palavra por palavra) — usam a duração real
  do áudio de cada cena. Funciona bem para o estilo "frase aparece, é falada, some".
- O modelo de imagem do Gemini (`GEMINI_IMAGE_MODEL` em `scripts/05-imagens.mjs`) muda de
  nome de tempos em tempos — confirme o nome atual em aistudio.google.com antes de rodar
  pela primeira vez.
- Se o Gemini recusar gerar a imagem de uma cena (comum em temas sensíveis do blog —
  trabalho escravo, assédio, acidentes), a pipeline tenta de novo uma vez e, se falhar
  outra vez, usa um card de marca simples no lugar — o job continua, não trava por causa
  de uma imagem.
- O Centro de Configuração de Prompts (painel admin) ainda não foi construído — por
  enquanto, o prompt do roteiro é editado diretamente em `config/prompts.json`. Faz mais
  sentido construir esse painel depois que o formato de roteiro estiver validado com
  vídeos reais publicados.

## Testando uma etapa isolada (sem rodar a pipeline inteira)

```bash
export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
node scripts/02-gerar-roteiro.mjs <job_id>
python3 scripts/03-narracao.py <job_id>
# etc.
```
