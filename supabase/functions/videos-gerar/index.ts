// ═════════════════════════════════════════════════
// videos-gerar — Edge Function do painel admin para GERAR vídeos (longos e Shorts)
// ═════════════════════════════════════════════════
// SEPARADA de videos-admin (que só lista os Shorts automáticos já publicados).
//
// Ações (POST JSON, header x-admin-secret = ADMIN_SECRET, o mesmo das outras functions):
//   criar    { slug, tipo: 'short'|'longo', duracao_seg, tom, voz, publicacao, agendar_em? }
//            → valida, grava em video_admin_jobs e dispara o workflow "Vídeo do admin" no GitHub
//   listar   { limite? }  → últimos jobs, com links temporários de download enquanto os arquivos existirem
//   retomar  { id }       → dispara de novo um job que falhou (ele continua da etapa que errou)
//
// Secrets necessários (supabase secrets set ...):
//   ADMIN_SECRET                (já existe)
//   GITHUB_DISPATCH_TOKEN       token fine-grained do repositório com "Actions: Read and write"
//   GITHUB_REPO                 ex.: "seu-usuario/seu-repositorio"
//   GITHUB_REF                  (opcional) branch do workflow; padrão "main"
//
// Deploy: supabase functions deploy videos-gerar --no-verify-jwt
// ═════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SECRET = Deno.env.get('ADMIN_SECRET')!;
const GITHUB_TOKEN = Deno.env.get('GITHUB_DISPATCH_TOKEN') || '';
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') || '';
const GITHUB_REF = Deno.env.get('GITHUB_REF') || 'main';

const SITE = 'https://calculaprazo.com.br';
const BUCKET = 'pipeline';
const WORKFLOW = 'video-admin.yml';
const MAX_ATIVOS = 3;   // jobs simultâneos em andamento
const MAX_POR_DIA = 15; // proteção de minutos do GitHub Actions e cota do YouTube
const SIGNED_URL_EXPIRA_EM = 60 * 60 * 6;

const LIMITES: Record<string, [number, number]> = { short: [15, 180], longo: [60, 900] };
const TONS = ['neutro', 'empresa', 'empregado'];
const VOZES = ['francisca', 'thalita-hd', 'gemini'];
const PUBLICACOES = ['privado', 'publico', 'agendado'];
const SLUG_RE = /^[a-z0-9][a-z0-9\-._]*(?:\/[a-z0-9][a-z0-9\-._]*)?$/i;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

async function dispararWorkflow(jobId: string): Promise<void> {
  if (!GITHUB_TOKEN || !GITHUB_REPO) throw new Error('GITHUB_DISPATCH_TOKEN e GITHUB_REPO não estão configurados no Supabase.');
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'calculaprazo-videos-gerar',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: GITHUB_REF, inputs: { job_id: jobId } }),
  });
  if (r.status !== 204) throw new Error(`GitHub recusou o disparo (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
}

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRA_EM);
  return error ? null : data.signedUrl;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) return json({ error: 'Não autorizado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  try {
    switch (body.action) {
      case 'criar': {
        const slug = String(body.slug || '').trim();
        const tipo = String(body.tipo || '');
        const dur = Math.round(Number(body.duracao_seg));
        const tom = String(body.tom || 'neutro');
        const voz = String(body.voz || 'francisca');
        const publicacao = String(body.publicacao || 'privado');
        if (!SLUG_RE.test(slug)) return json({ error: 'Artigo inválido.' }, 400);
        if (!LIMITES[tipo]) return json({ error: 'Formato inválido (use short ou longo).' }, 400);
        const [min, max] = LIMITES[tipo];
        if (!(dur >= min && dur <= max)) return json({ error: `Duração fora do limite para ${tipo}: ${min} a ${max} segundos.` }, 400);
        if (!TONS.includes(tom)) return json({ error: 'Tom inválido.' }, 400);
        if (!VOZES.includes(voz)) return json({ error: 'Voz inválida.' }, 400);
        if (!PUBLICACOES.includes(publicacao)) return json({ error: 'Forma de publicação inválida.' }, 400);
        let agendarEm: string | null = null;
        if (publicacao === 'agendado') {
          const d = new Date(String(body.agendar_em || ''));
          if (isNaN(d.getTime()) || d.getTime() < Date.now() + 15 * 60 * 1000) return json({ error: 'Escolha uma data e hora de agendamento com pelo menos 15 minutos de antecedência.' }, 400);
          agendarEm = d.toISOString();
        }
        const postUrl = `${SITE}/blog/${slug}`;
        const head = await fetch(postUrl, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
        if (!head || !head.ok) return json({ error: 'Esse artigo ainda não está publicado no site (a página não abriu). Publique-o antes de gerar o vídeo.' }, 400);

        const { count: ativos } = await supabase.from('video_admin_jobs').select('id', { count: 'exact', head: true }).in('status', ['na_fila', 'roteiro_ok', 'narracao_ok', 'render_ok']);
        if ((ativos ?? 0) >= MAX_ATIVOS) return json({ error: `Já existem ${ativos} vídeos em andamento. Aguarde terminar (limite ${MAX_ATIVOS}).` }, 429);
        const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: hoje } = await supabase.from('video_admin_jobs').select('id', { count: 'exact', head: true }).gte('criado_em', desde);
        if ((hoje ?? 0) >= MAX_POR_DIA) return json({ error: `Limite de ${MAX_POR_DIA} vídeos por dia atingido.` }, 429);

        const { data: job, error } = await supabase.from('video_admin_jobs').insert({
          post_slug: slug, post_url: postUrl, tipo, duracao_alvo_seg: dur, tom, voz, publicacao, agendar_em: agendarEm,
        }).select('id').single();
        if (error) throw error;
        try {
          await dispararWorkflow(job.id);
        } catch (e) {
          await supabase.from('video_admin_jobs').update({ status: 'erro', erro_etapa: 'disparo', erro_mensagem: String((e as Error).message).slice(0, 500) }).eq('id', job.id);
          return json({ error: (e as Error).message, id: job.id, disparo_falhou: true }, 502);
        }
        return json({ ok: true, id: job.id });
      }

      case 'listar': {
        const limite = Math.min(Math.max(Number(body.limite) || 20, 1), 50);
        const { data: jobs, error } = await supabase.from('video_admin_jobs')
          .select('id, post_slug, post_url, post_titulo, tipo, duracao_alvo_seg, duracao_real_seg, tom, voz, publicacao, agendar_em, status, etapa_atual, erro_etapa, erro_mensagem, youtube_url, github_run_url, video_path, thumbnail_path, criado_em, publicado_em, arquivos_apagados_em, roteiro')
          .order('criado_em', { ascending: false }).limit(limite);
        if (error) throw error;
        const lista = await Promise.all((jobs || []).map(async (j) => {
          const { roteiro, video_path, thumbnail_path, ...resto } = j as any;
          return {
            ...resto,
            titulo_youtube: roteiro?.titulo_seo || null,
            voz_usada: roteiro?.voz_usada || null,
            video_url: await signedUrl(video_path),
            thumbnail_url: await signedUrl(thumbnail_path),
          };
        }));
        return json({ jobs: lista });
      }

      case 'retomar': {
        const id = String(body.id || '');
        const { data: job } = await supabase.from('video_admin_jobs').select('id, status').eq('id', id).single();
        if (!job) return json({ error: 'Job não encontrado.' }, 404);
        if (job.status !== 'erro') return json({ error: 'Só é possível retomar jobs com erro.' }, 400);
        await supabase.from('video_admin_jobs').update({ tentativas: 0 }).eq('id', id);
        try { await dispararWorkflow(id); } catch (e) { return json({ error: (e as Error).message }, 502); }
        return json({ ok: true });
      }

      default:
        return json({ error: 'Ação desconhecida' }, 400);
    }
  } catch (err) {
    console.error('videos-gerar error:', err);
    return json({ error: (err as Error).message || 'Erro interno' }, 500);
  }
});
