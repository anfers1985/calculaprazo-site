// Roda a cada publicação (disparado pelo workflow ao dar push em data/posts.json).
// Não depende de estado externo: compara posts.json com o que já existe em video_jobs.
import fs from 'node:fs';
import { supabase } from './lib/supabase.mjs';

const SITE_BASE_URL = 'https://calculaprazo.com.br';
const POSTS_JSON_PATH = process.env.POSTS_JSON_PATH || 'data/posts.json';
const LIMITE_DIARIO = Number(process.env.VIDEOS_POR_DIA) || 5;

async function main() {
  const posts = JSON.parse(fs.readFileSync(POSTS_JSON_PATH, 'utf-8'));
  const dataDe = p => new Date(p.publishedAt || p.date).getTime();
  const idDe = p => p.id || p.slug;

  const inicioDoDia = new Date();
  inicioDoDia.setUTCHours(0, 0, 0, 0);

  // Quantos jobs já foram criados hoje (UTC) — limite diário pra controlar custo/cota.
  const { count: criadosHoje, error: errCont } = await supabase
    .from('video_jobs')
    .select('id', { count: 'exact', head: true })
    .gte('criado_em', inicioDoDia.toISOString());
  if (errCont) throw new Error(errCont.message);

  const vagasRestantes = LIMITE_DIARIO - (criadosHoje || 0);
  if (vagasRestantes <= 0) {
    console.log(`Limite diário de ${LIMITE_DIARIO} vídeos já atingido (${criadosHoje} criados hoje). Aguardando amanhã.`);
    return;
  }

  // Slugs que já têm job (qualquer data) — evita criar vídeo duplicado do mesmo post.
  const { data: existentes, error } = await supabase.from('video_jobs').select('post_slug');
  if (error) throw new Error(error.message);
  const jaTemJob = new Set((existentes || []).map(r => r.post_slug));

  // SÓ posts publicados HOJE (mais antigos primeiro). Não há backlog: se hoje saírem menos
  // artigos do que o limite diário, sai menos vídeo — conteúdo antigo/desatualizado não entra.
  const escolhidos = posts
    .filter(p => dataDe(p) >= inicioDoDia.getTime() && !jaTemJob.has(idDe(p)))
    .sort((a, b) => dataDe(a) - dataDe(b))
    .slice(0, vagasRestantes);

  if (escolhidos.length === 0) {
    console.log('Nenhum post de hoje sem vídeo. Nada a fazer.');
    return;
  }

  for (const post of escolhidos) {
    const slug = idDe(post);
    const { error: insertError } = await supabase.from('video_jobs').insert({
      post_slug: slug,
      post_url: `${SITE_BASE_URL}/blog/${slug}`,
      tipo: 'short',
      status: 'queued',
    });
    if (insertError) {
      console.error(`Falha ao criar job para ${slug}:`, insertError.message);
    } else {
      console.log(`Job criado para: ${slug} [${post.category || 'geral'}]`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
