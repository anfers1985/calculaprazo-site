import fs from 'node:fs';
import { getJob, updateJob, marcarErro } from './lib/supabase.mjs';

const WORKER_URL = 'https://calculaprazo-views-api.andersonfernand3s.workers.dev';
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

async function chamarWorkerComRetry(body, workerSecret, tentativas = 8) {
  for (let i = 1; i <= tentativas; i++) {
    const r = await fetch(`${WORKER_URL}/ai-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': workerSecret },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    const vale_retry = !r.ok && /quota|rate.?limit|429|overload|high demand|unavailable|503|try again/i.test(data.error || '');
    if (r.ok && data.text) return data;
    if (vale_retry && i < tentativas) {
      // Backoff crescente (30s, 45s, 60s...): picos de sobrecarga do Gemini costumam
      // durar poucos minutos. Isso é seguro de esperar porque essa etapa roda ANTES
      // das instalações pesadas (Chromium/ffmpeg/Remotion) — uma falha aqui não
      // desperdiça esse tempo de setup, só o tempo de espera em si.
      const esperaMs = 15000 * (i + 1);
      console.warn(`Erro temporário do Gemini (tentativa ${i}/${tentativas}). Aguardando ${esperaMs / 1000}s...`);
      await aguardar(esperaMs);
      continue;
    }
    throw new Error(data.error || `Erro ${r.status} ao chamar o Worker de IA`);
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

  const workerSecret = process.env.WORKER_SECRET;
  const data = await chamarWorkerComRetry(
    {
      provider: process.env.AI_PROVIDER || 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.AI_MODEL || undefined,
      systemPrompt: prompts.roteiro.systemPrompt,
      userPrompt,
    },
    workerSecret
  );
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
