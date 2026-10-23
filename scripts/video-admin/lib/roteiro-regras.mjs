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

export function metas(tipo, durSeg) {
  const palavras = Math.round(durSeg * PALAVRAS_POR_SEG);
  const porCena = tipo === 'short' ? 5 : 8;
  const alvoCenas = Math.max(5, Math.round(durSeg / porCena));
  return { palavras, min: Math.round(palavras * 0.85), max: Math.round(palavras * 1.15), cenasMin: Math.max(5, Math.round(alvoCenas * 0.7)), cenasMax: Math.round(alvoCenas * 1.35), alvoCenas };
}

const TOM = {
  neutro: 'TOM NEUTRO E INFORMATIVO: explique o que a lei e a jurisprudência dizem, sem tomar partido. Trate empregado e empregador de forma equilibrada; ganchos em pergunta neutra.',
  empresa: 'PERSPECTIVA DO EMPREGADOR (informativa): mantenha os MESMOS fatos do artigo, organizando a explicação em torno do que o empregador deve observar, dos riscos de descumprimento e de boas práticas de conformidade. Não minimize direitos do empregado nem sugira burlar a lei.',
  empregado: 'PERSPECTIVA DO EMPREGADO (informativa): mantenha os MESMOS fatos do artigo, organizando a explicação em torno dos direitos do empregado, do que ele pode pedir e das formalidades/provas que o protegem. Não prometa resultado nem incentive ações sem respaldo.',
};

export function montarPrompt({ artigo, tipo, durSeg, tom, refsPermitidas, icones, motivoRetentativa }) {
  const m = metas(tipo, durSeg);
  const longo = tipo === 'longo';
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
- Número de cenas: entre ${m.cenasMin} e ${m.cenasMax} (alvo ${m.alvoCenas}); cada cena tem 1 a 3 frases de narração.
- A narração NÃO pode conter dígitos, "R$", "%" nem símbolos: escreva tudo por extenso ("artigo quatrocentos e sessenta e nove", "cinco meses"). Já o texto na TELA pode usar números e abreviações ("art. 469", "5 meses").
- Cena 1 é SEMPRE do tipo "capa" (gancho em pergunta neutra) e a última é SEMPRE do tipo "encerramento". Nunca 3 cenas seguidas do mesmo tipo. Varie os tipos e os ícones conforme o assunto do artigo.
- Cada cena mostra na tela uma versão CURTA do que a narração diz (texto de tela ≤ 110 caracteres; títulos ≤ 6 palavras; textos de cartão ≤ 60 caracteres).
- Use "**termo**" para destacar 1 expressão-chave por cena (no máximo).

TIPOS DE CENA E CAMPOS (além de "narracao" em todas):
1. capa: {"tipo":"capa","kicker":"área do direito","titulo":"pergunta central em até 5 palavras, com **destaque**","sub":"gancho/resposta curta em até 2 linhas","refs":["até 3 permitidas"],"pontos_titulo":"…","pontos":[{"icone":"…","texto":"≤3 palavras"} x3]}
2. pergunta: {"tipo":"pergunta","titulo":"…?","kicker":"opcional","marca_dagua":"ícone","refs":[]}
3. afirmacao: {"tipo":"afirmacao","texto":"…","icone":"…","refs":[]}
4. destaque: {"tipo":"destaque","titulo":"…","sub":"…","icone":"…","refs":[]}
5. comparacao: {"tipo":"comparacao","titulo":"opcional","centro":"vs"|"seta","esq":{"icone":"…","titulo":"≤4 palavras","texto":"…","estilo":"normal"|"aviso"|"ok","selo":"x"|"ok"(opcional)},"dir":{…igual…},"refs":[]}  (use "aviso" para o lado errado/arriscado e "ok" para o correto)
6. lista: {"tipo":"lista","titulo":"…","estilo":"ok"(positivo)|"aviso"(alertas),"itens":[{"icone":"…","texto":"≤4 palavras"} de 3 a 4]}
7. citacao: {"tipo":"citacao","texto":"frase-síntese"}
8. encerramento: {"tipo":"encerramento","narracao":"qualquer coisa (será substituída)"}

ÍCONES (campo "icone"/"marca_dagua"): use SOMENTE ids destas listas, escolhendo objetos que combinem com o assunto de cada cena (evite repetir o mesmo ícone mais de 2 vezes).
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
const RE_SEGUNDA = /(?<![\p{L}])(voc[êe]s?|seu|sua|seus|suas|teu|tua)(?![\p{L}])/iu;
const RE_DIGITOS = /[0-9]|R\$|%/;
const RE_PARCIAL = /(?<![\p{L}])(absurd[oa]s?|escandalos[oa]s?|vergonhos[oa]s?|golpe|calote|explorador[a]?|safad[oa]|patr[ãa]o mau)(?![\p{L}])/iu;

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
    if (i >= 2 && cenas[i - 1].tipo === c.tipo && cenas[i - 2].tipo === c.tipo) erros.push(`Cena ${n}: 3 cenas seguidas do tipo "${c.tipo}".`);
  });
  Object.entries(usadosIcone).forEach(([id, q]) => { if (q > 3) avisos.push(`Ícone ${id} usado ${q} vezes.`); });
  // orçamento de palavras (encerramento tem CTA fixo de ~20 palavras)
  const total = palavras + 20;
  const faixa = { min: m.min, max: m.max };
  let erroPalavras = null;
  if (total < faixa.min || total > faixa.max) erroPalavras = `Narração total com ${total} palavras; o alvo é ${m.palavras} (aceito ${faixa.min}–${faixa.max}).${total < faixa.min ? ' Escreva MAIS.' : ' Escreva MENOS.'}`;
  return { erros, avisos, erroPalavras, totalPalavras: total, metas: m };
}

export const CTA_FINAL = 'Leia o artigo completo no Calcula Prazo, com o link na descrição. E se inscreva no canal para acompanhar mais conteúdos.';
