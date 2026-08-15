import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getJob, updateJob, marcarErro, garantirArquivoLocal, enviarArquivo } from './lib/supabase.mjs';

// ANTES: esse script montava um HTML próprio (fundo azul, só com o título) e tirava um
// print em 1280x720 (horizontal) — por isso a capa não batia com o vídeo, que é vertical
// (1080x1920, Shorts) e já tem a barra de texto/legenda e a marca desenhadas pelo Remotion.
// AGORA: a pipeline roda o render (07) antes deste script, então o vídeo final já existe
// quando chegamos aqui — a capa é um frame de verdade tirado de dentro do próprio vídeo,
// já com o texto da 1ª cena e a marca no canto, igual ao que aparece assistindo o Short.

const OUTPUT_DIR = 'output/thumbnail';
// Momento do frame usado como capa: 1s de vídeo. Nesse ponto o texto_tela da 1ª cena já
// terminou de aparecer (a animação de fade dura 0.5s / 15 frames a 30fps) e o zoom Ken
// Burns já começou a se mover — dá o mesmo "clima" do vídeo sem pegar o instante 0 parado.
const SEGUNDO_DO_FRAME = 1;

async function main(jobId) {
  const job = await getJob(jobId);

  const videoLocal = path.resolve('output/assets/video_para_capa.mp4');
  await garantirArquivoLocal(job.video_path, videoLocal);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const destino = path.join(OUTPUT_DIR, 'thumbnail.png');

  execFileSync('ffmpeg', [
    '-y',
    '-ss', String(SEGUNDO_DO_FRAME),
    '-i', videoLocal,
    '-frames:v', '1',
    '-q:v', '2',
    destino,
  ], { stdio: 'pipe' });

  if (!fs.existsSync(destino) || fs.statSync(destino).size < 5_000) {
    throw new Error('Frame extraído do vídeo ficou vazio/pequeno demais — provável falha do ffmpeg.');
  }

  const caminhoStorage = `jobs/${jobId}/thumbnail.png`;
  await enviarArquivo(destino, caminhoStorage);

  await updateJob(jobId, { thumbnail_path: caminhoStorage, status: 'thumbnail_ok' });
  console.log(`Thumbnail (frame real do vídeo, ${SEGUNDO_DO_FRAME}s) gerada e enviada: ${caminhoStorage}`);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Uso: node 06-thumbnail.mjs <job_id>');
  process.exit(1);
}
main(jobId).catch(async err => {
  console.error(err);
  await marcarErro(jobId, 'thumbnail', err.message);
  process.exit(1);
});
