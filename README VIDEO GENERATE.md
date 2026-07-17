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
| `GEMINI_API_KEY` | chave do passo 3 (usada só pra gerar o roteiro em texto, não imagem) |
| `AI_MODEL` | opcional — só se o seu Worker exigir o nome do modelo Gemini explicitamente |
| `EDGE_TTS_VOICE` | opcional — nome da voz Edge TTS, padrão `pt-BR-FranciscaNeural` |
| `PEXELS_API_KEY` | chave gratuita em pexels.com/api — usada pra buscar as fotos das cenas |
| `PIXABAY_API_KEY` | opcional — chave gratuita em pixabay.com/api/docs, reforço se o Pexels não achar foto |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REFRESH_TOKEN` | do passo 4 |

### 6. Ativar
Dê push. O workflow roda automaticamente quando `data/posts.json` muda, e também de
hora em hora (pra reprocessar qualquer job que tenha ficado pendente ou com erro).

## Como funciona o reprocessamento em caso de falha

Cada etapa grava seu progresso na tabela `video_jobs` do Supabase. Se uma etapa falhar
(ex: a IA devolveu um JSON malformado, ou nenhuma foto foi encontrada pra uma cena), o job fica com
`status = 'erro'` e `erro_etapa` indicando onde parou. Na próxima rodada (automática, de
hora em hora, ou manual via "Run workflow" no GitHub), a pipeline retoma exatamente
daquela etapa — não refaz o que já deu certo.

## Limitações conhecidas desta primeira versão (Fase 1)

- Só gera Shorts (vídeo vertical, até ~60s). Vídeo longo é a Fase 2.
- A narração usa Edge TTS (vozes neurais da Microsoft, gratuitas, sem chave de API) —
  voz padrão `pt-BR-FranciscaNeural`, feminina. É uma API não-oficial (mesmo motor do
  "Ler em voz alta" do Edge, sem passar pela conta paga do Azure), então não tem SLA
  garantido; se um dia parar de funcionar, a alternativa "oficial" é o Azure Speech de
  verdade (mesmas vozes, só precisa criar chave paga com cota grátis mensal).
- As legendas são sincronizadas por cena (não palavra por palavra) — usam a duração real
  do áudio de cada cena. Funciona bem para o estilo "frase aparece, é falada, some".
- As imagens são fotos reais buscadas no Pexels (com Pixabay como reforço), não geradas
  por IA — isso elimina o risco de mão/rosto malformado, mas depende do roteiro escrever
  bons termos de busca em inglês (`prompt_imagem` em `config/prompts.json`). Se nenhuma
  foto for encontrada pra uma cena, a pipeline usa um card de marca simples no lugar — o
  job continua, não trava por causa de uma imagem.
- A padronização visual entre fotos de fontes diferentes é feita por um filtro/overlay de
  cor fixo no Remotion (`remotion/src/VideoComposition.jsx`), não nas próprias fotos —
  trocar a paleta do canal é editar esse arquivo, não o script de busca de imagem.
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
