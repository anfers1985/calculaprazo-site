import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { getJob, updateJob, marcarErro, garantirArquivoLocal } from './lib/supabase.mjs';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

async function main(jobId) {
  const job = await getJob(jobId);
  const { titulo_seo, descricao, hashtags } = job.roteiro;

  const videoLocal = path.resolve('output/video.mp4');
  await garantirArquivoLocal(job.video_path, videoLocal);
  let thumbnailLocal = null;
  if (job.thumbnail_path) {
    thumbnailLocal = path.resolve('output/thumbnail.png');
    await garantirArquivoLocal(job.thumbnail_path, thumbnailLocal);
  }

  const descricaoFinal =
    `${descricao}\n\nSaiba mais: ${job.post_url}\n\n${(hashtags || []).join(' ')}\n\n` +
    `Este vídeo tem caráter informativo e não substitui consulta jurídica individualizada.`;

  const uploadRes = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: titulo_seo,
        description: descricaoFinal,
        tags: (hashtags || []).map(h => h.replace('#', '')),
        categoryId: '22',
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
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
