// Geração de IMAGENS por IA para o Short ilustrado, com fallback entre provedores e tempos de espera GENEROSOS
// (o Google pode levar minutos sob demanda alta; abortar cedo só desperdiça a cota).
//
// Cadeia (ordem em IMG_ORDEM, padrão "9router,gemini"; cada etapa só roda se estiver configurada):
//   9router → POST {NINEROUTER_URL}/v1/images/generations   (modelo em NINEROUTER_IMAGE_MODEL)
//   gemini  → generateContent com saída de imagem             (modelos em GEMINI_IMAGE_MODELS; chaves GEMINI_API_KEY / GEMINI_API_KEY_2)
//   cloudflare → Workers AI (FLUX.1 schnell), cota GRATUITA de 10.000 neurons/dia (~100+ imagens)
//                (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN; modelo em CLOUDFLARE_IMAGE_MODEL)
//
// Variáveis (todas opcionais): IMG_TIMEOUT_MS (padrão 300000 = 5 min), IMG_TENTATIVAS (padrão 4),
// IMG_INTERVALO_MS (pausa entre imagens; padrão 7000, respeita ~10 pedidos/min do plano gratuito),
// GEMINI_IMAGE_MODELS (padrão "gemini-2.5-flash-image,gemini-3.1-flash-image-preview"),
// IMG_ORCAMENTO_MIN (teto de tempo para gerar UMA imagem, somando provedores e tentativas; padrão 12; 0 = sem limite),
// IMG_FALHA_MAX_PCT (fração de cenas sem imagem tolerada antes de falhar o job; padrão 0.4).
//
// Cota DIÁRIA esgotada (Cloudflare 4006 / Gemini 429 "exceeded your current quota"): o provedor é marcado como esgotado e NÃO é tentado de novo
// nesta execução; se todos esgotarem, o job para na hora, com mensagem clara, em vez de repetir 5 chamadas inúteis por cena.
import fs from 'node:fs';
import { detectarTexto } from './ocr-imagem.mjs';
import path from 'node:path';

const TIMEOUT_MS = Number(process.env.IMG_TIMEOUT_MS) || 300000;
const TENTATIVAS = Number(process.env.IMG_TENTATIVAS) || 4;
const INTERVALO_MS = process.env.IMG_INTERVALO_MS !== undefined && process.env.IMG_INTERVALO_MS !== '' ? Number(process.env.IMG_INTERVALO_MS) : 7000;
const ORCAMENTO_IMG_MS = (Number.isFinite(Number(process.env.IMG_ORCAMENTO_MIN)) && process.env.IMG_ORCAMENTO_MIN !== undefined && process.env.IMG_ORCAMENTO_MIN !== '' ? Number(process.env.IMG_ORCAMENTO_MIN) : 12) * 60000;
const FALHA_MAX_PCT = Number.isFinite(Number(process.env.IMG_FALHA_MAX_PCT)) && process.env.IMG_FALHA_MAX_PCT !== undefined && process.env.IMG_FALHA_MAX_PCT !== '' ? Number(process.env.IMG_FALHA_MAX_PCT) : 0.4;
// Provedores cuja cota diária já se esgotou NESTA execução (chave = nome da etapa). Vale para todas as cenas e para o outro job do "par do dia".
const esgotados = new Map();
export function _resetarEsgotados() { esgotados.clear(); }
export class CotaImagensEsgotada extends Error {
  constructor(msg) { super(msg); this.name = 'CotaImagensEsgotada'; this.cotaEsgotada = true; }
}
const RE_TEMPORARIO = /rate.?limit|429|overload|high demand|unavailable|timeout|gateway|500|502|503|504|524|try again|internal|sem imagem|fetch failed|ECONN|socket|network/i;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (i) => 15000 * i + Math.floor(Math.random() * 5000);

function extPorMime(mime) {
  if (/png/i.test(mime)) return 'png';
  if (/webp/i.test(mime)) return 'webp';
  return 'jpg';
}

async function fetchComTimeout(url, opts, ms = TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? `Timeout (sem resposta em ${Math.round(ms / 1000)}s)` : e.message); }
  finally { clearTimeout(t); }
}

// ---------- 9router (compatível com OpenAI) ----------
export function urlImagensNineRouter(base) {
  const b = String(base || '').replace(/\/+$/, '');
  return /\/v1$/.test(b) ? `${b}/images/generations` : `${b}/v1/images/generations`;
}

async function viaNineRouter(prompt) {
  const url = process.env.NINEROUTER_URL, modelo = process.env.NINEROUTER_IMAGE_MODEL;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`;
  const r = await fetchComTimeout(urlImagensNineRouter(url), { method: 'POST', headers, body: JSON.stringify({ model: modelo, prompt, n: 1, size: process.env.NINEROUTER_IMAGE_SIZE || '1024x1792', response_format: 'b64_json' }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`9router imagens HTTP ${r.status}: ${JSON.stringify(data?.error || data).slice(0, 200)}`);
  const item = data?.data?.[0] || {};
  if (item.b64_json) return { bytes: Buffer.from(item.b64_json, 'base64'), mime: 'image/png' };
  if (item.url) {
    const img = await fetchComTimeout(item.url, {});
    if (!img.ok) throw new Error(`9router: não consegui baixar a imagem (${img.status})`);
    return { bytes: Buffer.from(await img.arrayBuffer()), mime: img.headers.get('content-type') || 'image/png' };
  }
  throw new Error('9router: resposta sem imagem (sem imagem)');
}

// ---------- Gemini ----------
export function extrairImagemGemini(data) {
  const partes = data?.candidates?.[0]?.content?.parts || [];
  for (const p of partes) {
    const d = p.inlineData || p.inline_data;
    if (d?.data) return { bytes: Buffer.from(d.data, 'base64'), mime: d.mimeType || d.mime_type || 'image/png' };
  }
  return null;
}

/** Extrai de error.details (QuotaFailure / RetryInfo) a métrica e o limite da cota: a mensagem curta do Google não diz se o limite é 0 (modelo sem cota gratuita). */
export function detalheCotaGemini(data) {
  const det = Array.isArray(data?.error?.details) ? data.error.details : [];
  const partes = [];
  for (const d of det) {
    for (const v of d?.violations || []) {
      const metrica = String(v.quotaMetric || v.quotaId || '').split('/').pop();
      if (metrica) partes.push(metrica + (v.quotaValue !== undefined ? `=${v.quotaValue}` : ''));
    }
    if (d?.retryDelay) partes.push(`retryDelay=${d.retryDelay}`);
  }
  const bruto = JSON.stringify(data?.error || {});
  if (/limit['"]?\s*[:=]\s*['"]?0\b/i.test(bruto) || /quotaValue['"]?\s*:\s*['"]?0['"]?[,}]/.test(bruto)) partes.push('limite 0: sem cota gratuita para este modelo/chave');
  return partes.length ? ` [${[...new Set(partes)].join('; ').slice(0, 220)}]` : '';
}

async function viaGemini(prompt, { apiKey, modelo, aspecto }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const corpo = (comAspecto, modalidades) => ({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: modalidades, ...(comAspecto ? { imageConfig: { aspectRatio: aspecto } } : {}) },
  });
  let comAspecto = true, modalidades = ['IMAGE'];
  for (let ajuste = 0; ajuste < 3; ajuste++) {
    const r = await fetchComTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(corpo(comAspecto, modalidades)) });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const img = extrairImagemGemini(data);
      if (img) return img;
      const motivo = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'desconhecido';
      const txt = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ').slice(0, 120);
      const e = new Error(`Gemini (${modelo}) respondeu sem imagem (motivo: ${motivo}${txt ? '; texto: ' + txt : ''})`);
      e.bloqueio = /SAFETY|BLOCK|PROHIBITED|RECITATION/i.test(motivo);
      throw e;
    }
    const msg = String(data?.error?.message || JSON.stringify(data?.error || data)).slice(0, 300) + detalheCotaGemini(data);
    // O modelo não aceita imageConfig / só IMAGE: ajusta o pedido e tenta de novo na hora.
    if (r.status === 400 && comAspecto && /imageConfig|aspect/i.test(msg)) { comAspecto = false; continue; }
    if (r.status === 400 && modalidades.length === 1 && /modalit/i.test(msg)) { modalidades = ['TEXT', 'IMAGE']; continue; }
    const e = new Error(`Gemini (${modelo}) HTTP ${r.status}: ${msg}`);
    e.cotaDiaria = /exceeded your current quota|quota exceeded|per\s?day|limite 0/i.test(msg) && !/per\s?minute/i.test(msg);
    e.definitivo = r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404;
    throw e;
  }
  throw new Error(`Gemini (${modelo}): não consegui ajustar o pedido de imagem.`);
}


// ---------- Cloudflare Workers AI (gratuito: 10.000 neurons/dia) ----------
// FLUX.1 schnell não escreve português com acento de forma confiável, e o vídeo já tem a legenda por cima:
// trocamos o pedido de "texto dentro da imagem" por "sem texto".
// O FLUX desenha as palavras que aparecem no pedido ("law book" virou "Law", "final judgment stamp" virou "FINAL JUDGEMEON"): troca-as por descrições visuais sem nome escrito.
const TROCAS_TEXTO_NA_IMAGEM = [
  [/\b(?:open\s+)?(?:law|legal|statute|code)\s*books?\b/gi, 'closed leather book with a plain blank cover'],
  [/\b(?:statutes?|legal codes?|codes? of law|bylaws?)\b/gi, 'closed leather book with a plain blank cover'],
  [/\b(?:wall\s+|desk\s+|paper\s+)?calendars?\b/gi, 'analog wall clock'],   // calendário vira grade com letras/números inventados ("DAIM", "M T W")
  [/\b(?:final\s+)?judg(?:e)?ments?(?:\s+(?:stamp|seal|document|paper|sign))?\b/gi, 'wooden gavel on a sound block'],
  [/\b(?:stamps?|seals?|labels?|signs?|signage|banners?|posters?|certificates?|diplomas?|tags?)\b/gi, 'plain blank object'],
  [/\b(?:words?|letters?|text|writing|written|inscriptions?|captions?|titles?)\b/gi, ''],
];
export function limparPalavrasQueViramTexto(prompt) {
  let x = String(prompt || '');
  for (const [re, por] of TROCAS_TEXTO_NA_IMAGEM) x = x.replace(re, por);
  return x.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
}
export function promptSemTexto(prompt) {
  const limpo = limparPalavrasQueViramTexto(String(prompt || '').replace(/The ONLY text visible in the image reads exactly[\s\S]*?anywhere\)\./i, '')).replace(/\s+/g, ' ').trim();
  return `${limpo} No text, letters, numbers or signs with writing anywhere in the image.`.slice(0, 2000);
}

async function viaCloudflare(prompt) {
  const conta = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  const modelo = process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
  const url = `https://api.cloudflare.com/client/v4/accounts/${conta}/ai/run/${modelo}`;
  const corpo = { prompt: promptSemTexto(prompt) };
  if (/flux/i.test(modelo)) corpo.steps = Number(process.env.CLOUDFLARE_IMAGE_STEPS) || 6; // schnell: 1–8 passos
  const r = await fetchComTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo) });
  const tipo = r.headers.get('content-type') || '';
  if (r.ok && /^image\//i.test(tipo)) return { bytes: Buffer.from(await r.arrayBuffer()), mime: tipo.split(';')[0] }; // SDXL devolve a imagem direto
  const data = await r.json().catch(() => ({}));
  const b64 = data?.result?.image;
  if (r.ok && b64) return { bytes: Buffer.from(b64, 'base64'), mime: /^iVBOR/.test(b64) ? 'image/png' : 'image/jpeg' };
  const msg = String(data?.errors?.map?.((x) => `${x.code}: ${x.message}`).join('; ') || JSON.stringify(data)).slice(0, 300);
  const e = new Error(`Cloudflare (${modelo}) HTTP ${r.status}: ${msg}`);
  e.cotaDiaria = /daily free allocation|10,?000 neurons|4006/i.test(msg);
  e.bloqueio = /nsfw|3030|flagged|inappropriate/i.test(msg);
  e.definitivo = [400, 401, 403, 404].includes(r.status);
  throw e;
}

async function comRetry(nome, fn, log, estourou = () => false) {
  let ultimo;
  for (let i = 1; i <= TENTATIVAS; i++) {
    try { return await fn(); }
    catch (e) {
      ultimo = e;
      const temporario = !e.definitivo && !e.cotaDiaria && !e.bloqueio && RE_TEMPORARIO.test(e.message);
      if (!temporario || i === TENTATIVAS || estourou()) break; // estourou(): orçamento de tempo da imagem esgotado — não espera mais um backoff
      const ms = backoff(i);
      log(`    ${nome}: ${e.message.slice(0, 140)} — nova tentativa em ${Math.round(ms / 1000)}s (${i}/${TENTATIVAS})`);
      await esperar(ms);
    }
  }
  throw ultimo;
}

// Reforço positivo usado nas novas tentativas depois que o OCR achou letras na imagem (o gerador não entende "sem texto", mas segue o que se pede).
const REFORCO_SEM_ESCRITA = ' Every object in the scene has a clean, blank, unmarked surface: plain book covers, empty paper, blank screens, unlabeled objects.';
const OCR_RETENTATIVAS = Number.isFinite(Number(process.env.IMG_OCR_TENTATIVAS)) && process.env.IMG_OCR_TENTATIVAS !== undefined && process.env.IMG_OCR_TENTATIVAS !== '' ? Number(process.env.IMG_OCR_TENTATIVAS) : 2;
const OCR_MAX_REJEICOES = Number(process.env.IMG_OCR_MAX_REJEICOES) || 4; // teto por imagem, somando todos os provedores (cada rejeição gasta cota)

export function etapasImagem() {
  const ordem = (process.env.IMG_ORDEM || '9router,cloudflare,gemini').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const modelos = (process.env.GEMINI_IMAGE_MODELS || 'gemini-2.5-flash-image,gemini-3.1-flash-image-preview').split(',').map((x) => x.trim()).filter(Boolean);
  const chaves = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
  const etapas = [];
  for (const id of ordem) {
    if (id === '9router' && process.env.NINEROUTER_URL && process.env.NINEROUTER_IMAGE_MODEL) {
      etapas.push({ nome: `9router (${process.env.NINEROUTER_IMAGE_MODEL})`, rodar: (p) => viaNineRouter(p) });
    }
    if (id === 'cloudflare' && process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
      etapas.push({ nome: `Cloudflare (${process.env.CLOUDFLARE_IMAGE_MODEL || 'flux-1-schnell'})`, rodar: (p) => viaCloudflare(p) });
    }
    if (id === 'gemini') {
      chaves.forEach((k, ki) => modelos.forEach((m) => etapas.push({ nome: `Gemini${ki ? ' (2ª chave)' : ''} ${m}`, rodar: (p, asp) => viaGemini(p, { apiKey: k, modelo: m, aspecto: asp }) })));
    }
  }
  return etapas;
}

/** Gera UMA imagem e salva em `destinoSemExt` + extensão. Devolve { arquivo, provedor }. */
export async function gerarImagem({ prompt, destinoSemExt, aspecto = '9:16', log = console.log, etapas = etapasImagem() }) {
  if (!etapas.length) throw new Error('Nenhum gerador de imagem configurado (defina CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, GEMINI_API_KEY ou NINEROUTER_URL + NINEROUTER_IMAGE_MODEL).');
  const erros = [];
  const inicio = Date.now();
  const estourou = () => ORCAMENTO_IMG_MS > 0 && Date.now() - inicio > ORCAMENTO_IMG_MS;
  let rejeicoes = 0;
  for (const et of etapas) {
    if (esgotados.has(et.nome)) { erros.push(`${et.nome}: cota diária já esgotada nesta execução`); continue; }   // circuito aberto: não gasta chamada nem tempo
    if (estourou()) { erros.push(`${et.nome}: não tentado (orçamento de ${Math.round(ORCAMENTO_IMG_MS / 60000)} min por imagem esgotado)`); continue; }
    try {
      for (let t = 0; t <= OCR_RETENTATIVAS; t++) {
        if (rejeicoes >= OCR_MAX_REJEICOES) throw new Error(`imagem com letras em ${rejeicoes} tentativas (limite do OCR)`);
        if (t > 0 && estourou()) throw new Error('orçamento de tempo por imagem esgotado durante as novas tentativas do OCR');
        const { bytes, mime } = await comRetry(et.nome, () => et.rodar(t === 0 ? prompt : prompt + REFORCO_SEM_ESCRITA, aspecto), log, estourou);
        if (!bytes || bytes.length < 2000) throw new Error('imagem vazia ou corrompida');
        const arquivo = `${destinoSemExt}.${extPorMime(mime)}`;
        fs.mkdirSync(path.dirname(arquivo), { recursive: true });
        fs.writeFileSync(arquivo, bytes);
        const ocr = detectarTexto(arquivo);   // { disponivel:false } se o Tesseract não existir: não bloqueia
        if (!ocr.temTexto) return { arquivo, provedor: et.nome, rejeicoesOcr: rejeicoes };
        rejeicoes++;
        log(`    ${et.nome}: a imagem tem letras (${ocr.palavras.slice(0, 4).join(', ')}) — descartada, gerando outra (${rejeicoes})`);
        try { fs.unlinkSync(arquivo); } catch { /* já removido */ }
      }
      erros.push(`${et.nome}: letras na imagem em todas as tentativas`);
    } catch (e) {
      erros.push(`${et.nome}: ${e.message}`);
      log(`    ${et.nome} falhou: ${e.message.slice(0, 260)}`);
      if (e.cotaDiaria) { esgotados.set(et.nome, e.message.replace(/^.*?(HTTP \d{3}:\s*)/, '$1').slice(0, 230)); log(`    ${et.nome}: cota diária esgotada — não será tentado de novo nesta execução.`); }
      if (/limite do OCR/.test(e.message)) break;
    }
  }
  // Todos os provedores configurados esgotaram a cota diária: tentar mais cenas não adianta. Para agora, dizendo claramente por quê.
  if (etapas.length && etapas.every((et) => esgotados.has(et.nome))) {
    const quem = etapas.map((et) => `${et.nome}: ${esgotados.get(et.nome)}`).join(' | ');
    throw new CotaImagensEsgotada(`Cota diária de imagens esgotada em todos os provedores (${quem}). As imagens já geradas ficaram guardadas: use "Tentar de novo" depois que a cota renovar (ela é diária), ou configure outra chave/provedor (GEMINI_API_KEY_2, NINEROUTER_URL).`);
  }
  throw new Error(`Nenhum provedor gerou a imagem:\n${erros.join('\n')}`);
}

/**
 * Gera a imagem de cada cena (uma por vez, com pausa entre elas). `existentes[i]` (caminho) pula a cena.
 * Devolve { arquivos: [caminho|null], falhas }. Não lança erro por falhas isoladas: a cena fica sem imagem
 * (o vídeo usa um cartão de papel com o texto) — só falha o job se passar de `maxFalhaPct`.
 */
export async function gerarImagensDoRoteiro({ cenas, montarPrompt, dir, existentes = [], aspecto = '9:16', maxFalhaPct = FALHA_MAX_PCT, log = console.log, aoGerar }) {
  fs.mkdirSync(dir, { recursive: true });
  const arquivos = [];
  let falhas = 0, geradas = 0, rejeitadasOcr = 0;
  const motivos = [];
  for (let i = 0; i < cenas.length; i++) {
    const nn = String(i + 1).padStart(2, '0');
    if (existentes[i]) { arquivos.push(existentes[i]); continue; }
    if (geradas > 0 && INTERVALO_MS) await esperar(INTERVALO_MS);
    log(`  Imagem ${i + 1}/${cenas.length}...`);
    try {
      const { arquivo, provedor, rejeicoesOcr = 0 } = await gerarImagem({ prompt: montarPrompt(cenas[i], i), destinoSemExt: path.join(dir, `img_${nn}`), aspecto, log });
      rejeitadasOcr += rejeicoesOcr;
      log(`    ok (${provedor}${rejeicoesOcr ? `; ${rejeicoesOcr} descartada(s) por ter letras` : ''})`);
      arquivos.push(arquivo);
      geradas++;
      if (aoGerar) await aoGerar(i, arquivo);
    } catch (e) {
      if (e.cotaEsgotada) {
        // para na hora: as cenas restantes só gastariam chamadas que já sabemos que falham. O que foi gerado já está no Storage (aoGerar).
        log(`  Parando na cena ${i + 1}/${cenas.length}: ${e.message}`);
        throw new Error(`Imagens: ${arquivos.filter(Boolean).length} de ${cenas.length} cenas prontas; parei na cena ${i + 1}. ${e.message}`);
      }
      falhas++; arquivos.push(null);
      const linhas = e.message.split('\n');
      motivos.push(linhas.slice(0, 3).join(' / ').slice(0, 240));
      log(`    SEM IMAGEM na cena ${i + 1}: ${linhas.slice(0, 2).join(' ').slice(0, 260)}`);
    }
  }
  if (falhas / cenas.length > maxFalhaPct) {
    const causa = [...new Set(motivos)].slice(0, 2).join(' || ');
    throw new Error(`Imagens: ${falhas} de ${cenas.length} cenas ficaram sem imagem (limite ${Math.round(maxFalhaPct * 100)}%). Causa: ${causa || 'desconhecida'}. As geradas foram guardadas; "Tentar de novo" completa só as que faltam.`);
  }
  if (rejeitadasOcr) log(`  OCR: ${rejeitadasOcr} imagem(ns) descartada(s) por ter letras e refeita(s).`);
  return { arquivos, falhas, geradas, rejeitadasOcr };
}
