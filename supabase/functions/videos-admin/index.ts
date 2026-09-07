// ════════════════════════════════════════════════════════════════════════
// videos-admin — Edge Function protegida, chamada só pelo painel admin
// ════════════════════════════════════════════════════════════════════════
// Lista os jobs de vídeo já publicados no YouTube que ainda estão dentro da
// janela de retenção no Storage (RETENCAO_DIAS), e devolve pra cada um:
//   - link de download temporário (signed URL) do vídeo (.mp4)
//   - link de download temporário (signed URL) da capa/thumbnail
//   - título, descrição e hashtags já formatados, prontos pra copiar e colar
//     no X, Instagram, Facebook, LinkedIn e TikTok
//   - data em que o arquivo expira (some do Storage) nesse painel
//
// A retenção de fato (apagar os arquivos) é feita à parte, pelo workflow
// diário "Limpar Storage" (scripts/10-limpar-jobs-travados.mjs). Esta
// function só *lê* o que ainda existe — não apaga nada.
//
// Protegida por um header x-admin-secret que precisa bater com o secret
// ADMIN_SECRET já configurado no seu projeto Supabase (o mesmo usado pela
// function newsletter-admin — não precisa criar um novo).
//
// Deploy: supabase functions deploy videos-admin --no-verify-jwt
// (o ADMIN_SECRET já deve estar setado no projeto: supabase secrets set ADMIN_SECRET=...)
// ════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SECRET = Deno.env.get('ADMIN_SECRET')!;

const BUCKET = 'pipeline';
const RETENCAO_DIAS = 5; // mesmo valor usado em scripts/10-limpar-jobs-travados.mjs
const SIGNED_URL_EXPIRA_EM = 60 * 60 * 6; // 6 horas — tempo confortável pra baixar tudo com calma

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function signedUrl(caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(caminho, SIGNED_URL_EXPIRA_EM);
  if (error) {
    // Arquivo pode já ter sido apagado (expirou entre a publicação e o
    // carregamento do painel) — não derruba a listagem inteira por isso.
    console.warn(`Falha ao assinar ${caminho}: ${error.message}`);
    return null;
  }
  return data.signedUrl;
}

function montarDescricaoCompleta(job: any): string {
  const roteiro = job.roteiro || {};
  const descricao = roteiro.descricao || '';
  const hashtags: string[] = roteiro.hashtags || [];
  const partes = [descricao.trim()];
  if (job.post_url) partes.push(`Saiba mais: ${job.post_url}`);
  if (hashtags.length) partes.push(hashtags.join(' '));
  return partes.filter(Boolean).join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return json({ error: 'Não autorizado' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const { action } = body;

  try {
    switch (action) {
      case 'list_videos': {
        const cutoff = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000).toISOString();

        const { data: jobs, error } = await supabase
          .from('video_jobs')
          .select('id, post_slug, post_url, roteiro, video_path, thumbnail_path, youtube_video_id, publicado_em, criado_em')
          .eq('status', 'publicado')
          .gte('publicado_em', cutoff)
          .order('publicado_em', { ascending: false });

        if (error) throw error;

        const videos = await Promise.all((jobs || []).map(async (job) => {
          const roteiro = job.roteiro || {};
          const publicadoEm = job.publicado_em || job.criado_em;
          const expiraEm = new Date(new Date(publicadoEm).getTime() + RETENCAO_DIAS * 24 * 60 * 60 * 1000).toISOString();

          return {
            id: job.id,
            post_slug: job.post_slug,
            post_url: job.post_url,
            youtube_video_id: job.youtube_video_id,
            youtube_url: job.youtube_video_id ? `https://youtube.com/watch?v=${job.youtube_video_id}` : null,
            titulo: roteiro.titulo_seo || job.post_slug,
            descricao_completa: montarDescricaoCompleta(job),
            hashtags: roteiro.hashtags || [],
            publicado_em: publicadoEm,
            expira_em: expiraEm,
            video_url: await signedUrl(job.video_path),
            thumbnail_url: await signedUrl(job.thumbnail_path),
          };
        }));

        return json({ videos, retencao_dias: RETENCAO_DIAS });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error(err);
    return json({ error: String(err?.message || err) }, 500);
  }
});
