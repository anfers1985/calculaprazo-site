import fs from 'node:fs';
import { getJob, updateJob, marcarErro } from './lib/supabase.mjs';

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

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function chamarGeminiComRetry(
  { apiKey, modelo, systemPrompt, userPrompt },
  tentativas = 4
) {
  const isThinking = /2\.5|3\.\d|thinking/.test(modelo);

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      maxOutputTokens: 4096,

      // Gemini 3.x usa thinkingLevel
      // Gemini 2.5 usa thinkingBudget
      ...(modelo.startsWith('gemini-3')
        ? {
            thinkingConfig: {
              thinkingLevel: 'low'
            }
          }
        : isThinking
        ? {
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        : {})
    }
  };

  for (let i = 1; i <= tentativas; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let r, data;

    try {
      r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      data = await r.json().catch(() => ({}));
    } catch (e) {
      data = {
        error: {
          message:
            e.name === 'AbortError'
              ? 'Timeout (sem resposta em 25s)'
              : e.message
        }
      };
      r = { ok: false, status: 0 };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!r.ok && data?.error) {
      console.error(
        'Resposta de erro completa do Gemini:',
        JSON.stringify(data.error)
      );
    }

    const mensagemErro = data?.error?.message || data?.error || '';

    const cotaExcedida =
      !r.ok &&
      /exceeded your current quota|quota exceeded/i.test(mensagemErro);

    const valeRetry =
      !cotaExcedida &&
      !r.ok &&
      /rate.?limit|429|overload|high demand|unavailable|timeout|gateway|502|503|504|524|try again/i.test(
        mensagemErro
      );

    if (r.ok) {
      const texto =
        data.candidates?.[0]?.content?.parts
          ?.map(p => p.text || '')
          .join('') || '';

      if (texto) {
        return { text: texto };
      }
    }

    if (cotaExcedida) {
      throw new Error(mensagemErro || 'Cota do Gemini excedida');
    }

    if (valeRetry && i < tentativas) {
      const esperaMs = 5000 * (i + 1);

      console.warn(
        `Erro temporário do Gemini (tentativa ${i}/${tentativas}: ${mensagemErro}). Aguardando ${
          esperaMs / 1000
        }s...`
      );

      await aguardar(esperaMs);
      continue;
    }

    throw new Error(mensagemErro || `Erro ${r.status} ao chamar o Gemini`);
  }
}

// Chamador genérico pra APIs no formato OpenAI-compatible (chat/completions) —
// usado tanto pelo OpenRouter quanto pela NVIDIA (NIM), que seguem o mesmo formato
// de request/response. `provedor` é só pra mensagens de log/erro mais claras.
async function chamarChatCompletionComRetry(
  { provedor, url, apiKey, modelo, systemPrompt, userPrompt, headersExtra = {} },
  tentativas = 3
) {
  const body = {
    model: modelo,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 4096
  };

  for (let i = 1; i <= tentativas; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let r, data;

    try {
      r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...headersExtra
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      data = await r.json().catch(() => ({}));
    } catch (e) {
      data = {
        error: {
          message:
            e.name === 'AbortError'
              ? 'Timeout (sem resposta em 25s)'
              : e.message
        }
      };
      r = { ok: false, status: 0 };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!r.ok && data?.error) {
      console.error(
        `Resposta de erro completa do ${provedor}:`,
        JSON.stringify(data.error)
      );
    }

    const mensagemErro = data?.error?.message || data?.error || '';

    // 401/402 = chave inválida, modelo pago ou créditos insuficientes — não adianta tentar de novo.
    const configuracaoInvalida = !r.ok && (r.status === 401 || r.status === 402);

    const valeRetry =
      !configuracaoInvalida &&
      !r.ok &&
      /rate.?limit|429|overload|high demand|unavailable|timeout|gateway|502|503|504|524|try again/i.test(
        `${r.status} ${mensagemErro}`
      );

    if (r.ok) {
      const texto = data.choices?.[0]?.message?.content || '';
      if (texto) {
        return { text: texto };
      }
    }

    if (configuracaoInvalida) {
      throw new Error(
        mensagemErro ||
          `${provedor}: chave inválida, modelo pago ou créditos insuficientes (HTTP ${r.status})`
      );
    }

    if (valeRetry && i < tentativas) {
      const esperaMs = 5000 * (i + 1);

      console.warn(
        `Erro temporário do ${provedor} (tentativa ${i}/${tentativas}: ${mensagemErro}). Aguardando ${
          esperaMs / 1000
        }s...`
      );

      await aguardar(esperaMs);
      continue;
    }

    throw new Error(mensagemErro || `Erro ${r.status} ao chamar o ${provedor}`);
  }
}

const chamarOpenRouterComRetry = ({ apiKey, modelo, systemPrompt, userPrompt }) =>
  chamarChatCompletionComRetry({
    provedor: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    modelo,
    systemPrompt,
    userPrompt,
    headersExtra: {
      'HTTP-Referer': 'https://calculaprazo.com.br',
      'X-Title': 'Calcula Prazo - Video Pipeline'
    }
  });

const chamarNvidiaComRetry = ({ apiKey, modelo, systemPrompt, userPrompt }) =>
  chamarChatCompletionComRetry({
    provedor: 'NVIDIA',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    apiKey,
    modelo,
    systemPrompt,
    userPrompt
  });

// Cadeia de fallback, na ordem em que é tentada:
//   1. Gemini (GEMINI_API_KEY / AI_MODEL) — provedor principal.
//   2. Gemini com uma segunda chave (GEMINI_API_KEY_2), se configurada — mesma
//      cota diária do free tier, só que numa chave/projeto separado, então dobra
//      o limite antes de precisar trocar de provedor.
//   3. OpenRouter, modelo gratuito (OPENROUTER_API_KEY / OPENROUTER_MODEL).
//   4. NVIDIA NIM, modelo gratuito (NVIDIA_API_KEY / NVIDIA_MODEL).
// Cada etapa só roda se a respectiva *_API_KEY estiver configurada; o que não
// tiver chave é pulado silenciosamente (com um aviso no log). Só lança erro se
// TODAS as etapas configuradas falharem.
async function gerarRoteiroTexto({ systemPrompt, userPrompt }) {
  const modeloGemini = process.env.AI_MODEL || 'gemini-3.6-flash';

  const etapas = [
    {
      nome: `Gemini (${modeloGemini})`,
      apiKey: process.env.GEMINI_API_KEY,
      chamar: apiKey =>
        chamarGeminiComRetry({ apiKey, modelo: modeloGemini, systemPrompt, userPrompt })
    },
    {
      nome: `Gemini, 2ª chave (${modeloGemini})`,
      apiKey: process.env.GEMINI_API_KEY_2,
      chamar: apiKey =>
        chamarGeminiComRetry({ apiKey, modelo: modeloGemini, systemPrompt, userPrompt })
    },
    {
      nome: `OpenRouter (${process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free'})`,
      apiKey: process.env.OPENROUTER_API_KEY,
      chamar: apiKey =>
        chamarOpenRouterComRetry({
          apiKey,
          modelo: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free',
          systemPrompt,
          userPrompt
        })
    },
    {
      nome: `NVIDIA (${process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b'})`,
      apiKey: process.env.NVIDIA_API_KEY,
      chamar: apiKey =>
        chamarNvidiaComRetry({
          apiKey,
          modelo: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
          systemPrompt,
          userPrompt
        })
    }
  ];

  const erros = [];

  for (const etapa of etapas) {
    if (!etapa.apiKey) {
      console.warn(`${etapa.nome}: chave não configurada, pulando.`);
      continue;
    }

    console.log(`Gerando roteiro com: ${etapa.nome}...`);

    try {
      const { text } = await etapa.chamar(etapa.apiKey);
      if (erros.length > 0) {
        console.log(`Roteiro gerado via fallback: ${etapa.nome}.`);
      }
      return { text, modeloUsado: etapa.nome };
    } catch (erro) {
      console.warn(`${etapa.nome} falhou: ${erro.message}`);
      erros.push(`${etapa.nome}: ${erro.message}`);
    }
  }

  throw new Error(
    erros.length > 0
      ? `Todos os provedores de IA falharam:\n${erros.join('\n')}`
      : 'Nenhuma chave de API de IA configurada (GEMINI_API_KEY / OPENROUTER_API_KEY / NVIDIA_API_KEY).'
  );
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