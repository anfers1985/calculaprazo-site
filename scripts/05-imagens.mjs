import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getJob, updateJob, marcarErro, enviarArquivo } from './lib/supabase.mjs';

const OUTPUT_DIR = 'output/imagens';

const ESTILO_FIXO =
  ' Identidade visual: fundo azul marinho, acentos em dourado/azul claro, ' +
  'estilo clean e institucional, sem texto sobreposto na imagem.';

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gerarImagem(prompt, destino) {
  const promptCompleto = encodeURIComponent(prompt + ESTILO_FIXO);
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${promptCompleto}?width=1080&height=1920&model=flux&nologo=true&seed=${seed}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pollinations respondeu ${r.status}: ${await r.text().catch(() => '')}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Resposta da Pollinations veio vazia/pequena demais, provável falha.');
  fs.writeFileSync(destino, buffer);
}

async function gerarFallback(destino) {
  const html = `<!doctype html><html><head><style>
    body{margin:0;width:1080px;height:1920px;background:linear-gradient(160deg,#0A1628,#0D2154);
    display:flex;align-items:center;justify-content:center;}
    .marca{font-family:'Outfit',sans-serif;font-size:56px;color:#fff;opacity:.35;}
  </style></head><body><div class="marca">Calcula Prazo</div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html);
  await page.screenshot({ path: destino });
  await browser.close();
}

async function main(jobId) {
  const job = await getJob(jobId);
  const cenas = job.roteiro.cenas;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const caminhosStorage = [];
  for (let i = 0; i < cenas.length; i++) {
    const nomeArquivo = `cena_${String(i).padStart(2, '0')}.png`;
    const destinoLocal = path.join(OUTPUT_DIR, nomeArquivo);
    try {
      await gerarImagem(cenas[i].prompt_imagem, destinoLocal);
      console.log(`Imagem gerada: ${destinoLocal}`);
    } catch (e1) {
      console.warn(`Falhou 1ª tentativa (cena ${i}): ${e1.message}. Aguardando e tentando de novo...`);
      await aguardar(16000);
      try {
        await gerarImagem(cenas[i].prompt_imagem, destinoLocal);
        console.log(`Imagem gerada na 2ª tentativa: ${destinoLocal}`);
      } catch (e2) {
        console.warn(`Falhou de novo (cena ${i}): ${e2.message}. Usando fallback de marca.`);
        await gerarFallback(destinoLocal);
      }
    }
    const caminhoStorage = `jobs/${jobId}/imagens/${nomeArquivo}`;
    await enviarArquivo(destinoLocal, caminhoStorage);
    caminhosStorage.push(caminhoStorage);
    await aguardar(16000);
  }

  await updateJob(jobId, { imagens: caminhosStorage, status: 'imagens_ok' });
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Uso: node 05-imagens.mjs <job_id>');
  process.exit(1);
}
main(jobId).catch(async err => {
  console.error(err);
  await marcarErro(jobId, 'imagens', err.message);
  process.exit(1);
});
