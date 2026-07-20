// Busca 1 foto real por cena em banco de imagens (Pexels, com Pixabay como reforço),
// em vez de gerar por IA. Isso elimina de vez o risco de mão/rosto malformado, porque
// a imagem nunca é sintética. A padronização visual entre fotos de fontes diferentes
// (cor, tom) é feita depois, na composição do Remotion — não aqui.
//
// Cada foto candidata passa por um filtro de OCR (Tesseract) antes de ser aceita: fotos
// reais de escritório/documento costumam ter texto em inglês visível (tela de laptop,
// papel, placa) — pedir pro roteirista "evitar isso" no termo de busca não impede,
// porque ele não vê o conteúdo real da foto, só escreve a palavra-chave. Quem garante
// isso de fato é essa checagem, rejeitando a foto e tentando a próxima candidata.
//
// Ordem de tentativa por cena: Pexels (termo principal) -> Pexels (termo alternativo)
// -> Pixabay (termo principal) -> Pixabay (termo alternativo) -> cartão de marca (fallback).
// Dentro de cada busca, tenta até 6 fotos candidatas até achar uma sem texto detectável.
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
const MAX_PALAVRAS_OCR = 5; // acima disso, considera que a foto tem texto legível demais

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buscarPexels(termo) {
  if (!PEXELS_API_KEY) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(termo)}&orientation=portrait&per_page=6`;
  const r = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  if (!r.ok) throw new Error(`Pexels respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data.photos || []).map(f => f.src?.large2x || f.src?.original || f.src?.large).filter(Boolean);
}

async function buscarPixabay(termo) {
  if (!PIXABAY_API_KEY) return [];
  const url = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(termo)}&image_type=photo&orientation=vertical&safesearch=true&per_page=6`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pixabay respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data.hits || []).map(f => f.largeImageURL).filter(Boolean);
}

async function baixarUrl(url, destinoBruto) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download da foto falhou: ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 2000) throw new Error('Arquivo baixado veio pequeno/vazio demais.');
  fs.writeFileSync(destinoBruto, buffer);
}

// Roda OCR na foto baixada e conta quantas "palavras" de verdade (3+ letras) o Tesseract
// reconheceu. Foto de pessoa/ambiente comum não tem texto real, então o OCR só acha ruído
// (0-2 palavras). Foto com tela/documento/placa legível passa fácil de 5. Retorna true se
// a foto está limpa o suficiente pra usar.
function fotoEstaLimpaDeTexto(caminhoImagem) {
  try {
    const texto = execFileSync('tesseract', [caminhoImagem, 'stdout', '-l', 'por+eng'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    }).toString();
    const palavras = (texto.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length;
    return palavras <= MAX_PALAVRAS_OCR;
  } catch (e) {
    // Se o Tesseract não estiver instalado ou falhar, não bloqueia o pipeline por isso —
    // só deixa passar sem checagem (melhor ter foto sem garantia do que travar o job).
    console.warn(`  OCR indisponível/falhou (${e.message.slice(0, 100)}) — aceitando sem checar texto.`);
    return true;
  }
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

// Tenta, em ordem, todas as fontes/termos/candidatas possíveis pra essa cena, aceitando
// a primeira foto que passar no filtro de OCR (sem texto legível demais).
async function resolverFotoDaCena(cena, destinoBruto) {
  const termos = [cena.prompt_imagem, cena.prompt_imagem_alternativo].filter(Boolean);
  const buscadores = [buscarPexels, buscarPixabay];

  for (const buscar of buscadores) {
    for (const termo of termos) {
      let candidatas = [];
      try {
        candidatas = await buscar(termo);
      } catch (e) {
        console.warn(`  Busca falhou (${buscar.name}, "${termo}"): ${e.message.slice(0, 150)}`);
        continue;
      }
      for (const url of candidatas) {
        try {
          await baixarUrl(url, destinoBruto);
          if (fotoEstaLimpaDeTexto(destinoBruto)) {
            return `${buscar.name} · "${termo}"`;
          }
          console.warn(`  Descartada (texto detectado na foto): ${buscar.name} · "${termo}"`);
        } catch (e) {
          console.warn(`  Falhou ao baixar candidata (${buscar.name}, "${termo}"): ${e.message.slice(0, 150)}`);
        }
      }
    }
  }
  return null; // nenhuma fonte retornou foto limpa
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
