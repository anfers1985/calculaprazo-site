import fs from 'node:fs';
import { getJob, updateJob, marcarErro } from './lib/supabase.mjs';
import { gerarTextoComFallback } from './lib/ia-texto.mjs';

const prompts = JSON.parse(
  fs.readFileSync(new URL('../config/prompts.json', import.meta.url))
);

function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function buscarConteudoDoPost(postUrl) {
  const res = await fetch(postUrl);
  if (!res.ok) {
    throw new Error(`Não consegui abrir o post: ${postUrl} (${res.status})`);
  }

  const html = await res.text();
  const match = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const bruto = match ? match[1] : html;

  const texto = bruto
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tituloMatch = html.match(/<title>([^<]+)<\/title>/i);

  return {
    titulo: tituloMatch ? tituloMatch[1] : postUrl,
    conteudo: texto.slice(0, 6000)
  };
}

// A cadeia de provedores (Gemini -> modelo alternativo -> 2ª chave -> OpenRouter -> NVIDIA)
// vive em lib/ia-texto.mjs, compartilhada com o gerador da newsletter.
function gerarRoteiroTexto({ systemPrompt, userPrompt }) {
  return gerarTextoComFallback({ systemPrompt, userPrompt, logPrefix: 'roteiro' });
}

async function gerarRoteiro(jobId) {
  const job = await getJob(jobId);

  if (job.roteiro) {
    console.log(`Job ${jobId} já tem roteiro gerado. Pulando.`);
    return;
  }

  const { titulo, conteudo } = await buscarConteudoDoPost(job.post_url);

  const userPrompt = fillTemplate(
    prompts.roteiro.userPromptTemplate,
    {
      titulo,
      url: job.post_url,
      conteudo
    }
  );

  const { text } = await gerarRoteiroTexto({
    systemPrompt: prompts.roteiro.systemPrompt,
    userPrompt
  });

  let roteiro;

  try {
    const limpo = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '');

    roteiro = JSON.parse(limpo);
  } catch (e) {
    throw new Error(
      `Resposta da IA não é um JSON válido: ${e.message}\n\nResposta bruta:\n${text}`
    );
  }

  if (!Array.isArray(roteiro.cenas) || roteiro.cenas.length === 0) {
    throw new Error('Roteiro gerado não tem cenas.');
  }

  await updateJob(jobId, {
    roteiro,
    status: 'roteiro_ok'
  });

  console.log(
    `Roteiro gerado para job ${jobId}: ${roteiro.cenas.length} cenas.`
  );
}

const jobId = process.argv[2];

if (!jobId) {
  console.error(
    'Uso: node 02-gerar-roteiro.mjs <job_id>'
  );
  process.exit(1);
}

gerarRoteiro(jobId).catch(async err => {
  console.error(err);
  await marcarErro(jobId, 'roteiro', err.message);
  process.exit(1);
});