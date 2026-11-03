// Envio ao YouTube (sem banco): usado pela etapa de publicação do GitHub e pelo modo local do computador.
import fs from 'node:fs';
import { google } from 'googleapis';

export async function enviarAoYoutube({ video, thumb, meta, log = console.log }) {
  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const yt = google.youtube({ version: 'v3', auth });
  log(`Enviando ao YouTube: "${meta.titulo}" (${meta.privacyStatus}${meta.publishAt ? ' → ' + meta.publishAt : ''})`);
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
  return { videoId, url: `https://youtube.com/watch?v=${videoId}`, yt };
}

export async function enviarMiniatura({ yt, videoId, thumb, log = console.log }) {
  try { await yt.thumbnails.set({ videoId, media: { body: fs.createReadStream(thumb) } }); log('Miniatura enviada.'); }
  catch (e) { log(`Miniatura não enviada (o vídeo foi publicado): ${e.message}`); }
}
