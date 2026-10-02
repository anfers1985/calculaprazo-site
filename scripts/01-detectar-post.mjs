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

  // Todos os slugs que já têm job (qualquer data) — usado tanto pros posts de hoje quanto pro backlog.
  const { data: existentes, error } = await supabase.from('video_jobs').select('post_slug, criado_em');
  if (error) throw new Error(error.message);
  const jaTemJob = new Set((existentes || []).map(r => r.post_slug));

  // Prioridade 1: posts publicados HOJE (mais antigos primeiro, como antes).
  const deHoje = posts
    .filter(p => dataDe(p) >= inicioDoDia.getTime() && !jaTemJob.has(idDe(p)))
    .sort((a, b) => dataDe(a) - dataDe(b));

  const escolhidos = deHoje.slice(0, vagasRestantes);

  // Prioridade 2 (NOVO): se sobrou vaga, completa com o backlog (posts antigos sem vídeo).
  // Antes, sem post novo no dia, o pipeline ficava parado mesmo com ~970 posts no blog.
  // Pra não gerar vídeos repetitivos, o backlog é escolhido em rodízio de CATEGORIA:
  // no máximo 1 vídeo por categoria no dia, começando pelas categorias menos usadas
  // nos últimos 14 dias; dentro da categoria, o post mais recente primeiro.
  let faltam = vagasRestantes - escolhidos.length;
  if (faltam > 0) {
    const catDe = Object.fromEntries(posts.map(p => [idDe(p), p.category || 'geral']));
    const limite14d = Date.now() - 14 * 24 * 3600 * 1000;
    const usoRecente = {};
    for (const r of existentes || []) {
      if (new Date(r.criado_em).getTime() >= limite14d) {
        const c = catDe[r.post_slug] || 'geral';
        usoRecente[c] = (usoRecente[c] || 0) + 1;
      }
    }
    const jaEscolhidos = new Set(escolhidos.map(idDe));
    const catsDoDia = new Set(escolhidos.map(p => p.category || 'geral'));

    const porCategoria = {};
    posts
      .filter(p => !jaTemJob.has(idDe(p)) && !jaEscolhidos.has(idDe(p)))
      .sort((a, b) => dataDe(b) - dataDe(a))
      .forEach(p => { (porCategoria[p.category || 'geral'] ||= []).push(p); });

    const categorias = Object.keys(porCategoria)
      .filter(c => !catsDoDia.has(c))
      .sort((a, b) => (usoRecente[a] || 0) - (usoRecente[b] || 0) || Math.random() - 0.5);

    for (const c of categorias) {
      if (faltam <= 0) break;
      escolhidos.push(porCategoria[c][0]);
      faltam--;
    }
    // Se há menos categorias do que vagas, completa sem a regra de 1 por categoria.
    if (faltam > 0) {
      const restantes = categorias.flatMap(c => porCategoria[c].slice(1))
        .sort((a, b) => dataDe(b) - dataDe(a));
      escolhidos.push(...restantes.slice(0, faltam));
    }
  }

  if (escolhidos.length === 0) {
    console.log('Nenhum post elegível (todos já têm vídeo).');
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
