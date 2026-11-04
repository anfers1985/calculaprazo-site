// Prompt, regras e validação do roteiro em slides. Tudo aqui é específico do pipeline do admin.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normRef } from './artigo.mjs';

const SLIDES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'slides');
export const PALAVRAS_POR_SEG = 2.5;

export function catalogoIcones() {
  const sprite = fs.readFileSync(path.join(SLIDES, 'icons.svg'), 'utf-8');
  const site = [...sprite.matchAll(/symbol id="(ic-[a-z0-9-]+)"/g)].map(m => m[1]);
  const listaTxt = fs.readFileSync(path.join(SLIDES, 'icones_lucide_lista.txt'), 'utf-8');
  const lucide = fs.readdirSync(path.join(SLIDES, 'lucide')).filter(f => f.endsWith('.svg')).map(f => 'lu-' + f.slice(0, -4));
  return { site: new Set(site), lucide: new Set(lucide), siteLista: site.join(', '), lucideTexto: listaTxt.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.replace(/(^|, |: )([a-z0-9-]+)/g, (m, a, n) => `${a}lu-${n}`)).join('\n') };
}


// Nomes antigos (Lucide < 0.400) que a IA ainda usa -> nomes atuais. Ícone é só enfeite: em vez de reprovar o roteiro, corrigimos.
const ICONE_ALIAS = {
  'alert-triangle': 'triangle-alert', 'alert-circle': 'circle-alert', 'alert-octagon': 'octagon-alert', 'help-circle': 'circle-help',
  'check-circle': 'circle-check', 'check-circle-2': 'circle-check', 'x-circle': 'circle-x', 'xcircle': 'circle-x', 'edit': 'pen-line', 'edit-2': 'pen', 'edit-3': 'pen-line',
  'bar-chart': 'chart-column', 'bar-chart-2': 'chart-column', 'line-chart': 'chart-line', 'pie-chart': 'chart-pie', 'trending': 'trending-up',
  'dollar-sign': 'circle-dollar-sign', 'money': 'banknote', 'user': 'user-round', 'users-2': 'users-round', 'user-circle': 'user-round', 'building-office': 'building-2', 'office': 'building-2',
  'file': 'file-text', 'document': 'file-text', 'contract': 'file-signature', 'law': 'scale', 'justice': 'scale', 'judge': 'gavel', 'court': 'landmark', 'safety': 'shield-check', 'helmet': 'hard-hat',
  'home': 'house', 'house-simple': 'house', 'trash': 'package', 'trash-2': 'package', 'broom': 'wrench', 'brush': 'paint-bucket', 'sweep': 'wrench', 'road': 'route', 'street': 'route', 'city': 'building-2', 'worker': 'hard-hat',
  'health': 'heart-pulse', 'medical': 'stethoscope', 'virus': 'biohazard', 'danger': 'triangle-alert', 'warning': 'triangle-alert', 'time': 'clock', 'calendar': 'calendar-days', 'money-bag': 'coins',
  'handshake-simple': 'handshake', 'question': 'circle-help', 'help': 'circle-help', 'lightbulb-on': 'lightbulb', 'light-bulb': 'lightbulb',
};
const ICONE_RESERVA = 'lu-circle-help'; // existe na lista; usado só se nem alias nem busca acharem nada

/** Corrige um id de ícone inválido: tira prefixos, aplica alias, tenta "lu-"/"ic-" e, por fim, casa por parte do nome. Devolve o id válido ou null. */
export function repararIcone(id, icones) {
  if (!id || typeof id !== 'string') return null;
  const ok = x => icones.site.has(x) || icones.lucide.has(x);
  const base = id.trim().toLowerCase().replace(/^(lu|ic|lucide)[-_:]/, '').replace(/_/g, '-');
  const candidatos = [id.trim(), 'lu-' + base, 'ic-' + base, 'lu-' + (ICONE_ALIAS[base] || ''), ...(ICONE_ALIAS[base] ? ['lu-' + ICONE_ALIAS[base]] : [])];
  for (const c of candidatos) if (c && ok(c)) return c;
  const partes = base.split('-').filter(p => p.length > 2);
  for (const p of partes) {
    const hit = [...icones.lucide].find(x => x.slice(3).split('-').includes(p)) || [...icones.site].find(x => x.slice(3).split('-').includes(p));
    if (hit) return hit;
  }
  return ok(ICONE_RESERVA) ? ICONE_RESERVA : null;
}

/** Corrige IN-PLACE tudo que é cosmético e determinístico (ícones, narração em chave alternativa, 3 cenas iguais seguidas). Devolve a lista do que mudou. */
export function repararRoteiro(r, icones) {
  const log = [];
  if (!r || !Array.isArray(r.cenas)) return log;
  const fix = (obj, k) => { if (obj && obj[k] && !(icones.site.has(obj[k]) || icones.lucide.has(obj[k]))) { const n = repararIcone(obj[k], icones); if (n) { log.push(`ícone "${obj[k]}" → "${n}"`); obj[k] = n; } } };
  r.cenas.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    // narração escrita com outro nome de campo
    if (!c.narracao) { const alt = c['narração'] ?? c.narration ?? c.fala ?? c.locucao ?? c['locução'] ?? c.texto_narracao; if (alt) { c.narracao = String(alt); log.push(`cena ${i + 1}: narração veio em outro campo`); } }
    if (c.narracao && RE_NARRACAO_SUJA.test(c.narracao)) { c.narracao = numerosPorExtenso(c.narracao); log.push(`cena ${i + 1}: narração limpa (números por extenso, símbolos)`); }
    fix(c, 'icone'); fix(c, 'marca_dagua'); fix(c.esq, 'icone'); fix(c.dir, 'icone');
    (c.itens || []).forEach(x => fix(x, 'icone')); (c.pontos || []).forEach(x => fix(x, 'icone'));
  });
  // lista fora de 3–4 itens: com 5+ corta; com 1–2 vira "destaque"; item sem ícone ganha o ícone reserva
  r.cenas.forEach((c, i) => {
    if (c.tipo !== 'lista' || !Array.isArray(c.itens)) return;
    c.itens.forEach(x => { if (x && !x.icone) x.icone = ICONE_RESERVA; });
    if (c.itens.length > 4) { c.itens = c.itens.slice(0, 4); log.push(`cena ${i + 1}: lista cortada em 4 itens`); }
    else if (c.itens.length < 3) {
      const a = c.itens[0] || {}, b = c.itens[1] || {};
      c.tipo = 'destaque'; c.titulo = String(a.texto || c.titulo || 'Em resumo').split(' ').slice(0, 6).join(' '); c.sub = String(b.texto || a.texto || ' ').slice(0, 120); c.icone = a.icone || ICONE_RESERVA; delete c.itens;
      log.push(`cena ${i + 1}: lista com poucos itens → "destaque"`);
    }
  });
  // a última cena tem de ser o encerramento (a narração dele é o CTA fixo, preenchida depois)
  if (r.cenas.length && r.cenas[r.cenas.length - 1].tipo !== 'encerramento') {
    r.cenas.push({ tipo: 'encerramento', narracao: '…', refs: [] });
    log.push('encerramento adicionado ao final');
  }
  // 3 cenas seguidas do mesmo tipo: troca a do meio entre "afirmacao" e "destaque" (campos equivalentes). Outros tipos viram só aviso na validação.
  for (let i = 2; i < r.cenas.length - 1; i++) {
    const a = r.cenas[i - 2], b = r.cenas[i - 1], c = r.cenas[i];
    if (!(a.tipo === b.tipo && b.tipo === c.tipo)) continue;
    if (c.tipo === 'afirmacao') {
      const t = String(c.texto || '').trim();
      c.tipo = 'destaque'; c.titulo = t.split(' ').slice(0, 6).join(' '); c.sub = t.split(' ').length > 6 ? t : ' ';
      c.icone = c.icone || ICONE_RESERVA; delete c.texto;
      log.push(`cena ${i + 1}: "afirmacao" repetida → "destaque"`);
    } else if (c.tipo === 'destaque') {
      const t = [c.titulo, c.sub].filter(x => x && String(x).trim()).join(': ').slice(0, 125);
      c.tipo = 'afirmacao'; c.texto = t; c.icone = c.icone || ICONE_RESERVA; delete c.titulo; delete c.sub;
      log.push(`cena ${i + 1}: "destaque" repetido → "afirmacao"`);
    }
  }
  return log;
}

export const COESAO_PROMPT = `COESÃO (muito importante): a narração é UM discurso contínuo dividido em cenas, e não uma lista de frases soltas. Antes de escrever, defina a linha de raciocínio: gancho → contexto → qual é o problema → o que a lei ou o tribunal diz → como isso se aplica na prática → resumo. Cada cena, exceto a primeira, deve COMEÇAR emendando a ideia da cena anterior, com um conector natural da fala ("Mas", "Por isso", "Nesse caso", "Na prática", "Ou seja", "Além disso", "Já", "Com isso", "Por outro lado", "E o que isso significa?", "Vamos ver"), variando-os (nunca o mesmo conector mais de duas vezes). A cena que abre um tópico novo deve ser anunciada pela anterior ("Vamos ver como isso funciona."). Não repita o assunto-título em toda cena: use referências ("essa regra", "nesse caso", "o tribunal"). A penúltima cena fecha o raciocínio e leva ao convite final, sem repeti-lo. NOVIDADE: cada cena traz uma informação NOVA do artigo (condição, exemplo, exceção, consequência); NUNCA repita uma ideia já dita só para completar o tempo, e na conclusão resuma o essencial UMA única vez (não escreva 3 ou 4 cenas finais dizendo a mesma coisa com palavras diferentes). Se faltar palavra para o alvo, aprofunde com exemplos e detalhes que estão no artigo, em vez de repetir. RITMO: alterne frases curtas (6 a 10 palavras) com frases mais longas; não faça todas as cenas com a mesma estrutura de sujeito + verbo + complemento.`;

export function metas(tipo, durSeg) {
  const palavras = Math.round(durSeg * PALAVRAS_POR_SEG);
  const porCena = tipo === 'short' ? 5 : 8;
  const alvoCenas = Math.max(5, Math.round(durSeg / porCena));
  return { palavras, min: Math.round(palavras * 0.85), max: Math.round(palavras * 1.15), cenasMin: Math.max(5, Math.round(alvoCenas * 0.7)), cenasMax: Math.round(alvoCenas * 1.35), alvoCenas };
}

export const TOM = {
  neutro: 'TOM NEUTRO E INFORMATIVO: explique o que a lei e a jurisprudência dizem, sem tomar partido. Trate empregado e empregador de forma equilibrada; ganchos em pergunta neutra.',
  empresa: 'PERSPECTIVA DO EMPREGADOR (informativa): mantenha os MESMOS fatos do artigo, organizando a explicação em torno do que o empregador deve observar, dos riscos de descumprimento e de boas práticas de conformidade. Não minimize direitos do empregado nem sugira burlar a lei.',
  empregado: 'PERSPECTIVA DO EMPREGADO (informativa): mantenha os MESMOS fatos do artigo, organizando a explicação em torno dos direitos do empregado, do que ele pode pedir e das formalidades/provas que o protegem. Não prometa resultado nem incentive ações sem respaldo.',
};

export function montarPrompt({ artigo, tipo, durSeg, tom, refsPermitidas, icones, motivoRetentativa }) {
  const m = metas(tipo, durSeg);
  const longo = tipo === 'longo';
  const porCena = Math.max(8, Math.round((m.palavras - 20) / Math.max(1, m.alvoCenas - 1)));
  const systemPrompt = [
    'Você é roteirista dos vídeos educativos de Direito do Trabalho do canal "Calcula Prazo — Direto ao Ponto". Escreve em português do Brasil, em TERCEIRA PESSOA, com linguagem clara e profissional.',
    'Seu roteiro é FIEL ao artigo-fonte: não acrescente fatos, números, prazos, valores, artigos de lei, súmulas ou decisões que não estejam no artigo. Se algo não está no artigo, não existe.',
    TOM[tom] || TOM.neutro,
    'Nunca use a segunda pessoa (você, vocês, seu, sua). Não dê aconselhamento individual, não prometa resultado e não use sensacionalismo.',
    'Responda SOMENTE com um objeto JSON válido (sem markdown, sem comentários, sem texto antes ou depois).',
  ].join('\n');

  const userPrompt = `ARTIGO-FONTE (título: ${artigo.titulo})
"""
${artigo.texto.slice(0, 30000)}
"""

REFERÊNCIAS LEGAIS PERMITIDAS NOS SLIDES (use EXATAMENTE estas strings, ou nenhuma): ${refsPermitidas.length ? JSON.stringify(refsPermitidas) : '[] (o artigo não cita normas: use refs vazio em todas as cenas)'}

OBJETIVO: vídeo ${longo ? 'LONGO (horizontal 16:9)' : 'SHORT (vertical 9:16)'} de ${Math.round(durSeg)} segundos.
- Narração total: entre ${m.min} e ${m.max} palavras (alvo ${m.palavras}; a voz fala ~${PALAVRAS_POR_SEG} palavras por segundo).
- Número de cenas: entre ${Math.max(m.cenasMin, m.alvoCenas - 2)} e ${m.cenasMax} (alvo ${m.alvoCenas}); com MENOS de ${Math.max(m.cenasMin, m.alvoCenas - 2)} cenas o vídeo fica curto demais. ORÇAMENTO: cada cena (exceto a última) tem de ${Math.max(5, porCena - 4)} a ${porCena + 4} palavras de narração (média ${porCena}), em 1 frase curta, ou 2 muito curtas. NÃO ultrapasse ${porCena + 6} palavras em nenhuma cena e NÃO escreva cenas com menos de ${Math.max(5, porCena - 6)}: o total precisa ficar entre ${m.min} e ${m.max}. Antes de responder, SOME as palavras: se passar de ${m.max}, corte; se faltar para ${m.min}, acrescente cenas ou alongue as cenas.\n- O campo \"narracao\" é OBRIGATÓRIO em TODAS as cenas, inclusive na capa (nunca omita nem renomeie).
- ${COESAO_PROMPT}
- A narração NÃO pode conter dígitos, "R$", "%" nem símbolos: escreva tudo por extenso ("artigo quatrocentos e sessenta e nove", "cinco meses"). Já o texto na TELA pode usar números e abreviações ("art. 469", "5 meses").
- Cena 1 é SEMPRE do tipo "capa" (gancho em pergunta neutra) e a última é SEMPRE do tipo "encerramento". Nunca 3 cenas seguidas do mesmo tipo (alterne, por exemplo, afirmacao → destaque → pergunta → lista). Varie os tipos e os ícones conforme o assunto do artigo.
- Cada cena mostra na tela uma versão CURTA do que a narração diz (texto de tela ≤ 110 caracteres; títulos ≤ 6 palavras; textos de cartão ≤ 60 caracteres).
- Use "**termo**" para destacar 1 expressão-chave por cena (no máximo).

TIPOS DE CENA E CAMPOS (além de "narracao" em todas):
1. capa: {"tipo":"capa","narracao":"…","kicker":"área do direito","titulo":"pergunta central em até 5 palavras, com **destaque**","sub":"gancho/resposta curta em até 2 linhas","refs":["até 3 permitidas"],"pontos_titulo":"…","pontos":[{"icone":"…","texto":"≤3 palavras"} x3]}
2. pergunta: {"tipo":"pergunta","narracao":"…","titulo":"…?","kicker":"opcional","marca_dagua":"ícone","refs":[]}
3. afirmacao: {"tipo":"afirmacao","narracao":"…","texto":"…","icone":"…","refs":[]}
4. destaque: {"tipo":"destaque","narracao":"…","titulo":"…","sub":"…","icone":"…","refs":[]}
5. comparacao: {"tipo":"comparacao","narracao":"…","titulo":"opcional","centro":"vs"|"seta","esq":{"icone":"…","titulo":"≤4 palavras","texto":"…","estilo":"normal"|"aviso"|"ok","selo":"x"|"ok"(opcional)},"dir":{…igual…},"refs":[]}  (use "aviso" para o lado errado/arriscado e "ok" para o correto)
6. lista: {"tipo":"lista","narracao":"…","titulo":"…","estilo":"ok"(positivo)|"aviso"(alertas),"itens":[{"icone":"…","texto":"≤4 palavras"} de 3 a 4]}
7. citacao: {"tipo":"citacao","narracao":"…","texto":"frase-síntese"}
8. encerramento: {"tipo":"encerramento","narracao":"qualquer coisa (será substituída)"}

ÍCONES (campo "icone"/"marca_dagua"): use SOMENTE ids destas listas, escolhendo objetos que combinem com o assunto de cada cena (evite repetir o mesmo ícone mais de 2 vezes). Copie o id EXATAMENTE como está na lista, com o prefixo \"lu-\" (ex.: lu-circle-help, lu-triangle-alert; NÃO invente nomes como lu-help-circle, lu-alert-triangle, lu-trash-2, lu-brush). Se nenhum servir, use lu-info.
Ícones do site: ${icones.siteLista}
Ícones Lucide:
${icones.lucideTexto}

CAMPOS DE PUBLICAÇÃO: "titulo_seo" (≤ 70 caracteres, em pergunta/benefício, sem clickbait), "descricao" (2 a 3 frases informativas), "hashtags" (3 a 5, começando com #)${longo ? ', "capitulos" (lista de {"cena": número da cena (1 = primeira), "titulo": ≤ 5 palavras}; 4 a 8 capítulos, o primeiro na cena 1, espaçados em pelo menos ~12 segundos)' : ''}.

FORMATO DE SAÍDA:
{"titulo_seo":"…","descricao":"…","hashtags":["#…"],${longo ? '"capitulos":[…],' : ''}"cenas":[ {…}, … ]}
${motivoRetentativa ? `\nATENÇÃO — a tentativa anterior foi REPROVADA pelos motivos abaixo. Corrija TODOS:\n${motivoRetentativa}\n` : ''}`;
  return { systemPrompt, userPrompt, metas: m };
}

// --------------------------------------------------------------------------------------------
const OBRIG = {
  capa: ['titulo', 'sub', 'pontos_titulo'],
  pergunta: ['titulo'],
  afirmacao: ['texto'],
  destaque: ['titulo', 'sub'],
  comparacao: ['esq', 'dir'],
  lista: ['titulo', 'itens'],
  citacao: ['texto'],
  encerramento: [],
};
const TIPOS = Object.keys(OBRIG);
export const RE_SEGUNDA = /(?<![\p{L}])(voc[êe]s?|seu|sua|seus|suas|teu|tua)(?![\p{L}])/iu;
export const RE_DIGITOS = /[0-9]|R\$|%/;

// ---------- números por extenso (a narração não pode ter dígitos; em vez de reprovar o roteiro, convertemos) ----------
const U = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const D = ['', '', 'vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const C = ['', 'cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
const ORD_M = ['', 'primeiro','segundo','terceiro','quarto','quinto','sexto','sétimo','oitavo','nono','décimo'];
const ORD_F = ['', 'primeira','segunda','terceira','quarta','quinta','sexta','sétima','oitava','nona','décima'];
function ate999(n) {
  if (n < 20) return U[n];
  if (n < 100) return D[Math.floor(n / 10)] + (n % 10 ? ' e ' + U[n % 10] : '');
  if (n === 100) return 'cem';
  return C[Math.floor(n / 100)] + (n % 100 ? ' e ' + ate999(n % 100) : '');
}
export function numeroPorExtenso(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 1000) return ate999(n);
  if (n < 1e6) {
    const mil = Math.floor(n / 1000), r = n % 1000;
    const m = mil === 1 ? 'mil' : ate999(mil) + ' mil';
    return r === 0 ? m : m + (r < 100 || r % 100 === 0 ? ' e ' : ' ') + ate999(r);
  }
  if (n < 1e9) {
    const mi = Math.floor(n / 1e6), r = n % 1e6;
    const m = mi === 1 ? 'um milhão' : numeroPorExtenso(mi) + ' milhões';
    return r === 0 ? m : m + (r < 100 || r % 100 === 0 ? ' e ' : ' ') + numeroPorExtenso(r);
  }
  return String(n);
}
export const RE_NARRACAO_SUJA = /[0-9%]|R\$|\bn[úu]meros?\b|\bn\.?\s*[º°]|[*_`#~<>\[\]{}|\\]/i;
/** Converte dígitos, "R$", "%" e ordinais em palavras (pt-BR). Ex.: "R$ 1.200,50" → "mil e duzentos reais e cinquenta centavos". */
export function numerosPorExtenso(t) {
  let x = String(t ?? '');
  // Marcadores/placeholders e formatação que a voz leria em voz alta ("*número*", "[número]", "**negrito**", "#"): somem.
  x = x.replace(/[*_`#~<>\[\]{}|]+\s*n[úu]meros?\s*[*_`#~<>\[\]{}|]+/gi, ' ').replace(/[*_`#~<>\[\]{}|\\]+/g, ' ');
  // "Tema número 171" / "Tema nº 171": a voz lê "número"; o natural é "Tema cento e setenta e um".
  x = x.replace(/\b(tema|s[úu]mula|artigos?|art\.?|lei|oj|orienta[çc][ãa]o jurisprudencial|precedente|inciso|par[áa]grafo)\s+(?:n[úu]meros?|n\.?\s*[º°o]\.?)\s+/gi, '$1 ');
  x = x.replace(/\bn(?:[úu]mero|\.?\s*[º°])\s*(?=\d)/gi, '');
  x = x.replace(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, (_, i, c) => {
    const inteiro = Number(i.replace(/\./g, ''));
    const cent = c ? Number(c.padEnd(2, '0')) : 0;
    return numeroPorExtenso(inteiro) + (inteiro === 1 ? ' real' : ' reais') + (cent ? ' e ' + numeroPorExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos') : '');
  });
  x = x.replace(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*%/g, (_, i, d) => numeroPorExtenso(Number(i.replace(/\./g, ''))) + (d ? ' vírgula ' + numeroPorExtenso(Number(d)) : '') + ' por cento');
  x = x.replace(/\b(\d+)\s*([ºª°])/g, (m, n, g) => { const k = Number(n); const t2 = (g === 'ª' ? ORD_F : ORD_M)[k]; return t2 || numeroPorExtenso(k); });
  x = x.replace(/(\d{1,3}(?:\.\d{3})+|\d+),(\d+)/g, (_, i, d) => numeroPorExtenso(Number(i.replace(/\./g, ''))) + ' vírgula ' + numeroPorExtenso(Number(d)));
  x = x.replace(/\d{1,3}(?:\.\d{3})+/g, m => numeroPorExtenso(Number(m.replace(/\./g, ''))));
  x = x.replace(/\d+/g, m => numeroPorExtenso(Number(m)));
  return x.replace(/\s+/g, ' ').trim();
}

export const RE_PARCIAL = /(?<![\p{L}])(absurd[oa]s?|escandalos[oa]s?|vergonhos[oa]s?|golpe|calote|explorador[a]?|safad[oa]|patr[ãa]o mau)(?![\p{L}])/iu;

export function extrairJson(texto) {
  let t = String(texto).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const ini = t.indexOf('{');
  if (ini < 0) throw new Error('A IA não devolveu JSON.');
  let prof = 0, emStr = false, esc = false;
  for (let i = ini; i < t.length; i++) {
    const c = t[i];
    if (emStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') emStr = false; continue; }
    if (c === '"') emStr = true; else if (c === '{') prof++; else if (c === '}') { prof--; if (prof === 0) return JSON.parse(t.slice(ini, i + 1)); }
  }
  throw new Error('JSON da IA truncado (resposta cortada).');
}

function textosDeTela(c) {
  const out = [];
  const visit = (v, k) => { if (typeof v === 'string' && !['tipo', 'icone', 'marca_dagua', 'centro', 'estilo', 'selo', 'narracao'].includes(k)) out.push(v); else if (Array.isArray(v)) v.forEach(x => visit(x, k)); else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => visit(vv, kk)); };
  Object.entries(c).forEach(([k, v]) => { if (k !== 'refs') visit(v, k); });
  return out;
}

export function validarRoteiro(r, ctx) {
  const { tipo, durSeg, refsPermitidas, textoArtigo, icones } = ctx;
  const m = metas(tipo, durSeg);
  const erros = [], avisos = [];
  if (!r || typeof r !== 'object') return { erros: ['Resposta não é um objeto.'], avisos };
  if (!r.titulo_seo || String(r.titulo_seo).length > 100) erros.push('titulo_seo ausente ou > 100 caracteres.');
  if (!r.descricao) erros.push('descricao ausente.');
  if (!Array.isArray(r.hashtags) || r.hashtags.length < 2) erros.push('hashtags: informe de 3 a 5.');
  const cenas = r.cenas;
  if (!Array.isArray(cenas) || !cenas.length) return { erros: [...erros, 'cenas ausentes.'], avisos };
  if (cenas.length < m.cenasMin || cenas.length > m.cenasMax) erros.push(`Número de cenas ${cenas.length} fora do intervalo ${m.cenasMin}–${m.cenasMax}.`);
  if (cenas[0].tipo !== 'capa') erros.push('A cena 1 deve ser do tipo "capa".');
  if (cenas[cenas.length - 1].tipo !== 'encerramento') erros.push('A última cena deve ser do tipo "encerramento".');
  const permitidas = new Set(refsPermitidas.map(normRef));
  const usadosIcone = {};
  const idsOk = id => icones.site.has(id) || icones.lucide.has(id);
  let palavras = 0;
  cenas.forEach((c, i) => {
    const n = i + 1;
    if (!TIPOS.includes(c.tipo)) { erros.push(`Cena ${n}: tipo inválido "${c.tipo}".`); return; }
    if (c.tipo === 'capa' && i !== 0) erros.push(`Cena ${n}: "capa" só pode ser a primeira cena.`);
    if (c.tipo === 'encerramento' && i !== cenas.length - 1) erros.push(`Cena ${n}: "encerramento" só pode ser a última.`);
    OBRIG[c.tipo].forEach(f => { if (!c[f] || (Array.isArray(c[f]) && !c[f].length)) erros.push(`Cena ${n} (${c.tipo}): falta "${f}".`); });
    if (c.tipo === 'afirmacao' && !c.icone && !c.painel) erros.push(`Cena ${n}: afirmacao precisa de "icone".`);
    if (c.tipo === 'destaque' && !c.icone) erros.push(`Cena ${n}: destaque precisa de "icone".`);
    if (c.tipo === 'comparacao') ['esq', 'dir'].forEach(l => { if (!c[l] || !c[l].icone || !c[l].titulo) erros.push(`Cena ${n}: comparacao.${l} precisa de icone e titulo.`); });
    if (c.tipo === 'lista' && Array.isArray(c.itens) && (c.itens.length < 3 || c.itens.length > 4 || c.itens.some(x => !x.icone || !x.texto))) erros.push(`Cena ${n}: lista precisa de 3 a 4 itens com icone e texto.`);
    if (c.tipo === 'capa' && (!Array.isArray(c.pontos) || c.pontos.length !== 3)) erros.push('Capa: informe exatamente 3 "pontos".');
    // narração
    if (c.tipo !== 'encerramento') {
      const nar = String(c.narracao || '');
      const w = (nar.match(/\S+/g) || []).length;
      palavras += w;
      if (w < 4) erros.push(`Cena ${n}: narração curta demais.`);
      if (w > 70) erros.push(`Cena ${n}: narração longa demais (${w} palavras; máx. 70).`);
      if (RE_DIGITOS.test(nar)) erros.push(`Cena ${n}: a narração não pode ter dígitos, "R$" ou "%" — escreva por extenso.`);
      if (RE_SEGUNDA.test(nar)) erros.push(`Cena ${n}: não use segunda pessoa na narração.`);
      if (ctx.tom === 'neutro' && RE_PARCIAL.test(nar)) avisos.push(`Cena ${n}: palavra parcial na narração (tom neutro).`);
    }
    // texto de tela
    const telas = textosDeTela(c);
    telas.forEach(t => { if (RE_SEGUNDA.test(t)) erros.push(`Cena ${n}: não use segunda pessoa no texto da tela ("${t.slice(0, 40)}").`); });
    // números de normas na tela precisam existir no artigo
    telas.concat(c.refs || []).forEach(t => {
      for (const mm of String(t).matchAll(/\b(art(?:igo)?s?\.?|s[úu]mula|tema|oj|lei(?:\s+complementar)?)\s*(?:n[ºo°.]?\s*)?(\d[\d.]*)/gi)) {
        const num = mm[2].replace(/\.$/, '');
        if (!textoArtigo.includes(num)) erros.push(`Cena ${n}: "${mm[0]}" cita um número que NÃO está no artigo-fonte.`);
      }
    });
    // refs
    (c.refs || []).forEach(rf => { if (!permitidas.has(normRef(rf))) erros.push(`Cena ${n}: referência "${rf}" não está entre as permitidas.`); });
    if ((c.refs || []).length > 3) erros.push(`Cena ${n}: no máximo 3 refs.`);
    // ícones
    const ids = [c.icone, c.marca_dagua, c.esq && c.esq.icone, c.dir && c.dir.icone, ...(c.itens || []).map(x => x.icone), ...(c.pontos || []).map(x => x.icone)].filter(Boolean);
    ids.forEach(id => { if (!idsOk(id)) erros.push(`Cena ${n}: ícone "${id}" não existe nas listas permitidas.`); usadosIcone[id] = (usadosIcone[id] || 0) + 1; });
    // comprimento de tela
    if (c.texto && String(c.texto).length > 130) erros.push(`Cena ${n}: texto de tela muito longo (${String(c.texto).length} > 130).`);
    if (i >= 2 && cenas[i - 1].tipo === c.tipo && cenas[i - 2].tipo === c.tipo) avisos.push(`Cena ${n}: 3 cenas seguidas do tipo "${c.tipo}" (só estética).`);
  });
  Object.entries(usadosIcone).forEach(([id, q]) => { if (q > 3) avisos.push(`Ícone ${id} usado ${q} vezes.`); });
  // orçamento de palavras (encerramento tem CTA fixo de ~20 palavras)
  const total = palavras + 20;
  const faixa = { min: m.min, max: m.max };
  let erroPalavras = null;
  if (total < faixa.min || total > faixa.max) {
    const n = Math.max(1, cenas.length - 1), media = Math.max(1, Math.round(palavras / n)), diff = Math.abs(m.palavras - total);
    const guia = total < faixa.min
      ? ` Escreva MAIS: faltam ~${diff} palavras. As ${cenas.length} cenas têm em média ${media} palavras; escreva ~${Math.ceil(diff / media)} cenas a mais OU alongue cada cena para ~${Math.round((m.palavras - 20) / n)} palavras.`
      : ` Escreva MENOS: sobram ~${diff} palavras. Corte ~${Math.round(diff / n)} palavras de cada cena ou remova ~${Math.ceil(diff / media)} cenas.`;
    erroPalavras = `Narração total com ${total} palavras; o alvo é ${m.palavras} (aceito ${faixa.min}–${faixa.max}).${guia}`;
  }
  return { erros, avisos, erroPalavras, totalPalavras: total, metas: m };
}

export const CTA_FINAL = 'Leia o artigo completo no Calcula Prazo, com o link na descrição. E se inscreva no canal para acompanhar mais conteúdos.';
