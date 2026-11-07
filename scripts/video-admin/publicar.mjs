// Etapa 4 — publica no YouTube (privado / público / agendado), com capítulos (vídeo longo) e miniatura (vídeo longo).
// SEPARADO do 08-publicar-youtube.mjs do pipeline antigo (que continua publicando sempre como privado).
import fs from 'node:fs';
import path from 'node:path';
import { getJob, updateJob, baixarArquivo, limparIntermediarios } from './lib/db.mjs';

async function liberarEspaco(jobId) {
  try { const n = await limparIntermediarios(jobId); if (n) console.log(`Storage: ${n} arquivo(s) intermediário(s) apagado(s) (ficam só o vídeo e a capa, por 5 dias).`); }
  catch (e) { console.warn(`Aviso: não consegui apagar os intermediários (${e.message}); a limpeza diária cuida deles.`); }
}
import { montarMetadados } from './lib/metadados.mjs';
import { enviarAoYoutube, enviarMiniatura } from './lib/youtube.mjs';

export { montarMetadados };

export async function etapaPublicar(jobId) {
  const job = await getJob(jobId);
  if (job.youtube_video_id) {
    console.log(`Job já publicado (${job.youtube_video_id}); nada a fazer.`);
    await updateJob(jobId, { status: 'publicado', publicado_em: job.publicado_em || new Date().toISOString() });
    await liberarEspaco(jobId);
    return;
  }
  await updateJob(jobId, { etapa_atual: 'publicacao' });
  const video = path.resolve('output/render/video.mp4');
  if (!fs.existsSync(video)) { if (!job.video_path) throw new Error('Vídeo renderizado não encontrado.'); await baixarArquivo(job.video_path, video); }
  let thumb = null;
  if (job.tipo === 'longo' && job.thumbnail_path) { thumb = path.resolve('output/render/thumbnail.png'); await baixarArquivo(job.thumbnail_path, thumb); }
  const meta = montarMetadados(job);

  const { videoId, url, yt } = await enviarAoYoutube({ video, thumb, meta });
  await updateJob(jobId, { youtube_video_id: videoId, youtube_url: url }); // salva já: um retry não duplica o upload
  if (thumb) await enviarMiniatura({ yt, videoId, thumb });
  await updateJob(jobId, { status: 'publicado', etapa_atual: null, publicado_em: new Date().toISOString(), erro_etapa: null, erro_mensagem: null });
  console.log(`Publicado: https://youtube.com/watch?v=${videoId}`);
  await liberarEspaco(jobId);
}
