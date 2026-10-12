import fs from 'node:fs';
import { supabase, getJob, updateJob, marcarErro } from './lib/supabase.mjs';
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


// ───────── Validação do roteiro (rede de segurança contra repetição e fala mal formatada) ─────────
function normalizarComparacao(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function similaridade(a, b) {
  const A = new Set(normalizarComparacao(a).split(' ').filter(w => w.length > 3));
  const B = new Set(normalizarComparacao(b).split(' ').filter(w => w.length > 3));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size); // contenção: pega frase curta "dentro" de outra maior
}

function validarRoteiro(r) {
  const problemas = [];
  const cenas = r.cenas;
  if (cenas.length < 4 || cenas.length > 9) problemas.push(`número de cenas fora do esperado (${cenas.length})`);

  cenas.forEach((c, i) => {
    if (/\d|R\$|%/.test(c.narracao || '')) problemas.push(`cena ${i + 1}: narração com dígito/R$/% — escreva por extenso`);
    if (similaridade(c.texto_tela, c.narracao) >= 0.7) problemas.push(`cena ${i + 1}: texto_tela repete a narração`);
    for (let j = 0; j < i; j++) {
      if (similaridade(cenas[j].narracao, c.narracao) >= 0.6) problemas.push(`cena ${i + 1} repete a ideia da cena ${j + 1}`);
      if (normalizarComparacao(cenas[j].prompt_imagem) === normalizarComparacao(c.prompt_imagem))
        problemas.push(`cena ${i + 1} usa o mesmo termo de imagem da cena ${j + 1}`);
    }
    if (/\b(dollar|money|cash|currency|flag|sign)\b|dinheiro|nota de|bandeira|placa/i.test(`${c.prompt_imagem} ${c.prompt_imagem_alternativo}`))
      problemas.push(`cena ${i + 1}: termo de imagem proibido (dinheiro/bandeira/placa)`);
  });

  const CLICHE = /balan[cç]a|martelo|juiz|tribunal|f[oó]rum|livros? jur|estante/i;
  const cenasCliche = cenas.filter(c => CLICHE.test(c.prompt_imagem || '')).length;
  if (cenasCliche > 2) problemas.push(`${cenasCliche} cenas usam imagem de balança/martelo/tribunal/livros — use no máximo 2 e varie o resto (pessoas trabalhando, ambientes de trabalho, objetos do dia a dia)`);

  // Neutralidade: o canal é informativo e imparcial. Reprova fala dirigida a um dos lados
  // ("você", "seu contrato"), termos carregados ("patrão", "chefe") e adjetivos de julgamento.
  // Vale para narração E texto_tela, porque os dois aparecem no vídeo.
  const NAO_NEUTRO = /(?<![\p{L}])(voc[êe]s?|seus?|suas?|teu|tua|patr[ãa]o|patr[õo]es|chefe|abusiv[oa]s?|injust[oa]s?|absurd[oa]s?|vergonhos[oa]s?|explora[çc][ãa]o)(?![\p{L}])/iu;
  cenas.forEach((c, i) => {
    const ehUltima = i === cenas.length - 1;
    const alvo = ehUltima ? `${c.texto_tela || ''}` : `${c.narracao || ''} ${c.texto_tela || ''}`;
    const achou = alvo.match(NAO_NEUTRO);
    if (achou) problemas.push(`cena ${i + 1}: linguagem não neutra ("${achou[0]}") — narre em terceira pessoa (o empregado / o empregador), sem "você", "seu", "patrão" ou adjetivos de julgamento`);
  });
  if (/^\s*voc[êe]\s+sabia/i.test(cenas[0]?.narracao || ''))
    problemas.push('cena 1: o gancho não pode começar com "Você sabia" — faça uma pergunta neutra sobre o tema');

  const gancho = cenas[0]?.narracao || '';
  if (!gancho.includes('?')) problemas.push('a cena 1 (gancho) precisa terminar com pergunta');
  return problemas;
}

function removerCenasRepetidas(r) {
  // Último recurso: se, após as tentativas, ainda sobrar cena repetida, descarta a repetida
  // (nunca a 1ª nem a última, que é o CTA) em vez de publicar vídeo repetitivo.
  const mantidas = [];
  r.cenas.forEach((c, i) => {
    const ehExtremo = i === 0 || i === r.cenas.length - 1;
    const repete = mantidas.some(m => similaridade(m.narracao, c.narracao) >= 0.6);
    if (ehExtremo || !repete) mantidas.push(c);
  });
  r.cenas = mantidas;
  return r;
}

function parsearRoteiro(text) {
  const limpo = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
  const r = JSON.parse(limpo);
  if (!Array.isArray(r.cenas) || r.cenas.length === 0) throw new Error('Roteiro gerado não tem cenas.');
  return r;
}


// Termos de imagem usados nos vídeos mais recentes. Vão pro prompt como lista de "proibidos
// da vez": é isso que força a IA a variar o TEMA visual entre vídeos seguidos (o hash
// perceptual só barra a mesma foto; não impede 10 fotos diferentes da mesma balança).
async function termosDeImagemRecentes(jobIdAtual, limiteVideos = 12) {
  try {
    const { data, error } = await supabase.from('video_jobs').select('id, roteiro')
      .not('roteiro', 'is', null).neq('id', jobIdAtual)
      .order('criado_em', { ascending: false }).limit(limiteVideos);
    if (error) throw error;
    const contagem = {};
    for (const j of data || []) {
      for (const c of j.roteiro?.cenas || []) {
        for (const t of [c.prompt_imagem, c.prompt_imagem_alternativo]) {
          const k = String(t || '').trim().toLowerCase();
          if (k) contagem[k] = (contagem[k] || 0) + 1;
        }
      }
    }
    return Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t);
  } catch (e) {
    console.warn(`  (não consegui ler termos recentes: ${String(e.message || e).slice(0, 100)})`);
    return [];
  }
}

async function gerarRoteiro(jobId) {
  const job = await getJob(jobId);

  if (job.roteiro) {
    console.log(`Job ${jobId} já tem roteiro gerado. Pulando.`);
    return;
  }

  const { titulo, conteudo } = await buscarConteudoDoPost(job.post_url);

  const recentes = await termosDeImagemRecentes(jobId);
  const blocoRecentes = recentes.length
    ? `\n\nTERMOS DE IMAGEM JÁ USADOS NOS ÚLTIMOS VÍDEOS (NÃO use nenhum deles nem sinônimos próximos; escolha outro assunto visual):\n${recentes.join(' | ')}`
    : '';

  const userPrompt = fillTemplate(
    prompts.roteiro.userPromptTemplate,
    {
      titulo,
      url: job.post_url,
      conteudo
    }
  );

  // Gera → valida → se houver repetição/erro de formato, pede de novo (até 3 tentativas)
  // dizendo exatamente o que corrigir. Na última tentativa, remove cenas repetidas à força.
  const MAX_TENTATIVAS_ROTEIRO = 3;
  let roteiro;
  let feedback = '';
  for (let t = 1; t <= MAX_TENTATIVAS_ROTEIRO; t++) {
    const { text } = await gerarRoteiroTexto({
      systemPrompt: prompts.roteiro.systemPrompt,
      userPrompt: userPrompt + blocoRecentes + feedback
    });

    try {
      roteiro = parsearRoteiro(text);
    } catch (e) {
      if (t === MAX_TENTATIVAS_ROTEIRO) {
        throw new Error(`Resposta da IA não é um JSON válido: ${e.message}\n\nResposta bruta:\n${text}`);
      }
      feedback = '\n\nATENÇÃO: sua resposta anterior não era um JSON válido. Responda somente o JSON.';
      continue;
    }

    const problemas = validarRoteiro(roteiro);
    if (problemas.length === 0) break;

    console.warn(`Roteiro reprovado na validação (tentativa ${t}/${MAX_TENTATIVAS_ROTEIRO}):\n - ${problemas.join('\n - ')}`);
    if (t === MAX_TENTATIVAS_ROTEIRO) {
      roteiro = removerCenasRepetidas(roteiro);
      console.warn('Seguindo com o melhor roteiro disponível (cenas repetidas removidas).');
      break;
    }
    feedback = `\n\nATENÇÃO: o roteiro anterior foi REPROVADO pelos seguintes motivos. Gere um roteiro novo corrigindo todos:\n- ${problemas.join('\n- ')}`;
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