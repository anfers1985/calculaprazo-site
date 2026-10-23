// Etapa 4 — publica no YouTube (privado / público / agendado), com capítulos (vídeo longo) e miniatura (vídeo longo).
// SEPARADO do 08-publicar-youtube.mjs do pipeline antigo (que continua publicando sempre como privado).
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { getJob, updateJob, baixarArquivo } from './lib/db.mjs';
import { montarCapitulos } from './lib/cena.mjs';

const limpar = s => String(s || '').replace(/[<>]/g, '');

export function montarMetadados(job, agora = new Date()) {
  const r = job.roteiro || {};
  const longo = job.tipo === 'longo';
  let titulo = limpar(r.titulo_seo || job.post_titulo || 'Calcula Prazo').trim();
  if (longo && !/direto ao ponto/i.test(titulo) && (titulo + ' | Direto ao Ponto').length <= 100) titulo += ' | Direto ao Ponto';
  titulo = titulo.slice(0, 100);
  let hashtags = (r.hashtags || []).map(h => '#' + String(h).replace(/^#+/, '').replace(/\s+/g, ''));
  if (!longo && !hashtags.some(h => h.toLowerCase() === '#shorts')) hashtags = ['#Shorts', ...hashtags];
  const capitulos = longo ? montarCapitulos(r, r.cortes_reais || []) : [];
  const partes = [limpar(r.descricao), `Leia o artigo completo: ${job.post_url}`];
  if (capitulos.length) partes.push(capitulos.join('\n'));
  partes.push('🔔 Inscreva-se no canal Calcula Prazo para acompanhar mais conteúdos sobre Direito do Trabalho.');
  partes.push(hashtags.join(' '));
  partes.push('Este vídeo tem caráter informativo e não substitui consulta jurídica individualizada.');
  let privacyStatus = 'private', publishAt;
  if (job.publicacao === 'publico') privacyStatus = 'public';
  else if (job.publicacao === 'agendado') {
    const quando = job.agendar_em ? new Date(job.agendar_em) : null;
    if (quando && quando.getTime() > agora.getTime() + 10 * 60 * 1000) publishAt = quando.toISOString(); // YouTube exige data futura (e vídeo privado até lá)
    else privacyStatus = 'public'; // horário já passou: publica agora
  }
  return { titulo, descricao: partes.join('\n\n').slice(0, 4900), tags: hashtags.map(h => h.slice(1)).slice(0, 15), privacyStatus, publishAt, capitulos };
}

export async function etapaPublicar(jobId) {
  const job = await getJob(jobId);
  if (job.youtube_video_id) {
    console.log(`Job já publicado (${job.youtube_video_id}); nada a fazer.`);
    await updateJob(jobId, { status: 'publicado', publicado_em: job.publicado_em || new Date().toISOString() });
    return;
  }
  await updateJob(jobId, { etapa_atual: 'publicacao' });
  const video = path.resolve('output/render/video.mp4');
  if (!fs.existsSync(video)) { if (!job.video_path) throw new Error('Vídeo renderizado não encontrado.'); await baixarArquivo(job.video_path, video); }
  let thumb = null;
  if (job.tipo === 'longo' && job.thumbnail_path) { thumb = path.resolve('output/render/thumbnail.png'); await baixarArquivo(job.thumbnail_path, thumb); }
  const meta = montarMetadados(job);

  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const yt = google.youtube({ version: 'v3', auth });

  console.log(`Enviando ao YouTube: "${meta.titulo}" (${meta.privacyStatus}${meta.publishAt ? ' → ' + meta.publishAt : ''})`);
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: meta.titulo, description: meta.descricao, tags: meta.tags, categoryId: '22', defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt-BR' },
      status: { privacyStatus: meta.privacyStatus, ...(meta.publishAt ? { publishAt: meta.publishAt } : {}), selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(video) },
  });
  const videoId = res.data.id;
  if (!videoId) throw new Error('O YouTube não retornou o ID do vídeo.');
  await updateJob(jobId, { youtube_video_id: videoId, youtube_url: `https://youtube.com/watch?v=${videoId}` }); // salva já: um retry não duplica o upload
  if (thumb) {
    try { await yt.thumbnails.set({ videoId, media: { body: fs.createReadStream(thumb) } }); console.log('Miniatura enviada.'); }
    catch (e) { console.warn(`Miniatura não enviada (o vídeo foi publicado): ${e.message}`); }
  }
  await updateJob(jobId, { status: 'publicado', etapa_atual: null, publicado_em: new Date().toISOString(), erro_etapa: null, erro_mensagem: null });
  console.log(`Publicado: https://youtube.com/watch?v=${videoId}`);
}
