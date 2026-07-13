import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getJob, updateJob, marcarErro, garantirArquivoLocal, enviarArquivo } from './lib/supabase.mjs';

async function main(jobId) {
  const job = await getJob(jobId);

  const narracaoLocal = path.resolve('output/audio/narracao_completa.mp3');
  await garantirArquivoLocal(job.narracao_path, narracaoLocal);

  const cenas = [];
  for (let i = 0; i < job.roteiro.cenas.length; i++) {
    const cena = job.roteiro.cenas[i];
    const imagemLocal = path.resolve(`output/imagens/cena_${String(i).padStart(2, '0')}.png`);
    await garantirArquivoLocal(job.imagens[i], imagemLocal);
    cenas.push({ ...cena, imagemSrc: imagemLocal });
  }

  const inputProps = { cenas, narracaoSrc: narracaoLocal };

  fs.mkdirSync('output', { recursive: true });
  const inputPath = 'output/remotion-input.json';
  fs.writeFileSync(inputPath, JSON.stringify(inputProps));

  const saidaRelativa = 'out/video.mp4';
  console.log('Iniciando render do Remotion (pode demorar alguns minutos, sem log até terminar cada fase)...');
  execSync(
    `./node_modules/.bin/remotion render src/index.jsx VideoDoArtigo "${saidaRelativa}" --props="${path.resolve(inputPath)}" --log=verbose`,
    { cwd: 'remotion', stdio: 'inherit' }
  );

  const origemAbsoluta = path.resolve('remotion', saidaRelativa);
  if (!fs.existsSync(origemAbsoluta)) {
    console.error('Conteúdo de remotion/out (se existir):');
    try {
      console.error(fs.readdirSync(path.resolve('remotion', 'out')));
    } catch {
      console.error('(pasta remotion/out nem existe)');
    }
    console.error('Conteúdo de remotion/ (raiz):');
    console.error(fs.readdirSync(path.resolve('remotion')));
    throw new Error(`Remotion terminou sem erro, mas o vídeo não apareceu em ${origemAbsoluta}.`);
  }

  const destinoLocal = path.resolve('output/video.mp4');
  fs.copyFileSync(origemAbsoluta, destinoLocal);

  const tamanho = fs.statSync(destinoLocal).size;
  if (tamanho < 10_000) {
    throw new Error(`Vídeo renderizado ficou suspeitosamente pequeno (${tamanho} bytes) — provável falha silenciosa.`);
  }

  const caminhoStorage = `jobs/${jobId}/video.mp4`;
  await enviarArquivo(destinoLocal, caminhoStorage);

  await updateJob(jobId, { video_path: caminhoStorage, status: 'render_ok' });
  console.log(`Vídeo renderizado e enviado: ${caminhoStorage} (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Uso: node 07-render.mjs <job_id>');
  process.exit(1);
}
main(jobId).catch(async err => {
  console.error(err);
  await marcarErro(jobId, 'render', err.message);
  process.exit(1);
});
