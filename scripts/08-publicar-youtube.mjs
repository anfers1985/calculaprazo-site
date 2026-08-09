import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { getJob, updateJob, marcarErro, garantirArquivoLocal } from './lib/supabase.mjs';

// Corta o título com segurança se a IA mandar mais do que o combinado no prompt
// (config/prompts.json pede até 45 caracteres, mas isso não é garantido).
// Sem essa rede, título comprido corta com "…" no player de Shorts do celular
// e no app de TV do YouTube — o corte aqui acontece na última palavra inteira
// antes do limite, nunca no meio de uma palavra.
const TITULO_MAX_CHARS = 48;
function truncarTitulo(titulo, max = TITULO_MAX_CHARS) {
  const t = (titulo || '').trim();
  if (t.length <= max) return t;
  const cortado = t.slice(0, max);
  const ultimoEspaco = cortado.lastIndexOf(' ');
  const base = ultimoEspaco > 0 ? cortado.slice(0, ultimoEspaco) : cortado;
  return base.replace(/[,;:.\-–—]+$/, '').trim() + '…';
}

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

async function main(jobId) {
  const job = await getJob(jobId);

  // Se uma tentativa anterior já subiu esse vídeo pro YouTube e só falhou depois
  // (ex: no envio da thumbnail ou ao salvar o status), não faz sentido subir de novo.
  // Isso é o que causava vídeo duplicado/triplicado no canal.
  if (job.youtube_video_id) {
    console.log(`Job ${jobId} já tinha sido publicado antes (${job.youtube_video_id}). Pulando novo upload.`);
    await updateJob(jobId, { status: 'publicado' });
    return;
  }

  const { titulo_seo, descricao, hashtags } = job.roteiro;
  const tituloFinal = truncarTitulo(titulo_seo);
  if (tituloFinal !== titulo_seo) {
    console.warn(`Título cortado por segurança (${titulo_seo.length} → ${tituloFinal.length} caracteres): "${titulo_seo}" → "${tituloFinal}"`);
  }

  const videoLocal = path.resolve('output/video.mp4');
  await garantirArquivoLocal(job.video_path, videoLocal);
  let thumbnailLocal = null;
  if (job.thumbnail_path) {
    thumbnailLocal = path.resolve('output/thumbnail.png');
    await garantirArquivoLocal(job.thumbnail_path, thumbnailLocal);
  }

  // Garante #Shorts mesmo que a IA não tenha colocado.
  const hashtagsFinais = (hashtags || []).some(h => h.toLowerCase() === '#shorts')
    ? hashtags
    : ['#Shorts', ...(hashtags || [])];

  const descricaoFinal =
    `${descricao}\n\nSaiba mais: ${job.post_url}\n\n${hashtagsFinais.join(' ')}\n\n` +
    `Este vídeo tem caráter informativo e não substitui consulta jurídica individualizada.`;

  const uploadRes = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: tituloFinal,
        description: descricaoFinal,
        tags: hashtagsFinais.map(h => h.replace('#', '')),
        categoryId: '22',
      },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoLocal) },
  });

  const videoId = uploadRes.data.id;

  if (thumbnailLocal) {
    await youtube.thumbnails.set({
      videoId,
      media: { body: fs.createReadStream(thumbnailLocal) },
    });
  }

  await updateJob(jobId, { youtube_video_id: videoId, status: 'publicado' });
  console.log(`Publicado: https://youtube.com/watch?v=${videoId}`);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Uso: node 08-publicar-youtube.mjs <job_id>');
  process.exit(1);
}
main(jobId).catch(async err => {
  console.error(err);
  await marcarErro(jobId, 'publicacao', err.message);
  process.exit(1);
});
