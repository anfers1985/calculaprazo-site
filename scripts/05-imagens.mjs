// Gera 1 imagem por cena usando o Gemini (free tier). Módulo isolado de propósito:
// se um dia você quiser trocar por Stable Diffusion local ou outro provedor, só
// precisa reescrever a função gerarImagem() abaixo — o resto da pipeline não muda.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getJob, updateJob, marcarErro } from './lib/supabase.mjs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Confirme o nome exato do modelo de imagem disponível na sua conta em aistudio.google.com
// (o nome do modelo de geração de imagem do Gemini muda de tempos em tempos).
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

const OUTPUT_DIR = 'output/imagens';

const ESTILO_FIXO =
  ' Identidade visual: fundo azul marinho (#0A1628 a #0D2154), acentos em dourado/azul claro, ' +
  'estilo clean e institucional, sem texto sobreposto na imagem (o texto é adicionado depois no vídeo).';

async function gerarImagem(prompt, destino) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt + ESTILO_FIXO }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!r.ok) throw new Error(`Gemini respondeu ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const parte = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!parte) throw new Error('Gemini não retornou imagem. Resposta: ' + JSON.stringify(data).slice(0, 500));
  fs.writeFileSync(destino, Buffer.from(parte.inlineData.data, 'base64'));
}

// Alguns temas do blog (trabalho escravo, assédio, acidentes) podem levar o Gemini a
// recusar a geração por segurança. Em vez de derrubar o job inteiro, cai para um card
// de fundo com a identidade visual, sem gerar imagem nenhuma sobre o tema sensível.
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
      console.warn(`Falhou 1ª tentativa (cena ${i}): ${e1.message}. Tentando de novo...`);
      try {
        await gerarImagem(cenas[i].prompt_imagem, destino);
        console.log(`Imagem gerada na 2ª tentativa: ${destino}`);
      } catch (e2) {
        console.warn(`Falhou de novo (cena ${i}): ${e2.message}. Usando fallback de marca.`);
        await gerarFallback(destino);
      }
    }
    caminhos.push(destino);
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
