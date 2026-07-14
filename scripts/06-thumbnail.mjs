import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getJob, updateJob, marcarErro, enviarArquivo } from './lib/supabase.mjs';

const OUTPUT_DIR = 'output/thumbnail';
const TEMPLATE_PATH = new URL('./thumbnail-template.html', import.meta.url);

async function main(jobId) {
  const job = await getJob(jobId);
  const { titulo_seo } = job.roteiro;

  const palavras = titulo_seo.split(' ');
  const meio = Math.ceil(palavras.length / 2);
  const parte1 = palavras.slice(0, meio).join(' ');
  const parte2 = palavras.slice(meio).join(' ');

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  html = html.replace(
    '<div class="titulo" id="titulo"><!-- preenchido dinamicamente --></div>',
    `<div class="titulo" id="titulo">${parte1} <span class="destaque">${parte2}</span></div>`
  );
  html = html.replace(
    '<div class="subtitulo" id="subtitulo"><!-- preenchido dinamicamente --></div>',
    `<div class="subtitulo" id="subtitulo">Calcula Prazo · Direito do Trabalho</div>`
  );

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const htmlTemp = path.join(OUTPUT_DIR, 'render.html');
  fs.writeFileSync(htmlTemp, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`file://${path.resolve(htmlTemp)}`);
  const destino = path.join(OUTPUT_DIR, 'thumbnail.png');
  await page.screenshot({ path: destino });
  await browser.close();

  const caminhoStorage = `jobs/${jobId}/thumbnail.png`;
  await enviarArquivo(destino, caminhoStorage);

  await updateJob(jobId, { thumbnail_path: caminhoStorage, status: 'thumbnail_ok' });
  console.log(`Thumbnail gerada e enviada: ${caminhoStorage}`);
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
