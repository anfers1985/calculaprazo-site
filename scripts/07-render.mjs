import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getJob, updateJob, marcarErro } from './lib/supabase.mjs';

async function main(jobId) {
  const job = await getJob(jobId);
  const cenas = job.roteiro.cenas.map((cena, i) => ({
    ...cena,
    imagemSrc: path.resolve(job.imagens[i]),
  }));

  const inputProps = {
    cenas,
    narracaoSrc: path.resolve(job.narracao_path),
  };

  fs.mkdirSync('output', { recursive: true });
  const inputPath = 'output/remotion-input.json';
  fs.writeFileSync(inputPath, JSON.stringify(inputProps));

  // Renderiza pra um caminho relativo simples dentro da própria pasta do Remotion
  // (mais confiável do que passar um caminho absoluto no CLI). Depois copiamos pro
  // destino final e conferimos que o arquivo existe de verdade antes de seguir.
  const saidaRelativa = 'out/video.mp4';
  execSync(
    `node node_modules/@remotion/cli/dist/index.js render src/index.jsx VideoDoArtigo "${saidaRelativa}" --props="${path.resolve(inputPath)}"`,
    { cwd: 'remotion', stdio: 'inherit' }
  );

  const origemAbsoluta = path.resolve('remotion', saidaRelativa);
  if (!fs.existsSync(origemAbsoluta)) {
    throw new Error(`Remotion terminou sem erro, mas o vídeo não apareceu em ${origemAbsoluta}. Verifique o log de render acima.`);
  }

  const destino = path.resolve('output/video.mp4');
  fs.copyFileSync(origemAbsoluta, destino);

  const tamanho = fs.statSync(destino).size;
  if (tamanho < 10_000) {
    throw new Error(`Vídeo renderizado ficou suspeitosamente pequeno (${tamanho} bytes) — provável falha silenciosa.`);
  }

  await updateJob(jobId, { video_path: destino, status: 'render_ok' });
  console.log(`Vídeo renderizado: ${destino} (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);
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
