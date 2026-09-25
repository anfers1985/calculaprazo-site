// ════════════════════════════════════════════════════════════════════════
// 12-gerar-newsletter-semanal.mjs
// ════════════════════════════════════════════════════════════════════════
// Toda sexta de manhã, monta automaticamente um RASCUNHO de campanha da
// newsletter em `newsletter_campaigns` (Supabase), pronto pra você só
// revisar e clicar em enviar:
//   • Análise da semana gerada por IA (estruturada, um bloco por tema) a
//     partir dos artigos selecionados — não é texto fixo repetido.
//   • 1 artigo em destaque + 6 "mais lidos", escolhidos entre os posts
//     publicados nos últimos 7 dias, ranqueados pela API real de views
//     (calculaprazo-views-api).
//   • 2 ferramentas (calculadoras), giradas a cada semana a partir de
//     `supabase/functions/_shared/calculators-list.ts` (fonte única).
//
// Fica como RASCUNHO ('draft') de propósito — este script nunca envia
// e-mail sozinho. Você decide quando agendar ou mandar "Enviar agora" no
// painel admin (Newsletter → Campanhas).
//
// Variáveis de ambiente:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY        — obrigatórias
//   GEMINI_API_KEY (+ _2), OPENROUTER_API_KEY, NVIDIA_API_KEY
//                                               — pelo menos uma, pra gerar a análise
//   NEWSLETTER_DIAS_JANELA                     — opcional, padrão 7
//   NEWSLETTER_QTD_FERRAMENTAS                  — opcional, padrão 2
// ════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './lib/supabase.mjs';
import { gerarTextoComFallback } from './lib/ia-texto.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');

const VIEWS_API = 'https://calculaprazo-views-api.andersonfernand3s.workers.dev';
const DIAS_JANELA = Number(process.env.NEWSLETTER_DIAS_JANELA || 7);
const QTD_MAIS_LIDOS = 6; // além do destaque → total de 7 artigos
const QTD_FERRAMENTAS = Math.max(2, Number(process.env.NEWSLETTER_QTD_FERRAMENTAS || 2));

// Segunda-feira de referência só pra girar a lista de ferramentas de forma
// determinística (sem precisar guardar estado em arquivo). Não precisa ser
// exata nem mexer nela depois.
const ANCORA_MS = Date.UTC(2026, 0, 5);
const DIA_MS = 24 * 60 * 60 * 1000;

function hojeUTC() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function formatarDataPtBR(ms) {
  return new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function carregarPosts() {
  const p = path.join(RAIZ, 'data', 'posts.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

async function buscarViews() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`${VIEWS_API}/top/50`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const mapa = new Map();
    for (const item of data.top || []) {
      const slug = typeof item === 'string' ? item : item.slug;
      const views = typeof item === 'string' ? 0 : item.views || 0;
      if (slug) mapa.set(slug, views);
    }
    return mapa;
  } catch (err) {
    console.warn(`Aviso: não consegui buscar o ranking de views (${err.message}). Seguindo só por data.`);
    return new Map();
  }
}

function carregarCalculadoras() {
  const p = path.join(RAIZ, 'supabase', 'functions', '_shared', 'calculators-list.ts');
  const raw = fs.readFileSync(p, 'utf-8');
  const slugs = [...raw.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);
  if (!slugs.length) throw new Error('Não encontrei nenhuma calculadora em calculators-list.ts');
  return slugs;
}

function escolherFerramentas(slugs) {
  const semana = Math.floor((hojeUTC() - ANCORA_MS) / (7 * DIA_MS));
  const inicio = mod(semana * QTD_FERRAMENTAS, slugs.length);
  const escolhidas = [];
  for (let i = 0; i < QTD_FERRAMENTAS; i++) escolhidas.push(slugs[mod(inicio + i, slugs.length)]);
  return escolhidas;
}

// ─── Gera a análise da semana via IA, estruturada por tema ────────────────
async function gerarAnaliseSemana(selecionados, inicioTxt, hojeTxt) {
  const systemPrompt =
    `Você escreve a análise semanal de uma newsletter do Calcula Prazo, site brasileiro de ` +
    `calculadoras jurídicas e conteúdo de Direito do Trabalho. Público: advogados, RH, contadores ` +
    `e trabalhadores — gente que quer entender o que mudou e o que fazer com isso, não um resumo ` +
    `de manchetes. Escreva em português do Brasil, tom direto e analítico.\n\n` +
    `Os artigos da semana podem ser de tipos diferentes — decisões judiciais, mudanças de entendimento, ` +
    `explicações sobre enquadramento sindical, temas repetitivos, etc. NÃO assuma que todos são ` +
    `"decisões"; refira-se a cada um pelo que ele de fato é (decisão, tema fixado, mudança de entendimento, ` +
    `orientação sobre X etc.), e use um termo genérico ("os artigos", "o conteúdo da semana") quando falar ` +
    `do conjunto.\n\n` +
    `Formato OBRIGATÓRIO: prosa corrida em markdown simples (SEM títulos com #, SEM lista com ` +
    `bullets, SEM um parágrafo por artigo). Em vez de listar os artigos um a um, IDENTIFIQUE ` +
    `padrões e conexões entre os temas da semana — o que eles sinalizam em conjunto, que ` +
    `tendência isso revela, o que muda na prática pro leitor — e escreva de 2 a 4 parágrafos curtos ` +
    `organizados por esses temas/padrões (agrupe artigos relacionados no mesmo parágrafo quando fizer ` +
    `sentido; nem todo artigo precisa ganhar uma frase própria). Cite os artigos de forma natural ` +
    `dentro da prosa, com o termo certo pra cada um, não como lista. ` +
    `Abra com uma frase de contexto/gancho sobre a semana. Feche com uma frase curta convidando a ler ` +
    `os artigos completos abaixo. Baseie-se SOMENTE nos resumos fornecidos, sem inventar fatos ou ` +
    `números que não estejam neles. Máximo de 250 palavras no total.`;

  const listaArtigos = selecionados
    .map((p, i) => `${i + 1}. [${p.category_label || 'Geral'}] ${p.title}\nResumo: ${p.excerpt || '(sem resumo)'}`)
    .join('\n\n');

  const userPrompt = `Artigos da semana (${inicioTxt} a ${hojeTxt}):\n\n${listaArtigos}\n\nEscreva a abertura da newsletter.`;

  const { text } = await gerarTextoComFallback({ systemPrompt, userPrompt, logPrefix: 'análise da newsletter' });
  return text.trim();
}

async function main() {
  const posts = carregarPosts();
  const cutoffStr = new Date(hojeUTC() - DIAS_JANELA * DIA_MS).toISOString().slice(0, 10);

  let recentes = posts.filter((p) => p.date && p.date >= cutoffStr);

  if (recentes.length < QTD_MAIS_LIDOS + 1) {
    const idsRecentes = new Set(recentes.map((p) => p.id));
    const extras = posts
      .filter((p) => !idsRecentes.has(p.id) && p.date)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, QTD_MAIS_LIDOS + 1 - recentes.length);
    console.warn(
      `Só havia ${recentes.length} posts nos últimos ${DIAS_JANELA} dias — completando com ${extras.length} post(s) mais recentes fora da janela.`
    );
    recentes = recentes.concat(extras);
  }

  const viewsPorSlug = await buscarViews();

  const ranqueados = [...recentes].sort((a, b) => {
    const va = viewsPorSlug.get(a.id) || 0;
    const vb = viewsPorSlug.get(b.id) || 0;
    if (vb !== va) return vb - va;
    return (b.date || '').localeCompare(a.date || '');
  });

  const selecionados = ranqueados.slice(0, QTD_MAIS_LIDOS + 1);
  if (!selecionados.length) {
    console.error('Nenhum post disponível para montar a newsletter. Abortando sem criar rascunho.');
    process.exitCode = 1;
    return;
  }

  const destaque = selecionados[0];
  const maisLidos = selecionados.slice(1);
  const article_ids = selecionados.map((p) => ({ id: p.id, show_image: true }));

  const slugsCalculadoras = carregarCalculadoras();
  const calculator_slugs = escolherFerramentas(slugsCalculadoras);

  const inicioTxt = formatarDataPtBR(hojeUTC() - DIAS_JANELA * DIA_MS);
  const hojeTxt = formatarDataPtBR(hojeUTC());
  const subject = `📬 O que mudou no Direito do Trabalho — ${inicioTxt} a ${hojeTxt}`;

  const body_markdown = await gerarAnaliseSemana(selecionados, inicioTxt, hojeTxt);

  const { data, error } = await supabase
    .from('newsletter_campaigns')
    .insert({ subject, body_markdown, article_ids, calculator_slugs, status: 'draft' })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar a campanha no Supabase:', error.message || error);
    process.exitCode = 1;
    return;
  }

  console.log('Rascunho de newsletter criado com sucesso.');
  console.log(`  Campanha: ${data.id}`);
  console.log(`  Assunto: ${subject}`);
  console.log(`  Destaque: ${destaque.title} (${destaque.id})`);
  console.log(`  Mais lidos: ${maisLidos.map((p) => p.id).join(', ')}`);
  console.log(`  Ferramentas: ${calculator_slugs.join(', ')}`);
  console.log('  Status: draft — revise e agende/envie pelo painel admin (Newsletter → Campanhas).');
}

main();
