# Vídeos gerados pelo admin (longos e Shorts) — pipeline SEPARADO

Na página **Vídeos p/ Redes** do admin há um formulário "Gerar novo vídeo": você escolhe o artigo, o formato (Short ou vídeo longo), a duração, o tom (neutro / pró-empresa / pró-empregado), a voz e a forma de publicação (privado, público ou agendado). O GitHub Actions gera o roteiro, a narração e o vídeo em slides animados (mesmo padrão visual do vídeo "Direto ao Ponto") e envia ao YouTube.

## Separação do que funciona hoje
Nada do pipeline atual (Shorts automáticos em Remotion) foi alterado. O novo usa recursos próprios:

| | Pipeline atual (não mexi) | Pipeline do admin (novo) |
|---|---|---|
| Tabela | `video_jobs` | `video_admin_jobs` |
| Workflow | `video-pipeline.yml` | `video-admin.yml` (só roda quando o admin dispara) |
| Scripts | `scripts/01…12`, `processar-job.mjs` | `scripts/video-admin/` |
| Edge Function | `videos-admin` (lista os Shorts publicados) | `videos-gerar` |
| Storage | `pipeline/jobs/…` | `pipeline/admin-videos/…` |
| Único arquivo existente editado | — | `admin/index.html` (blocos novos + 1 linha em `renderVideos()`) |

Só são compartilhados: a cadeia de IA (`scripts/lib/ia-texto.mjs`, apenas lida), os secrets do GitHub/Supabase e o **canal e a cota diária do YouTube**.

## Implantação (nesta ordem)
1. **Banco:** no SQL Editor do Supabase, rode `supabase/migrations/005_video_admin_jobs.sql`.
2. **Token do GitHub:** crie um *fine-grained token* só para este repositório, permissão **Actions: Read and write** (nada além disso).
3. **Secrets do Supabase** (Edge Functions → Secrets, ou `supabase secrets set`):
   `GITHUB_DISPATCH_TOKEN` (o token do passo 2), `GITHUB_REPO` (ex.: `seu-usuario/seu-repositorio`) e, se a branch não for `main`, `GITHUB_REF`. O `ADMIN_SECRET` já existe.
4. **Função:** `supabase functions deploy videos-gerar --no-verify-jwt`.
5. **Site/repositório:** suba o zip (admin + `scripts/video-admin/` + workflow). Os secrets do GitHub são os mesmos que o pipeline atual já usa (Supabase, Gemini/OpenRouter/NVIDIA, Azure Speech, YouTube); não há secret novo no GitHub.
6. **Primeiro teste (barato):** no admin, escolha um artigo, **Short de 30 s**, voz **Francisca**, publicação **Privado**. Acompanhe a fila na própria página (ou em "Ver execução"). Se der certo, teste um **longo de 2 min** e depois as vozes Thalita (HD) e Gemini.

## Como funciona
`na_fila → roteiro_ok → narracao_ok → render_ok → publicado` (ou `erro`, que continua da etapa que falhou ao clicar em "Tentar de novo").
- **Roteiro** (`roteiro.mjs`, regras em `lib/roteiro-regras.mjs`): a IA recebe o texto completo do artigo e devolve cenas (narração + visual). O código reprova e pede nova tentativa (até 3) se: citar artigo de lei/súmula/tema **que não esteja no artigo**, usar segunda pessoa ("você"), narração com dígitos, ícone fora das listas, cena fora de ordem/contagem ou narração fora da meta de palavras. O tom (neutro, pró-empresa, pró-empregado) muda só a perspectiva, nunca os fatos.
- **Narração** (`narracao.py`): voz cena a cena; a duração real de cada cena define o tempo do slide (sincronia exata). Se a voz escolhida falhar, cai para a Francisca (Azure → Edge) e isso aparece na fila.
- **Vídeo** (`render.mjs` + `slides/template.html`): 24 fps, 1920×1080 (longo) ou 1080×1920 (Short), animação por quadro, áudio original da narração. A capa é a miniatura (1280×720, enviada só no vídeo longo).
- **Publicação** (`publicar.mjs`): privado, público ou agendado (`publishAt`), capítulos no vídeo longo, link do artigo, chamada para inscrição e aviso informativo na descrição.
- **Limpeza** (`limpar.mjs`, ao fim de cada execução): apaga de `admin-videos/` os arquivos com mais de 7 dias (`RETENCAO_DIAS`). Vídeos acima de 48 MB não são guardados no Storage (limite do plano gratuito); vão direto ao YouTube.

## O que foi testado aqui e o que NÃO foi
Testado (ambiente de desenvolvimento, sem acesso às suas contas): leitura de 1.022 artigos do blog (0 falhas); extração de referências; regras do roteiro com respostas de IA simuladas (aprovação, reprovação e nova tentativa); fluxo da narração com voz simulada; renderização real nos dois formatos (vídeo + miniatura); metadados do YouTube e lógica de retomada; sintaxe do TypeScript e do YAML; formulário e fila do admin em navegador real com a função simulada.
**Não testado (exige suas contas): migração no Supabase, deploy e disparo do GitHub pela função, qualidade do roteiro de uma IA real, as vozes Azure HD e Gemini TTS (a Gemini TTS é experimental), tempo real de renderização no GitHub Actions, upload e agendamento no YouTube.** Por isso o primeiro teste deve ser pequeno e privado.

## Limites e custos
- **Cota do YouTube:** compartilhada com os Shorts automáticos. Confira a cota real no Google Cloud Console.
- **Limites do admin:** no máximo 3 vídeos em andamento e 15 por dia (`MAX_ATIVOS`/`MAX_POR_DIA` em `videos-gerar/index.ts`).
- **Azure Speech F0:** 0,5 milhão de caracteres/mês nas vozes neurais padrão; as vozes HD não entram no plano gratuito.
- **GitHub Actions:** o render de um vídeo longo leva alguns minutos de CPU; em repositório privado conta nos minutos mensais.

## Para reverter
Apague `scripts/video-admin/`, `.github/workflows/video-admin.yml`, `supabase/functions/videos-gerar/` e `supabase/migrations/005_…`; restaure `admin/index.html` do zip anterior; opcionalmente `drop table video_admin_jobs` e apague a pasta `pipeline/admin-videos/`. O pipeline antigo continua intacto.

## Onde ajustar
- Prompt, tons, limites e regras: `lib/roteiro-regras.mjs`. · Ícones permitidos: `slides/icones_lucide_lista.txt` (+ SVG em `slides/lucide/`) e `slides/icons.svg` (ícones do site). · Visual: `slides/template.html`. · Vozes: `narracao.py`.
