// ═════════════════════════════════════════════════
// videos-gerar — Edge Function do painel admin para GERAR vídeos (longos e Shorts)
// ═════════════════════════════════════════════════
// SEPARADA de videos-admin (que só lista os Shorts automáticos já publicados).
//
// Ações (POST JSON, header x-admin-secret = ADMIN_SECRET, o mesmo das outras functions):
//   criar    { slug, tipo: 'short'|'longo', duracao_seg, tom, voz, publicacao, agendar_em?, estilo?: 'slides'|'ilustrado' }
//            → valida, grava em video_admin_jobs e dispara o workflow "Vídeo do admin" no GitHub
//            (estilo só vale para short; padrão do short = 'ilustrado'; o longo é sempre 'slides')
//   criar_par { slug, duracao_longo_seg, duracao_short_seg, tom, voz, publicacao, agendar_longo_em?, agendar_short_em? }
//            → cria o vídeo LONGO (slides) + o SHORT ilustrado do mesmo artigo numa só execução do GitHub (um depois do outro)
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
const RETENCAO_DIAS = 5; // mesmo valor de scripts/video-admin/limpar.mjs e da função videos-admin

function montarDescricaoCompleta(roteiro: any, postUrl: string | null): string {
  const partes = [String(roteiro?.descricao || '').trim()];
  if (postUrl) partes.push(`Saiba mais: ${postUrl}`);
  const tags: string[] = roteiro?.hashtags || [];
  if (tags.length) partes.push(tags.join(' '));
  return partes.filter(Boolean).join('\n\n');
}

const LIMITES: Record<string, [number, number]> = { short: [15, 180], longo: [60, 900] };
const TONS = ['neutro', 'empresa', 'empregado'];
const VOZES = ['francisca', 'thalita-hd', 'gemini'];
const PUBLICACOES = ['privado', 'publico', 'agendado'];
const ESTILOS = ['slides', 'ilustrado'];
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

async function dispararWorkflow(jobId: string, jobId2 = ''): Promise<void> {
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
    body: JSON.stringify({ ref: GITHUB_REF, inputs: { job_id: jobId, ...(jobId2 ? { job_id_2: jobId2 } : {}) } }),
  });
  if (r.status !== 204) throw new Error(`GitHub recusou o disparo (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
}


type Pedido = { slug: string; tipo: string; dur: number; tom: string; voz: string; publicacao: string; agendarEm: string | null; estilo: string };

function lerPedido(b: any, extra: Partial<Pedido> = {}): Pedido | Response {
  const tipo = String(extra.tipo ?? b.tipo ?? '');
  const dur = Math.round(Number(extra.dur ?? b.duracao_seg));
  const tom = String(b.tom || 'neutro');
  const voz = String(b.voz || 'francisca');
  const publicacao = String(b.publicacao || 'privado');
  const slug = String(b.slug || '').trim();
  if (!SLUG_RE.test(slug)) return json({ error: 'Artigo inválido.' }, 400);
  if (!LIMITES[tipo]) return json({ error: 'Formato inválido (use short ou longo).' }, 400);
  const [min, max] = LIMITES[tipo];
  if (!(dur >= min && dur <= max)) return json({ error: `Duração fora do limite para ${tipo}: ${min} a ${max} segundos.` }, 400);
  if (!TONS.includes(tom)) return json({ error: 'Tom inválido.' }, 400);
  if (!VOZES.includes(voz)) return json({ error: 'Voz inválida.' }, 400);
  if (!PUBLICACOES.includes(publicacao)) return json({ error: 'Forma de publicação inválida.' }, 400);
  let estilo = String(extra.estilo ?? b.estilo ?? (tipo === 'short' ? 'ilustrado' : 'slides'));
  if (!ESTILOS.includes(estilo)) return json({ error: 'Estilo inválido.' }, 400);
  if (tipo === 'longo') estilo = 'slides';
  let agendarEm: string | null = null;
  if (publicacao === 'agendado') {
    const d = new Date(String(extra.agendarEm ?? b.agendar_em ?? ''));
    if (isNaN(d.getTime()) || d.getTime() < Date.now() + 15 * 60 * 1000) return json({ error: 'Escolha uma data e hora de agendamento com pelo menos 15 minutos de antecedência.' }, 400);
    agendarEm = d.toISOString();
  }
  return { slug, tipo, dur, tom, voz, publicacao, agendarEm, estilo };
}

const STATUS_ATIVOS = ['na_fila', 'roteiro_ok', 'narracao_ok', 'render_ok'];
const MINUTOS_TRAVADO = 60;   // job "em andamento" sem nenhuma atualização há mais que isso = execução cancelada/derrubada

// Quando você cancela a execução no GitHub (ou ela cai), o banco não fica sabendo e o job fica "em andamento" pra sempre,
// ocupando uma das 3 vagas. Aqui eles viram "erro" (com "Tentar de novo" liberado) assim que passam do prazo.
async function expirarTravados() {
  const limite = new Date(Date.now() - MINUTOS_TRAVADO * 60 * 1000).toISOString();
  await supabase.from('video_admin_jobs')
    .update({ status: 'erro', erro_etapa: 'interrompido', erro_mensagem: `Sem andamento há mais de ${MINUTOS_TRAVADO} minutos (execução cancelada ou interrompida no GitHub). Use "Tentar de novo".` })
    .in('status', STATUS_ATIVOS).lt('atualizado_em', limite);
}

async function conferirLimites(novos: number): Promise<Response | null> {
  await expirarTravados();
  const { count: ativos } = await supabase.from('video_admin_jobs').select('id', { count: 'exact', head: true }).in('status', STATUS_ATIVOS);
  if ((ativos ?? 0) + novos > MAX_ATIVOS) return json({ error: `Já existem ${ativos} vídeos em andamento (limite ${MAX_ATIVOS}). Aguarde terminar.` }, 429);
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: hoje } = await supabase.from('video_admin_jobs').select('id', { count: 'exact', head: true }).gte('criado_em', desde);
  if (((hoje ?? 0) + novos) > MAX_POR_DIA) return json({ error: `Limite de ${MAX_POR_DIA} vídeos por dia atingido.` }, 429);
  return null;
}

async function artigoPublicado(slug: string): Promise<{ url: string } | Response> {
  const postUrl = `${SITE}/blog/${slug}`;
  const head = await fetch(postUrl, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  if (!head || !head.ok) return json({ error: 'Esse artigo ainda não está publicado no site (a página não abriu). Publique-o antes de gerar o vídeo.' }, 400);
  return { url: postUrl };
}

async function inserirJob(p: Pedido, postUrl: string, parId: string | null) {
  const { data: job, error } = await supabase.from('video_admin_jobs').insert({
    post_slug: p.slug, post_url: postUrl, tipo: p.tipo, duracao_alvo_seg: p.dur, tom: p.tom, voz: p.voz,
    publicacao: p.publicacao, agendar_em: p.agendarEm, estilo: p.estilo, par_id: parId,
  }).select('id').single();
  if (error) throw error;
  return job.id as string;
}

async function marcarFalhaDisparo(ids: string[], e: Error) {
  await supabase.from('video_admin_jobs').update({ status: 'erro', erro_etapa: 'disparo', erro_mensagem: String(e.message).slice(0, 500) }).in('id', ids);
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
        const p = lerPedido(body);
        if (p instanceof Response) return p;
        const art = await artigoPublicado(p.slug);
        if (art instanceof Response) return art;
        const lim = await conferirLimites(1);
        if (lim) return lim;
        const id = await inserirJob(p, art.url, null);
        try { await dispararWorkflow(id); }
        catch (e) { await marcarFalhaDisparo([id], e as Error); return json({ error: (e as Error).message, id, disparo_falhou: true }, 502); }
        return json({ ok: true, id });
      }

      case 'criar_par': {
        // Longo (slides) + Short (ilustrado) do MESMO artigo, numa única execução do GitHub (um depois do outro).
        const longo = lerPedido(body, { tipo: 'longo', dur: body.duracao_longo_seg, estilo: 'slides', agendarEm: body.agendar_longo_em });
        if (longo instanceof Response) return longo;
        const curto = lerPedido(body, { tipo: 'short', dur: body.duracao_short_seg, estilo: 'ilustrado', agendarEm: body.agendar_short_em });
        if (curto instanceof Response) return curto;
        const art = await artigoPublicado(longo.slug);
        if (art instanceof Response) return art;
        const lim = await conferirLimites(2);
        if (lim) return lim;
        const parId = crypto.randomUUID();
        const idLongo = await inserirJob(longo, art.url, parId);
        const idShort = await inserirJob(curto, art.url, parId);
        try { await dispararWorkflow(idLongo, idShort); }
        catch (e) { await marcarFalhaDisparo([idLongo, idShort], e as Error); return json({ error: (e as Error).message, ids: [idLongo, idShort], disparo_falhou: true }, 502); }
        return json({ ok: true, ids: [idLongo, idShort], par_id: parId });
      }

      case 'listar': {
        await expirarTravados();   // a lista já mostra como "erro" o que ficou preso
        const limite = Math.min(Math.max(Number(body.limite) || 20, 1), 50);
        const { data: jobs, error } = await supabase.from('video_admin_jobs')
          .select('id, post_slug, post_url, post_titulo, tipo, duracao_alvo_seg, duracao_real_seg, tom, voz, publicacao, agendar_em, estilo, par_id, status, etapa_atual, erro_etapa, erro_mensagem, youtube_url, github_run_url, video_path, thumbnail_path, criado_em, publicado_em, arquivos_apagados_em, roteiro')
          .order('criado_em', { ascending: false }).limit(limite);
        if (error) throw error;
        const lista = await Promise.all((jobs || []).map(async (j) => {
          const { roteiro, video_path, thumbnail_path, ...resto } = j as any;
          return {
            ...resto,
            titulo_youtube: roteiro?.titulo_seo || null,
            qa_voz: roteiro?.qa_voz || null,
            descricao_completa: montarDescricaoCompleta(roteiro, (resto as any).post_url || null),
            expira_em: (resto as any).publicado_em && !(resto as any).arquivos_apagados_em ? new Date(new Date((resto as any).publicado_em).getTime() + RETENCAO_DIAS * 86400000).toISOString() : null,
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
