// Geração de IMAGENS por IA para o Short ilustrado, com fallback entre provedores e tempos de espera GENEROSOS
// (o Google pode levar minutos sob demanda alta; abortar cedo só desperdiça a cota).
//
// Cadeia (ordem em IMG_ORDEM, padrão "9router,gemini"; cada etapa só roda se estiver configurada):
//   9router → POST {NINEROUTER_URL}/v1/images/generations   (modelo em NINEROUTER_IMAGE_MODEL)
//   gemini  → generateContent com saída de imagem             (modelos em GEMINI_IMAGE_MODELS; chaves GEMINI_API_KEY / GEMINI_API_KEY_2)
//
// Variáveis (todas opcionais): IMG_TIMEOUT_MS (padrão 300000 = 5 min), IMG_TENTATIVAS (padrão 4),
// IMG_INTERVALO_MS (pausa entre imagens; padrão 7000, respeita ~10 pedidos/min do plano gratuito),
// GEMINI_IMAGE_MODELS (padrão "gemini-2.5-flash-image,gemini-3.1-flash-image-preview").
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = Number(process.env.IMG_TIMEOUT_MS) || 300000;
const TENTATIVAS = Number(process.env.IMG_TENTATIVAS) || 4;
const INTERVALO_MS = process.env.IMG_INTERVALO_MS !== undefined && process.env.IMG_INTERVALO_MS !== '' ? Number(process.env.IMG_INTERVALO_MS) : 7000;
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
    const msg = String(data?.error?.message || JSON.stringify(data?.error || data)).slice(0, 300);
    // O modelo não aceita imageConfig / só IMAGE: ajusta o pedido e tenta de novo na hora.
    if (r.status === 400 && comAspecto && /imageConfig|aspect/i.test(msg)) { comAspecto = false; continue; }
    if (r.status === 400 && modalidades.length === 1 && /modalit/i.test(msg)) { modalidades = ['TEXT', 'IMAGE']; continue; }
    const e = new Error(`Gemini (${modelo}) HTTP ${r.status}: ${msg}`);
    e.cotaDiaria = /exceeded your current quota|quota exceeded|per day/i.test(msg) && !/per minute/i.test(msg);
    e.definitivo = r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404;
    throw e;
  }
  throw new Error(`Gemini (${modelo}): não consegui ajustar o pedido de imagem.`);
}

async function comRetry(nome, fn, log) {
  let ultimo;
  for (let i = 1; i <= TENTATIVAS; i++) {
    try { return await fn(); }
    catch (e) {
      ultimo = e;
      const temporario = !e.definitivo && !e.cotaDiaria && !e.bloqueio && RE_TEMPORARIO.test(e.message);
      if (!temporario || i === TENTATIVAS) break;
      const ms = backoff(i);
      log(`    ${nome}: ${e.message.slice(0, 140)} — nova tentativa em ${Math.round(ms / 1000)}s (${i}/${TENTATIVAS})`);
      await esperar(ms);
    }
  }
  throw ultimo;
}

export function etapasImagem() {
  const ordem = (process.env.IMG_ORDEM || '9router,gemini').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const modelos = (process.env.GEMINI_IMAGE_MODELS || 'gemini-2.5-flash-image,gemini-3.1-flash-image-preview').split(',').map((x) => x.trim()).filter(Boolean);
  const chaves = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
  const etapas = [];
  for (const id of ordem) {
    if (id === '9router' && process.env.NINEROUTER_URL && process.env.NINEROUTER_IMAGE_MODEL) {
      etapas.push({ nome: `9router (${process.env.NINEROUTER_IMAGE_MODEL})`, rodar: (p) => viaNineRouter(p) });
    }
    if (id === 'gemini') {
      chaves.forEach((k, ki) => modelos.forEach((m) => etapas.push({ nome: `Gemini${ki ? ' (2ª chave)' : ''} ${m}`, rodar: (p, asp) => viaGemini(p, { apiKey: k, modelo: m, aspecto: asp }) })));
    }
  }
  return etapas;
}

/** Gera UMA imagem e salva em `destinoSemExt` + extensão. Devolve { arquivo, provedor }. */
export async function gerarImagem({ prompt, destinoSemExt, aspecto = '9:16', log = console.log }) {
  const etapas = etapasImagem();
  if (!etapas.length) throw new Error('Nenhum gerador de imagem configurado (defina GEMINI_API_KEY ou NINEROUTER_URL + NINEROUTER_IMAGE_MODEL).');
  const erros = [];
  for (const et of etapas) {
    try {
      const { bytes, mime } = await comRetry(et.nome, () => et.rodar(prompt, aspecto), log);
      if (!bytes || bytes.length < 2000) throw new Error('imagem vazia ou corrompida');
      const arquivo = `${destinoSemExt}.${extPorMime(mime)}`;
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      fs.writeFileSync(arquivo, bytes);
      return { arquivo, provedor: et.nome };
    } catch (e) { erros.push(`${et.nome}: ${e.message}`); log(`    ${et.nome} falhou: ${e.message.slice(0, 200)}`); }
  }
  throw new Error(`Nenhum provedor gerou a imagem:\n${erros.join('\n')}`);
}

/**
 * Gera a imagem de cada cena (uma por vez, com pausa entre elas). `existentes[i]` (caminho) pula a cena.
 * Devolve { arquivos: [caminho|null], falhas }. Não lança erro por falhas isoladas: a cena fica sem imagem
 * (o vídeo usa um cartão de papel com o texto) — só falha o job se passar de `maxFalhaPct`.
 */
export async function gerarImagensDoRoteiro({ cenas, montarPrompt, dir, existentes = [], aspecto = '9:16', maxFalhaPct = 0.4, log = console.log, aoGerar }) {
  fs.mkdirSync(dir, { recursive: true });
  const arquivos = [];
  let falhas = 0, geradas = 0;
  for (let i = 0; i < cenas.length; i++) {
    const nn = String(i + 1).padStart(2, '0');
    if (existentes[i]) { arquivos.push(existentes[i]); continue; }
    if (geradas > 0 && INTERVALO_MS) await esperar(INTERVALO_MS);
    log(`  Imagem ${i + 1}/${cenas.length}...`);
    try {
      const { arquivo, provedor } = await gerarImagem({ prompt: montarPrompt(cenas[i], i), destinoSemExt: path.join(dir, `img_${nn}`), aspecto, log });
      log(`    ok (${provedor})`);
      arquivos.push(arquivo);
      geradas++;
      if (aoGerar) await aoGerar(i, arquivo);
    } catch (e) {
      falhas++; arquivos.push(null);
      log(`    SEM IMAGEM na cena ${i + 1}: ${e.message.split('\n')[0].slice(0, 200)}`);
    }
  }
  if (falhas / cenas.length > maxFalhaPct) throw new Error(`Imagens: ${falhas} de ${cenas.length} cenas ficaram sem imagem (limite ${Math.round(maxFalhaPct * 100)}%). As geradas foram guardadas; "Tentar de novo" completa só as que faltam.`);
  return { arquivos, falhas, geradas };
}
