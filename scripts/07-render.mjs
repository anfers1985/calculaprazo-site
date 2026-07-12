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

  const destino = path.resolve('output/video.mp4');
  execSync(
    `node node_modules/@remotion/cli/dist/index.js render src/index.jsx VideoDoArtigo "${destino}" --props="${path.resolve(inputPath)}"`,
    { cwd: 'remotion', stdio: 'inherit' }
  );

  await updateJob(jobId, { video_path: destino, status: 'render_ok' });
  console.log(`Vídeo renderizado: ${destino}`);
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
