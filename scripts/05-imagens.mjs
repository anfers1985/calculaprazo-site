// Busca 1 foto real por cena em banco de imagens (Pexels, Unsplash e Pixabay), em vez de
// gerar por IA. Isso elimina de vez o risco de mão/rosto malformado, porque a imagem nunca
// é sintética. A padronização visual entre fotos de fontes diferentes (cor, tom) é feita
// depois, na composição do Remotion — não aqui.
//
// Cada foto candidata passa por um filtro de OCR (Tesseract) antes de ser aceita: fotos
// reais de escritório/documento costumam ter texto em inglês visível (tela de laptop,
// papel, placa) — pedir pro roteirista "evitar isso" no termo de busca não impede,
// porque ele não vê o conteúdo real da foto, só escreve a palavra-chave. Quem garante
// isso de fato é essa checagem, rejeitando a foto e tentando a próxima candidata.
//
// Ordem de tentativa por cena: Pexels (termo principal) -> Pexels (alternativo) ->
// Unsplash (principal) -> Unsplash (alternativo) -> Pixabay (principal) -> Pixabay
// (alternativo) -> cartão de marca (fallback). Dentro de cada busca, as candidatas
// (até 12) são embaralhadas antes de tentar — evita repetir sempre a mesma foto quando
// o termo de busca se parece entre vídeos diferentes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { supabase, getJob, updateJob, marcarErro, enviarArquivo } from './lib/supabase.mjs';

const OUTPUT_DIR = 'output/imagens';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const LARGURA = 1080;
const ALTURA = 1920;
const MAX_PALAVRAS_OCR = 2; // era 5 — uma placa "CLOSED" tem 1 palavra e passava; agora o limite é bem menor
const PAGINAS_SORTEIO = 3;  // sorteia a página de resultados (1..3) pra variar além das primeiras fotos

// Relevância pro público brasileiro: se os metadados da foto (descrição/tags do banco)
// mencionarem algo disso, a foto é descartada ANTES de baixar. Lista editável.
const BLOQUEIO_METADADOS = /\b(dollars?|usd|euros?|pounds?|banknotes?|cash|money|currency|us flag|american flag|usa|united states|new york|london|washington|canada|australia|turban|sikh|hindu|india|indian|arab|ramadan|chinese|china|japan|korea|christmas|halloween|thanksgiving|stock market|bitcoin|crypto|casino|gambling|nude|bikini)\b|dólar|dolar|euro|libra|nota de dinheiro/i;

// Palavras que, se o OCR achar na foto, indicam texto em inglês visível (placas, telas, papéis).
const OCR_PALAVRAS_EN = /\b(the|and|for|you|with|your|open|closed|sale|welcome|office|exit|stop|united|states|america|federal|reserve|dollar|bank|note|legal|law|justice|court|contract|agreement|business|company|sign|news|free|new|hello|home|service|about|contact)\b/i;
const CANDIDATAS_POR_BUSCA = 12; // era 6 — pool maior ajuda o sorteio a variar de verdade

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Embaralha uma cópia do array (Fisher-Yates) — usado pra não pegar sempre a mesma foto
// "número 1" do resultado de busca quando o termo se repete entre vídeos diferentes.
function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function paginaAleatoria() {
  return 1 + Math.floor(Math.random() * PAGINAS_SORTEIO);
}

// Cada buscador devolve [{ id, url, meta }]: id único (pra não repetir foto entre vídeos),
// url da imagem e meta (descrição/tags do banco, usadas no filtro de relevância).
async function buscarPexels(termo) {
  if (!PEXELS_API_KEY) return [];
  // locale=pt-BR: a busca entende o termo em português e prioriza resultados indexados no Brasil.
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(termo)}&locale=pt-BR&orientation=portrait&per_page=${CANDIDATAS_POR_BUSCA}&page=${paginaAleatoria()}`;
  const r = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  if (!r.ok) throw new Error(`Pexels respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data.photos || []).map(f => ({
    id: `pexels:${f.id}`,
    url: f.src?.large2x || f.src?.original || f.src?.large,
    meta: `${f.alt || ''} ${f.url || ''}`,
  })).filter(f => f.url);
}

async function buscarPixabay(termo) {
  if (!PIXABAY_API_KEY) return [];
  const url = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(termo)}&lang=pt&image_type=photo&orientation=vertical&safesearch=true&per_page=${CANDIDATAS_POR_BUSCA}&page=${paginaAleatoria()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pixabay respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data.hits || []).map(f => ({ id: `pixabay:${f.id}`, url: f.largeImageURL, meta: f.tags || '' })).filter(f => f.url);
}

// Unsplash: indexado em inglês, então só entra como reforço (a busca em português rende pouco).
async function buscarUnsplash(termo) {
  if (!UNSPLASH_ACCESS_KEY) return [];
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(termo)}&orientation=portrait&per_page=${CANDIDATAS_POR_BUSCA}&page=${paginaAleatoria()}`;
  const r = await fetch(url, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } });
  if (!r.ok) throw new Error(`Unsplash respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data.results || []).map(f => ({
    id: `unsplash:${f.id}`,
    url: f.urls?.full || f.urls?.regular,
    meta: `${f.alt_description || ''} ${f.description || ''} ${(f.tags || []).map(t => t.title).join(' ')}`,
  })).filter(f => f.url);
}

// ───────── Anti-repetição de imagens entre vídeos ─────────
// Duas camadas:
//  1) ID da foto no banco (ex.: "pexels:123") — barra a MESMA foto.
//  2) Hash perceptual (dHash 64 bits) — barra foto VISUALMENTE igual/muito parecida, mesmo
//     com ID diferente (a mesma foto no Pexels e no Pixabay, ou recortes/variações do mesmo
//     ensaio fotográfico, ex.: a mesma balança da justiça em 3 ângulos).
// Ambos ficam na tabela video_fotos_usadas (migration 004). Se a tabela não existir, o
// pipeline continua, só que sem memória entre vídeos (dentro do mesmo vídeo ainda funciona).
const DISTANCIA_MIN_HASH = 12;      // de 64 bits; abaixo disso, considera "a mesma imagem"
const JANELA_FOTOS_USADAS = 3000;   // quantas fotos recentes ficam na memória de comparação

async function dHash(caminho) {
  const { data } = await sharp(caminho).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}
function distanciaHash(a, b) {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

async function carregarFotosUsadas() {
  const memoria = { ids: new Set(), hashes: [] };
  try {
    const { data, error } = await supabase.from('video_fotos_usadas').select('foto_id, phash')
      .order('usado_em', { ascending: false }).limit(JANELA_FOTOS_USADAS);
    if (error) throw error;
    for (const r of data || []) {
      memoria.ids.add(r.foto_id);
      if (r.phash) memoria.hashes.push(r.phash);
    }
    console.log(`  Memória de fotos: ${memoria.ids.size} usadas, ${memoria.hashes.length} com hash.`);
  } catch (e) {
    console.warn(`  (controle de fotos usadas indisponível: ${String(e.message || e).slice(0, 100)})`);
  }
  return memoria;
}
function parecidaComAlgumaUsada(hash, memoria) {
  return memoria.hashes.some(h => distanciaHash(hash, h) <= DISTANCIA_MIN_HASH);
}
async function registrarFotoUsada(fotoId, hash, termo, jobId) {
  try {
    await supabase.from('video_fotos_usadas').upsert({ foto_id: fotoId, phash: hash, termo, job_id: jobId });
  } catch { /* opcional */ }
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
    const texto = execFileSync('tesseract', [caminhoImagem, 'stdout', '-l', 'por+eng', '--psm', '11'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20000,
    }).toString();
    const palavras = texto.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
    if (OCR_PALAVRAS_EN.test(texto)) return false;       // achou palavra inglesa de placa/tela/papel
    return palavras.length <= MAX_PALAVRAS_OCR;
  } catch (e) {
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
// a primeira foto que passar no filtro de OCR (sem texto legível demais). Dentro de cada
// busca, as candidatas são embaralhadas antes — evita cair sempre na "foto nº1" do
// resultado quando o termo se repete entre vídeos diferentes.
async function resolverFotoDaCena(cena, destinoBruto, memoria) {
  const termos = [cena.prompt_imagem, cena.prompt_imagem_alternativo].filter(Boolean);
  // Pexels e Pixabay primeiro (entendem português); Unsplash só como reforço.
  const buscadores = [buscarPexels, buscarPixabay, buscarUnsplash];

  for (const buscar of buscadores) {
    for (const termo of termos) {
      let candidatas = [];
      try {
        candidatas = embaralhar(await buscar(termo));
      } catch (e) {
        console.warn(`  Busca falhou (${buscar.name}, "${termo}"): ${e.message.slice(0, 150)}`);
        continue;
      }
      for (const foto of candidatas) {
        if (memoria.ids.has(foto.id)) continue;                  // mesma foto já usada neste ou em outro vídeo
        if (BLOQUEIO_METADADOS.test(foto.meta || '')) {
          console.warn(`  Descartada (metadado irrelevante pro Brasil): ${foto.id}`);
          memoria.ids.add(foto.id);
          continue;
        }
        try {
          await baixarUrl(foto.url, destinoBruto);
          if (!fotoEstaLimpaDeTexto(destinoBruto)) {
            console.warn(`  Descartada (texto detectado na foto): ${foto.id}`);
            memoria.ids.add(foto.id);
            continue;
          }
          const hash = await dHash(destinoBruto);
          if (parecidaComAlgumaUsada(hash, memoria)) {
            console.warn(`  Descartada (visualmente parecida com foto já usada): ${foto.id}`);
            memoria.ids.add(foto.id);
            continue;
          }
          memoria.ids.add(foto.id);
          memoria.hashes.push(hash);   // vale já pras próximas cenas deste mesmo vídeo
          return { origem: `${buscar.name} · "${termo}"`, fotoId: foto.id, hash, termo };
        } catch (e) {
          console.warn(`  Falhou ao baixar candidata (${buscar.name}, "${termo}"): ${e.message.slice(0, 150)}`);
        }
      }
    }
  }
  return null; // nenhuma fonte retornou foto aprovada
}

async function main(jobId) {
  const job = await getJob(jobId);
  const cenas = job.roteiro.cenas;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!PEXELS_API_KEY && !PIXABAY_API_KEY && !UNSPLASH_ACCESS_KEY) {
    console.warn('Nenhuma chave de banco de fotos configurada (PEXELS_API_KEY/UNSPLASH_ACCESS_KEY/PIXABAY_API_KEY) — todas as cenas vão usar o cartão de marca de reserva.');
  }

  const memoria = await carregarFotosUsadas();
  const caminhosStorage = [];
  for (let i = 0; i < cenas.length; i++) {
    const nomeArquivo = `cena_${String(i).padStart(2, '0')}.png`;
    const destinoBruto = path.join(OUTPUT_DIR, `_bruto_${i}.jpg`);
    const destinoPng = path.join(OUTPUT_DIR, nomeArquivo);

    const achada = await resolverFotoDaCena(cenas[i], destinoBruto, memoria);
    if (achada) {
      try {
        normalizarParaPng(destinoBruto, destinoPng);
        await registrarFotoUsada(achada.fotoId, achada.hash, achada.termo, jobId);
        console.log(`Cena ${i}: foto de ${achada.origem}`);
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
