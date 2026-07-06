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
  // Extração simples do texto do artigo. Ajuste o seletor se a estrutura do POST_TEMPLATE mudar.
  const match = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const bruto = match ? match[1] : html;
  const texto = bruto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const tituloMatch = html.match(/<title>([^<]+)<\/title>/i);
  return { titulo: tituloMatch ? tituloMatch[1] : postUrl, conteudo: texto.slice(0, 6000) };
}

async function gerarRoteiro(jobId) {
  const job = await getJob(jobId);
  const { titulo, conteudo } = await buscarConteudoDoPost(job.post_url);

  const userPrompt = fillTemplate(prompts.roteiro.userPromptTemplate, {
    titulo,
    url: job.post_url,
    conteudo,
  });

  // O Worker /ai-generate espera o mesmo contrato que o admin usa hoje: provider,
  // apiKey e model vêm do cliente (não ficam guardados no Worker). Por isso os
  // secrets GEMINI_API_KEY e AI_MODEL (opcional) precisam estar configurados aqui também.
  const workerSecret = process.env.WORKER_SECRET;
  const r = await fetch(`${WORKER_URL}/ai-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': workerSecret },
    body: JSON.stringify({
      provider: process.env.AI_PROVIDER || 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.AI_MODEL || undefined,
      systemPrompt: prompts.roteiro.systemPrompt,
      userPrompt,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.text) throw new Error(data.error || `Erro ${r.status} ao chamar o Worker de IA`);
  const { text } = data;

  let roteiro;
  try {
    // Remove possíveis cercas de código, caso o modelo insista em incluir.
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
