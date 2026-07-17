// Busca 1 foto real por cena em banco de imagens (Pexels, com Pixabay como reforço),
// em vez de gerar por IA. Isso elimina de vez o risco de mão/rosto malformado, porque
// a imagem nunca é sintética. A padronização visual entre fotos de fontes diferentes
// (cor, tom) é feita depois, na composição do Remotion — não aqui.
//
// Ordem de tentativa por cena: Pexels (termo principal) -> Pexels (termo alternativo)
// -> Pixabay (termo principal) -> Pixabay (termo alternativo) -> cartão de marca (fallback).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { getJob, updateJob, marcarErro, enviarArquivo } from './lib/supabase.mjs';

const OUTPUT_DIR = 'output/imagens';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const LARGURA = 1080;
const ALTURA = 1920;

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buscarPexels(termo) {
  if (!PEXELS_API_KEY) return null;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(termo)}&orientation=portrait&per_page=6`;
  const r = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  if (!r.ok) throw new Error(`Pexels respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const foto = data.photos?.[0];
  if (!foto) return null;
  return foto.src?.large2x || foto.src?.original || foto.src?.large;
}

async function buscarPixabay(termo) {
  if (!PIXABAY_API_KEY) return null;
  const url = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(termo)}&image_type=photo&orientation=vertical&safesearch=true&per_page=6`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pixabay respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const foto = data.hits?.[0];
  if (!foto) return null;
  return foto.largeImageURL;
}

async function baixarUrl(url, destinoBruto) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download da foto falhou: ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 2000) throw new Error('Arquivo baixado veio pequeno/vazio demais.');
  fs.writeFileSync(destinoBruto, buffer);
}

// Cobre o quadro 1080x1920 sem distorcer (escala pra cobrir e corta o excedente
// centralizado), e converte pra PNG de verdade — necessário porque o Remotion embute
// a imagem como data URI declarando "image/png", e o Chrome é estrito com isso.
function normalizarParaPng(origemBruta, destinoPng) {
  execFileSync('ffmpeg', [
    '-y', '-i', origemBruta,
    '-vf', `scale=${LARGURA}:${ALTURA}:force_original_aspect_ratio=increase,crop=${LARGURA}:${ALTURA}`,
    destinoPng,
  ], { stdio: 'pipe' });
}

async function gerarFallbackDeMarca(destinoPng) {
  const html = `<!doctype html><html><head><style>
    body{margin:0;width:${LARGURA}px;height:${ALTURA}px;background:linear-gradient(160deg,#0A1628,#0D2154);
    display:flex;align-items:center;justify-content:center;}
    .marca{font-family:'Outfit',sans-serif;font-size:56px;color:#fff;opacity:.35;}
  </style></head><body><div class="marca">Calcula Prazo</div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA } });
  await page.setContent(html);
  await page.screenshot({ path: destinoPng });
  await browser.close();
}

// Tenta, em ordem, todas as fontes/termos possíveis pra essa cena. Cada função de
// busca retorna a URL da melhor foto encontrada, ou null se não achou nada.
async function resolverFotoDaCena(cena, destinoBruto) {
  const termos = [cena.prompt_imagem, cena.prompt_imagem_alternativo].filter(Boolean);
  const buscadores = [buscarPexels, buscarPixabay];

  for (const buscar of buscadores) {
    for (const termo of termos) {
      try {
        const url = await buscar(termo);
        if (url) {
          await baixarUrl(url, destinoBruto);
          return `${buscar.name} · "${termo}"`;
        }
      } catch (e) {
        console.warn(`  Falhou (${buscar.name}, "${termo}"): ${e.message.slice(0, 150)}`);
      }
    }
  }
  return null; // nenhuma fonte retornou foto
}

async function main(jobId) {
  const job = await getJob(jobId);
  const cenas = job.roteiro.cenas;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!PEXELS_API_KEY && !PIXABAY_API_KEY) {
    console.warn('Nenhuma chave de banco de fotos configurada (PEXELS_API_KEY/PIXABAY_API_KEY) — todas as cenas vão usar o cartão de marca de reserva.');
  }

  const caminhosStorage = [];
  for (let i = 0; i < cenas.length; i++) {
    const nomeArquivo = `cena_${String(i).padStart(2, '0')}.png`;
    const destinoBruto = path.join(OUTPUT_DIR, `_bruto_${i}.jpg`);
    const destinoPng = path.join(OUTPUT_DIR, nomeArquivo);

    const origem = await resolverFotoDaCena(cenas[i], destinoBruto);
    if (origem) {
      try {
        normalizarParaPng(destinoBruto, destinoPng);
        console.log(`Cena ${i}: foto de ${origem}`);
      } catch (e) {
        console.warn(`Cena ${i}: falhou ao normalizar foto (${e.message.slice(0, 150)}), usando cartão de marca.`);
        await gerarFallbackDeMarca(destinoPng);
      }
    } else {
      console.warn(`Cena ${i}: nenhuma foto encontrada pra "${cenas[i].prompt_imagem}" / "${cenas[i].prompt_imagem_alternativo}", usando cartão de marca.`);
      await gerarFallbackDeMarca(destinoPng);
    }
    if (fs.existsSync(destinoBruto)) fs.rmSync(destinoBruto);

    const caminhoStorage = `jobs/${jobId}/imagens/${nomeArquivo}`;
    await enviarArquivo(destinoPng, caminhoStorage);
    caminhosStorage.push(caminhoStorage);
    await aguardar(1500); // cortesia com o rate limit dos bancos de foto
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
