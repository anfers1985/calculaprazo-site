// Gera 1 imagem por cena usando Pollinations.ai (Flux) — 100% gratuito, sem chave de
// API, sem cartão, sem cota diária. Módulo isolado de propósito: se um dia você quiser
// trocar de provedor, só precisa reescrever a função gerarImagem() abaixo.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getJob, updateJob, marcarErro } from './lib/supabase.mjs';

const OUTPUT_DIR = 'output/imagens';

const ESTILO_FIXO =
  ' Identidade visual: fundo azul marinho, acentos em dourado/azul claro, ' +
  'estilo clean e institucional, sem texto sobreposto na imagem.';

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gerarImagem(prompt, destino) {
  const promptCompleto = encodeURIComponent(prompt + ESTILO_FIXO);
  // width/height no formato vertical do Short. seed aleatória evita cache repetido.
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${promptCompleto}?width=1080&height=1920&model=flux&nologo=true&seed=${seed}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pollinations respondeu ${r.status}: ${await r.text().catch(() => '')}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Resposta da Pollinations veio vazia/pequena demais, provável falha.');
  fs.writeFileSync(destino, buffer);
}

// Se a geração falhar (raro, mas a Pollinations não tem SLA), cai para um card de marca
// simples — o job continua, não trava por causa de uma imagem.
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

  const caminhos = [];
  for (let i = 0; i < cenas.length; i++) {
    const destino = path.join(OUTPUT_DIR, `cena_${String(i).padStart(2, '0')}.png`);
    try {
      await gerarImagem(cenas[i].prompt_imagem, destino);
      console.log(`Imagem gerada: ${destino}`);
    } catch (e1) {
      console.warn(`Falhou 1ª tentativa (cena ${i}): ${e1.message}. Aguardando e tentando de novo...`);
      await aguardar(16000); // respeita o limite de ~1 requisição a cada 15s do uso anônimo
      try {
        await gerarImagem(cenas[i].prompt_imagem, destino);
        console.log(`Imagem gerada na 2ª tentativa: ${destino}`);
      } catch (e2) {
        console.warn(`Falhou de novo (cena ${i}): ${e2.message}. Usando fallback de marca.`);
        await gerarFallback(destino);
      }
    }
    caminhos.push(destino);
    await aguardar(16000); // espaça as requisições pra não bater no limite de taxa anônimo
  }

  await updateJob(jobId, { imagens: caminhos, status: 'imagens_ok' });
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
