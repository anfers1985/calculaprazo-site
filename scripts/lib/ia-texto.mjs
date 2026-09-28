// ════════════════════════════════════════════════════════════════════════
// lib/ia-texto.mjs
// ════════════════════════════════════════════════════════════════════════
// Geração de texto com fallback entre provedores de IA. Reusada pelo
// 02-gerar-roteiro.mjs e pelo 12-gerar-newsletter-semanal.mjs.
//
// Cadeia de fallback, na ordem em que é tentada (cada etapa só roda se a
// respectiva chave existir):
//   1. Gemini, modelo principal (AI_MODEL)                    — chave 1
//   2. Gemini, modelo alternativo (AI_MODEL_FALLBACK) — só se o secret existir — chave 1
//   3. Gemini, modelo principal                               — chave 2
//   4. Gemini, modelo alternativo                             — chave 2
//   5. OpenRouter (OPENROUTER_MODEL)
//   6. NVIDIA NIM (NVIDIA_MODEL)
//
// Por que o modelo alternativo: um 503 "high demand" é capacidade do MODELO
// no Google, não da chave. Trocar de chave mantendo o mesmo modelo não ajuda;
// trocar de modelo sim (pool de capacidade diferente).
// ════════════════════════════════════════════════════════════════════════

const TIMEOUT_GEMINI_MS = 60000;
const TIMEOUT_CHAT_MS = 90000; // modelos "reasoning" gratuitos costumam demorar

const REGEX_ERRO_TEMPORARIO =
  /rate.?limit|429|overload|high demand|unavailable|timeout|gateway|502|503|504|524|try again|resposta vazia/i;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Espera crescente com um pouco de aleatoriedade, pra não bater sempre no
// mesmo instante de pico.
function esperaBackoff(i) {
  return 5000 * (i + 1) + Math.floor(Math.random() * 3000);
}

async function chamarGeminiComRetry({ apiKey, modelo, systemPrompt, userPrompt }, tentativas = 3) {
  const isThinking = /2\.5|3\.\d|thinking/.test(modelo);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      // Gemini 3.x usa thinkingLevel; Gemini 2.5 usa thinkingBudget.
      ...(modelo.startsWith('gemini-3')
        ? { thinkingConfig: { thinkingLevel: 'low' } }
        : isThinking
        ? { thinkingConfig: { thinkingBudget: 0 } }
        : {}),
    },
  };

  for (let i = 1; i <= tentativas; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_GEMINI_MS);

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
      data = {
        error: {
          message: e.name === 'AbortError' ? `Timeout (sem resposta em ${TIMEOUT_GEMINI_MS / 1000}s)` : e.message,
        },
      };
      r = { ok: false, status: 0 };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!r.ok && data?.error) {
      console.error(`Resposta de erro completa do Gemini (${modelo}):`, JSON.stringify(data.error));
    }

    const mensagemErro = data?.error?.message || data?.error || '';
    const cotaExcedida = !r.ok && /exceeded your current quota|quota exceeded/i.test(mensagemErro);
    const valeRetry = !cotaExcedida && !r.ok && REGEX_ERRO_TEMPORARIO.test(`${r.status} ${mensagemErro}`);

    if (r.ok) {
      const texto = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (texto) return { text: texto };
      const motivo = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'desconhecido';
      throw new Error(`Gemini (${modelo}) respondeu sem texto (motivo: ${motivo})`);
    }

    if (cotaExcedida) throw new Error(mensagemErro || 'Cota do Gemini excedida');

    if (valeRetry && i < tentativas) {
      const esperaMs = esperaBackoff(i);
      console.warn(
        `Erro temporário do Gemini (tentativa ${i}/${tentativas}: ${mensagemErro}). Aguardando ${Math.round(esperaMs / 1000)}s...`
      );
      await aguardar(esperaMs);
      continue;
    }

    throw new Error(mensagemErro || `Erro ${r.status} ao chamar o Gemini`);
  }
}

// Chamador genérico pra APIs no formato OpenAI-compatible (chat/completions) —
// usado tanto pelo OpenRouter quanto pela NVIDIA (NIM).
async function chamarChatCompletionComRetry(
  { provedor, url, apiKey, modelo, systemPrompt, userPrompt, headersExtra = {} },
  tentativas = 3
) {
  const body = {
    model: modelo,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    // Modelos "reasoning" gastam parte do limite pensando; 4096 podia acabar
    // antes de sair qualquer JSON (content vazio).
    max_tokens: 8192,
  };

  for (let i = 1; i <= tentativas; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CHAT_MS);

    let r, data;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...headersExtra },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      data = await r.json().catch(() => ({}));
    } catch (e) {
      data = {
        error: {
          message: e.name === 'AbortError' ? `Timeout (sem resposta em ${TIMEOUT_CHAT_MS / 1000}s)` : e.message,
        },
      };
      r = { ok: false, status: 0 };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!r.ok && data?.error) {
      console.error(`Resposta de erro completa do ${provedor}:`, JSON.stringify(data.error));
    }

    // OpenRouter às vezes devolve HTTP 200 com { error: {...} } no corpo.
    let mensagemErro = data?.error?.message || data?.error || '';
    if (typeof mensagemErro !== 'string') mensagemErro = JSON.stringify(mensagemErro);

    // 401/402 = chave inválida, modelo pago ou créditos insuficientes — não adianta tentar de novo.
    const configuracaoInvalida = !r.ok && (r.status === 401 || r.status === 402);

    if (r.ok && !mensagemErro) {
      const texto = data.choices?.[0]?.message?.content || '';
      if (texto.trim()) return { text: texto };

      // HTTP 200 sem conteúdo: registra o motivo pra dar pra diagnosticar no log.
      const finish = data.choices?.[0]?.finish_reason || 'desconhecido';
      const temRaciocinio = Boolean(
        data.choices?.[0]?.message?.reasoning || data.choices?.[0]?.message?.reasoning_content
      );
      console.error(
        `${provedor}: HTTP 200 mas sem texto (finish_reason=${finish}, só_raciocínio=${temRaciocinio}). Corpo: ${JSON.stringify(data).slice(0, 500)}`
      );
      mensagemErro = `resposta vazia (finish_reason=${finish})`;
    }

    const valeRetry =
      !configuracaoInvalida && REGEX_ERRO_TEMPORARIO.test(`${r.ok ? '' : r.status} ${mensagemErro}`);

    if (configuracaoInvalida) {
      throw new Error(mensagemErro || `${provedor}: chave inválida, modelo pago ou créditos insuficientes (HTTP ${r.status})`);
    }

    if (valeRetry && i < tentativas) {
      const esperaMs = esperaBackoff(i);
      console.warn(
        `Erro temporário do ${provedor} (tentativa ${i}/${tentativas}: ${mensagemErro}). Aguardando ${Math.round(esperaMs / 1000)}s...`
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
    headersExtra: { 'HTTP-Referer': 'https://calculaprazo.com.br', 'X-Title': 'Calcula Prazo' },
  });

const chamarNvidiaComRetry = ({ apiKey, modelo, systemPrompt, userPrompt }) =>
  chamarChatCompletionComRetry({
    provedor: 'NVIDIA',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    apiKey,
    modelo,
    systemPrompt,
    userPrompt,
  });

/**
 * Gera texto a partir de um prompt, tentando os provedores configurados em
 * ordem até um funcionar. `logPrefix` é só cosmético (aparece no log,
 * ex: "roteiro", "análise semanal").
 */
export async function gerarTextoComFallback({ systemPrompt, userPrompt, logPrefix = 'texto' }) {
  const modeloGemini = process.env.AI_MODEL || 'gemini-3.5-flash-lite';
  // Modelo Gemini alternativo: OPCIONAL. Na chave gratuita só o Flash-Lite tem cota folgada,
  // então por padrão não há alternativo (a etapa é ignorada se o secret não existir).
  const modeloGeminiAlt = process.env.AI_MODEL_FALLBACK || '';
  const modeloOpenRouter = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free';
  const modeloNvidia = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';

  const gemini = (apiKey, modelo) => chamarGeminiComRetry({ apiKey, modelo, systemPrompt, userPrompt });

  const etapas = [
    {
      nome: `Gemini (${modeloGemini})`,
      apiKey: process.env.GEMINI_API_KEY,
      chamar: (k) => gemini(k, modeloGemini),
    },
    {
      nome: `Gemini (${modeloGeminiAlt})`,
      apiKey: modeloGeminiAlt ? process.env.GEMINI_API_KEY : '',
      silenciosa: !modeloGeminiAlt,
      chamar: (k) => gemini(k, modeloGeminiAlt),
    },
    {
      nome: `Gemini, 2ª chave (${modeloGemini})`,
      apiKey: process.env.GEMINI_API_KEY_2,
      chamar: (k) => gemini(k, modeloGemini),
    },
    {
      nome: `Gemini, 2ª chave (${modeloGeminiAlt})`,
      apiKey: modeloGeminiAlt ? process.env.GEMINI_API_KEY_2 : '',
      silenciosa: !modeloGeminiAlt,
      chamar: (k) => gemini(k, modeloGeminiAlt),
    },
    {
      nome: `OpenRouter (${modeloOpenRouter})`,
      apiKey: process.env.OPENROUTER_API_KEY,
      chamar: (k) =>
        chamarOpenRouterComRetry({ apiKey: k, modelo: modeloOpenRouter, systemPrompt, userPrompt }),
    },
    {
      nome: `NVIDIA (${modeloNvidia})`,
      apiKey: process.env.NVIDIA_API_KEY,
      chamar: (k) => chamarNvidiaComRetry({ apiKey: k, modelo: modeloNvidia, systemPrompt, userPrompt }),
    },
  ];

  const erros = [];
  const nomesVistos = new Set();
  // Picos de 503 costumam passar em 1-2 minutos: se TODOS falharem, espera e repete a cadeia.
  const rodadas = Number(process.env.IA_RODADAS) || 2;
  const esperaEntreRodadasMs = 60000;

  for (let rodada = 1; rodada <= rodadas; rodada++) {
    if (rodada > 1) {
      console.warn(`Todos os provedores falharam. Aguardando ${esperaEntreRodadasMs / 1000}s e tentando de novo (rodada ${rodada}/${rodadas})...`);
      await aguardar(esperaEntreRodadasMs);
    }

    for (const etapa of etapas) {
      if (nomesVistos.has(etapa.nome) && rodada === 1) continue; // ex.: AI_MODEL_FALLBACK igual ao AI_MODEL
      nomesVistos.add(etapa.nome);

      if (!etapa.apiKey) {
        if (rodada === 1 && !etapa.silenciosa) console.warn(`${etapa.nome}: chave não configurada, pulando.`);
        continue;
      }

      console.log(`Gerando ${logPrefix} com: ${etapa.nome}...`);

      try {
        const { text } = await etapa.chamar(etapa.apiKey);
        if (erros.length > 0) console.log(`${logPrefix} gerado via fallback: ${etapa.nome}.`);
        return { text, modeloUsado: etapa.nome };
      } catch (erro) {
        console.warn(`${etapa.nome} falhou: ${erro.message}`);
        erros.push(`[rodada ${rodada}] ${etapa.nome}: ${erro.message}`);
      }
    }
  }

  throw new Error(
    erros.length > 0
      ? `Todos os provedores de IA falharam:\n${erros.join('\n')}`
      : 'Nenhuma chave de API de IA configurada (GEMINI_API_KEY / OPENROUTER_API_KEY / NVIDIA_API_KEY).'
  );
}
