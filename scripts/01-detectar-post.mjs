// Roda a cada publicação (disparado pelo workflow ao dar push em data/posts.json).
// Não depende de estado externo: compara posts.json com o que já existe em video_jobs.
import fs from 'node:fs';
import { supabase } from './lib/supabase.mjs';

const SITE_BASE_URL = 'https://calculaprazo.com.br';
const POSTS_JSON_PATH = process.env.POSTS_JSON_PATH || 'data/posts.json';

async function main() {
  const posts = JSON.parse(fs.readFileSync(POSTS_JSON_PATH, 'utf-8'));

  // Considera só posts publicados nas últimas 48h, pra não tentar gerar vídeo pro blog inteiro na primeira vez.
  const desde = Date.now() - 48 * 60 * 60 * 1000;
  const recentes = posts.filter(p => new Date(p.publishedAt || p.date).getTime() >= desde);

  if (recentes.length === 0) {
    console.log('Nenhum post recente. Nada a fazer.');
    return;
  }

  const slugs = recentes.map(p => p.id || p.slug);
  const { data: existentes, error } = await supabase
    .from('video_jobs')
    .select('post_slug')
    .in('post_slug', slugs);
  if (error) throw new Error(error.message);

  const jaTemJob = new Set((existentes || []).map(r => r.post_slug));
  const novos = recentes.filter(p => !jaTemJob.has(p.id || p.slug));

  if (novos.length === 0) {
    console.log('Todos os posts recentes já têm job de vídeo.');
    return;
  }

  for (const post of novos) {
    const slug = post.id || post.slug;
    const { error: insertError } = await supabase.from('video_jobs').insert({
      post_slug: slug,
      post_url: `${SITE_BASE_URL}/blog/${slug}`,
      tipo: 'short',
      status: 'queued',
    });
    if (insertError) {
      console.error(`Falha ao criar job para ${slug}:`, insertError.message);
    } else {
      console.log(`Job criado para: ${slug}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
