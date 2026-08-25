import fs from 'node:fs';
import { getJob, updateJob, marcarErro } from './lib/supabase.mjs';

const prompts = JSON.parse(fs.readFileSync(new URL('../config/prompts.json', import.meta.url)));

function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function buscarConteudoDoPost(postUrl) {
  const res = await fetch(postUrl);
  if (!res.ok) throw new Error(`Não consegui abrir o post: ${postUrl} (${res.status})`);
  const html = await res.text();
  const match = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const bruto = match ? match[1] : html;
  const texto = bruto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const tituloMatch = html.match(/<title>([^<]+)<\/title>/i);
  return { titulo: tituloMatch ? tituloMatch[1] : postUrl, conteudo: texto.slice(0, 6000) };
}

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Chamada direta ao Gemini — igual ao padrão já validado em produção no motor-cct
// (src/services/ai/chamada.js), que nunca falha: mesmo endpoint, mesmo
// generationConfig (temperature 0.1, maxOutputTokens) e, principalmente, o mesmo
// thinkingConfig: { thinkingBudget: 0 } para modelos "thinking" (2.5+) — sem isso
// o modelo gasta tempo "pensando" antes de responder, o que bate direto nos
// timeouts de gateway (524) que vínhamos vendo. Substitui a chamada anterior via
// Worker (Cloudflare) — cortar esse intermediário remove um ponto de falha extra
// (o próprio gateway do Worker podia estourar 524 independente do Gemini).
async function chamarGeminiComRetry({ apiKey, modelo, systemPrompt, userPrompt }, tentativas = 4) {
  const isThinking = modelo.includes('2.5') || modelo.includes('thinking');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      ...(isThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };

  for (let i = 1; i <= tentativas; i++) {
    const controller = new AbortController();
    // Timeout próprio de 25s: sem thinking, uma resposta normal do Gemini Flash
    // é rápida — se passar disso, algo está errado e vale desistir e tentar de novo.
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let r, data;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      data = await r.json().catch(() => ({}));
    } catch (e) {
      data = { error: { message: e.name === 'AbortError' ? 'Timeout (sem resposta em 25s)' : e.message } };
      r = { ok: false, status: 0 };
    } finally {
      clearTimeout(timeoutId);
    }

    const mensagemErro = data?.error?.message || data?.error || '';
    // "Cota excedida" (limite diário/por-minuto do tier gratuito) não se resolve
    // esperando alguns segundos — insistir só desperdiça minutos do Actions.
    // Falha na hora e deixa pro job ser retomado depois (ou pro problema de conta
    // ser resolvido, ex: upgrade de plano).
    const cota_excedida = !r.ok && /exceeded your current quota|quota exceeded/i.test(mensagemErro);
    // Instabilidade genuína (sobrecarga momentânea, timeout de gateway) — aí sim
    // vale tentar de novo com um espaçamento curto.
    const vale_retry = !cota_excedida && !r.ok && /rate.?limit|429|overload|high demand|unavailable|timeout|gateway|502|503|504|524|try again/i.test(mensagemErro);

    if (r.ok) {
      const texto = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (texto) return { text: texto };
    }
    if (cota_excedida) {
      throw new Error(mensagemErro || 'Cota do Gemini excedida');
    }
    if (vale_retry && i < tentativas) {
      // Backoff curto (10s, 15s, 20s): se for uma indisponibilidade persistente
      // (não uma sobrecarga passageira), o objetivo aqui é falhar rápido e deixar
      // o job ser retomado depois, não segurar o runner por minutos a fio tentando.
      const esperaMs = 5000 * (i + 1);
      console.warn(`Erro temporário do Gemini (tentativa ${i}/${tentativas}: ${mensagemErro}). Aguardando ${esperaMs / 1000}s...`);
      await aguardar(esperaMs);
      continue;
    }
    throw new Error(mensagemErro || `Erro ${r.status} ao chamar o Gemini`);
  }
}

async function gerarRoteiro(jobId) {
  const job = await getJob(jobId);

  // Idempotente: permite chamar este script logo no início do workflow, antes de
  // instalar Chromium/ffmpeg/Remotion, sem risco de gerar roteiro em duplicidade
  // pra um job que já passou dessa etapa (ex: retry que já tinha roteiro_ok).
  if (job.roteiro) {
    console.log(`Job ${jobId} já tem roteiro gerado. Pulando.`);
    return;
  }

  const { titulo, conteudo } = await buscarConteudoDoPost(job.post_url);

  const userPrompt = fillTemplate(prompts.roteiro.userPromptTemplate, {
    titulo,
    url: job.post_url,
    conteudo,
  });

  const data = await chamarGeminiComRetry({
    apiKey: process.env.GEMINI_API_KEY,
    modelo: process.env.AI_MODEL || 'gemini-2.5-flash',
    systemPrompt: prompts.roteiro.systemPrompt,
    userPrompt,
  });
  const { text } = data;

  let roteiro;
  try {
    const limpo = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
    roteiro = JSON.parse(limpo);
  } catch (e) {
    throw new Error(`Resposta da IA não é um JSON válido: ${e.message}\n\nResposta bruta:\n${text}`);
  }

  if (!Array.isArray(roteiro.cenas) || roteiro.cenas.length === 0) {
    throw new Error('Roteiro gerado não tem cenas.');
  }

  await updateJob(jobId, { roteiro, status: 'roteiro_ok' });
  console.log(`Roteiro gerado para job ${jobId}: ${roteiro.cenas.length} cenas.`);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Uso: node 02-gerar-roteiro.mjs <job_id>');
  process.exit(1);
}

gerarRoteiro(jobId).catch(async err => {
  console.error(err);
  await marcarErro(jobId, 'roteiro', err.message);
  process.exit(1);
});
