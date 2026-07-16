// Gera 1 imagem por cena. Tenta primeiro o Gemini (Nano Banana — melhor qualidade),
// e cai automaticamente pro Pollinations.ai (gratuito, sem chave) se o Gemini falhar
// (ex: faturamento não ativado, cota, bloqueio de segurança). Módulo isolado de
// propósito: cada provedor é uma função própria, fácil de trocar/remover.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getJob, updateJob, marcarErro, enviarArquivo } from './lib/supabase.mjs';

const OUTPUT_DIR = 'output/imagens';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const USAR_GEMINI = process.env.USAR_GEMINI_IMAGE !== 'false'; // desliga com secret USAR_GEMINI_IMAGE=false

const ESTILO_FIXO =
  ' Estilo obrigatório: ilustração vetorial plana (flat design) ou colagem de recortes de ' +
  'papel (paper-cut collage) — NUNCA fotografia, NUNCA render 3D realista, NUNCA hiper-realismo. ' +
  'Fundo azul marinho, formas em dourado/azul claro/branco, poucas cores, muito espaço negativo, ' +
  'composição centrada e limpa, bordas nítidas, sem gradiente fotorrealista, sem textura de pele. ' +
  'Se houver figuras humanas, representá-las como silhuetas ou formas geométricas simplificadas, ' +
  'sem rosto detalhado nem dedos individuais — like modern editorial illustration, flat vector, ' +
  'paper cut collage art. Sem nenhum texto, letra, número ou símbolo escrito na imagem.';

// Termos que pedem realismo fotográfico ou anatomia detalhada — incompatíveis com o estilo
// de ilustração plana/colagem que adotamos justamente pra evitar erros de anatomia. Quando o
// prompt da cena cai nisso, reforçamos a simplificação em vez de deixar o gerador tentar
// desenhar algo realista.
const RISCO_REALISMO = /\b(rosto|face|m[ãa]os?|dedos?|punho|close-?up|fotorrealista|fotografia|foto realista|realista)\b/i;

function reforcarPromptSePreciso(prompt) {
  if (RISCO_REALISMO.test(prompt)) {
    return prompt + ' (Atenção: mantenha estritamente o estilo de ilustração plana/colagem — ' +
      'represente qualquer pessoa como silhueta ou forma geométrica simplificada, sem rosto ' +
      'nem mãos detalhadas, sem fotorrealismo.)';
  }
  return prompt;
}

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gerarImagemGemini(prompt, destino) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt + ESTILO_FIXO }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!r.ok) throw new Error(`Gemini respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const parte = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!parte) throw new Error('Gemini não retornou imagem (provável bloqueio de segurança).');
  fs.writeFileSync(destino, Buffer.from(parte.inlineData.data, 'base64'));
}

async function gerarImagemPollinations(prompt, destino) {
  const promptCompleto = encodeURIComponent(prompt + ESTILO_FIXO);
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${promptCompleto}?width=768&height=1344&model=flux&nologo=true&enhance=true&seed=${seed}`;

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

// Ordem de tentativa: Gemini (se habilitado) -> Pollinations -> Pollinations de novo -> fallback de marca.
async function gerarImagem(prompt, destino) {
  if (USAR_GEMINI && GEMINI_API_KEY) {
    try {
      await gerarImagemGemini(prompt, destino);
      console.log('  (via Gemini/Nano Banana)');
      return;
    } catch (e) {
      console.warn(`  Gemini falhou (${e.message.slice(0, 150)}), tentando Pollinations...`);
    }
  }
  await gerarImagemPollinations(prompt, destino);
  console.log('  (via Pollinations)');
}

async function main(jobId) {
  const job = await getJob(jobId);
  const cenas = job.roteiro.cenas;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const caminhosStorage = [];
  for (let i = 0; i < cenas.length; i++) {
    const nomeArquivo = `cena_${String(i).padStart(2, '0')}.png`;
    const destinoLocal = path.join(OUTPUT_DIR, nomeArquivo);
    const promptCena = reforcarPromptSePreciso(cenas[i].prompt_imagem);
    try {
      await gerarImagem(promptCena, destinoLocal);
      console.log(`Imagem gerada: ${destinoLocal}`);
    } catch (e1) {
      console.warn(`Falhou 1ª tentativa (cena ${i}): ${e1.message}. Aguardando e tentando de novo...`);
      await aguardar(16000);
      try {
        await gerarImagem(promptCena, destinoLocal);
        console.log(`Imagem gerada na 2ª tentativa: ${destinoLocal}`);
      } catch (e2) {
        console.warn(`Falhou de novo (cena ${i}): ${e2.message}. Usando fallback de marca.`);
        await gerarFallback(destinoLocal);
      }
    }
    const caminhoStorage = `jobs/${jobId}/imagens/${nomeArquivo}`;
    await enviarArquivo(destinoLocal, caminhoStorage);
    caminhosStorage.push(caminhoStorage);
    await aguardar(4000); // Gemini não tem o limite de taxa do Pollinations; a espera aqui é só cortesia
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
