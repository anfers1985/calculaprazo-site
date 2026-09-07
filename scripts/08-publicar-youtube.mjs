import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import sharp from 'sharp';
import {
  getJob,
  updateJob,
  marcarErro,
  garantirArquivoLocal
} from './lib/supabase.mjs';

// NOTA: este script NÃO apaga mais os arquivos do Storage logo após publicar.
// Vídeo, capa, título e descrição ficam guardados por alguns dias (retenção
// controlada em scripts/10-limpar-jobs-travados.mjs, usando o campo
// `publicado_em`) pra você poder baixá-los no admin (aba "Vídeos p/ Redes")
// e postar manualmente no X, Instagram, Facebook, LinkedIn e TikTok.

async function prepararThumbnail(inputPath, outputPath) {
  await sharp(inputPath)
    .rotate()
    .resize(1280, 720, {
      fit: 'cover',
      position: 'centre'
    })
    .flatten({
      background: '#000000'
    })
    .jpeg({
      quality: 85,
      mozjpeg: true
    })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);

  console.log(
    'Thumbnail preparada: ' +
    outputPath +
    ' (' +
    stats.size +
    ' bytes)'
  );

  const limite = 2 * 1024 * 1024;

  if (stats.size > limite) {
    throw new Error(
      'Thumbnail ficou acima do limite de 2 MB: ' +
      stats.size +
      ' bytes'
    );
  }

  return outputPath;
}

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
});

const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client
});

async function main(jobId) {
  const job = await getJob(jobId);

  if (job.youtube_video_id) {
    console.log(
      'Job ' +
      jobId +
      ' já tinha sido publicado antes (' +
      job.youtube_video_id +
      '). Pulando novo upload.'
    );

    await updateJob(jobId, {
      status: 'publicado',
      publicado_em: job.publicado_em || new Date().toISOString()
    });

    return;
  }

  const roteiro = job.roteiro || {};

  const titulo_seo = roteiro.titulo_seo || '';
  const descricao = roteiro.descricao || '';
  const hashtags = roteiro.hashtags || [];

  const videoLocal = path.resolve('output/video.mp4');

  await garantirArquivoLocal(
    job.video_path,
    videoLocal
  );

  let thumbnailLocal = null;

  if (job.thumbnail_path) {
    const thumbnailOriginal = path.resolve(
      'output/thumbnail-original.png'
    );

    thumbnailLocal = path.resolve(
      'output/thumbnail-youtube.jpg'
    );

    await garantirArquivoLocal(
      job.thumbnail_path,
      thumbnailOriginal
    );

    await prepararThumbnail(
      thumbnailOriginal,
      thumbnailLocal
    );
  }

  const hashtagsFinais = hashtags.some(
    h => String(h).toLowerCase() === '#shorts'
  )
    ? hashtags
    : ['#Shorts', ...hashtags];

  const descricaoFinal =
    descricao +
    '\n\nSaiba mais: ' +
    job.post_url +
    '\n\n' +
    hashtagsFinais.join(' ') +
    '\n\n' +
    'Este vídeo tem caráter informativo e não substitui consulta jurídica individualizada.';

  console.log('Enviando vídeo para o YouTube...');

  const uploadRes = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: titulo_seo,
        description: descricaoFinal,
        tags: hashtagsFinais.map(
          h => String(h).replace('#', '')
        ),
        categoryId: '22'
      },
      status: {
        privacyStatus: 'private',
        selfDeclaredMadeForKids: false
      }
    },
    media: {
      body: fs.createReadStream(videoLocal)
    }
  });

  const videoId = uploadRes.data.id;

  if (!videoId) {
    throw new Error(
      'O YouTube não retornou um videoId após o upload.'
    );
  }

  console.log(
    'Vídeo criado no YouTube: ' +
    videoId
  );

  // Salva o ID imediatamente.
  // Assim, se a thumbnail falhar, uma nova execução
  // não criará outro vídeo.
  await updateJob(jobId, {
    youtube_video_id: videoId
  });

  console.log(
    'youtube_video_id salvo no job: ' +
    videoId
  );

  if (thumbnailLocal) {
    console.log(
      'Enviando thumbnail para o YouTube...'
    );

    await youtube.thumbnails.set({
      videoId,
      media: {
        body: fs.createReadStream(thumbnailLocal)
      }
    });

    console.log(
      'Thumbnail enviada com sucesso.'
    );
  } else {
    console.log(
      'Nenhuma thumbnail foi fornecida para este job.'
    );
  }

  await updateJob(jobId, {
    youtube_video_id: videoId,
    status: 'publicado',
    publicado_em: new Date().toISOString()
  });

  console.log(
    'Publicado: https://youtube.com/watch?v=' +
    videoId
  );

  console.log(
    'Arquivos mantidos no Storage por alguns dias para download manual (aba "Vídeos p/ Redes" no admin).'
  );
}

const jobId = process.argv[2];

if (!jobId) {
  console.error(
    'Uso: node 08-publicar-youtube.mjs <job_id>'
  );
  process.exit(1);
}

main(jobId).catch(async err => {
  console.error(err);

  await marcarErro(
    jobId,
    'publicacao',
    err.message
  );

  process.exit(1);
});