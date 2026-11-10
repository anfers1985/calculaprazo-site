// Prompt, regras e validação do roteiro em slides. Tudo aqui é específico do pipeline do admin.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normRef } from './artigo.mjs';

const SLIDES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'slides');
// Medido nos vídeos reais (voz Francisca, com pausas entre cenas): ~2,2 palavras por segundo. Ajustável por ROTEIRO_PPS.
export const PALAVRAS_POR_SEG = Number(process.env.ROTEIRO_PPS) || 2.2;

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
    aplicarNumerosNaTela(c); // tela sempre em algarismos ("Tema 176", "art. 227", "50%"); a voz lê por extenso
    fix(c, 'icone'); fix(c, 'marca_dagua'); fix(c.esq, 'icone'); fix(c.dir, 'icone'); (c.cards || []).forEach(x => fix(x, 'icone'));
    (c.itens || []).forEach(x => fix(x, 'icone')); (c.pontos || []).forEach(x => fix(x, 'icone'));
  });
  // chips (etiquetas): só texto curto, no máximo 3; tipo "numero" precisa de número válido (senão vira "destaque")
  r.cenas.forEach((c, i) => {
    if (Array.isArray(c.chips)) {
      c.chips = c.chips.filter(x => typeof x === 'string' && x.trim()).map(x => { const t = x.replace(/[*_`#]/g, '').trim(); return t.length > 28 ? t.split(/\s+/).slice(0, 3).join(' ') : t; }).slice(0, 3);
      if (!c.chips.length || !['afirmacao', 'destaque', 'numero'].includes(c.tipo)) delete c.chips;
    } else if (c.chips !== undefined) delete c.chips;
    if (c.tipo === 'numero') {
      const bruto = String(c.numero ?? '').replace(/\s+/g, '');
      const ok = /^\d{1,4}([.,]\d{1,2})?$/.test(bruto);
      if (!ok) {
        const t = [c.prefixo, c.numero, c.sufixo, c.unidade].filter(Boolean).join(' ').trim();
        c.tipo = 'destaque'; c.titulo = (t || 'Em destaque').split(/\s+/).slice(0, 6).join(' '); c.sub = String(c.sub || ' '); delete c.numero; delete c.prefixo; delete c.unidade; delete c.sufixo;
        log.push(`cena ${i + 1}: "numero" inválido → "destaque"`);
      } else { c.numero = bruto; if (c.sufixo && String(c.sufixo).length > 2) delete c.sufixo; if (!c.icone) c.icone = ICONE_RESERVA; }
    }
  });
  // grade / passos / decisao: ajusta contagens e converte em "destaque" quando faltar conteúdo
  const corta = (t, n) => { const x = String(t ?? '').replace(/[*_`#]/g, '').trim(); if (x.length <= n) return x; const k = x.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, ''); return k || x.slice(0, n); };
  const virarDestaque = (c, i, titulo, sub, motivo) => { c.tipo = 'destaque'; c.titulo = corta(titulo || 'Em destaque', 60).split(/\s+/).slice(0, 8).join(' '); c.sub = corta(sub || ' ', 120) || ' '; c.icone = c.icone || ICONE_RESERVA; delete c.cards; delete c.passos; delete c.pergunta; delete c.sim; delete c.nao; log.push(`cena ${i + 1}: ${motivo} → "destaque"`); };
  r.cenas.forEach((c, i) => {
    if (c.tipo === 'grade') {
      const cards = (Array.isArray(c.cards) ? c.cards : []).filter(x => x && typeof x === 'object' && x.titulo).slice(0, 4);
      cards.forEach(x => { x.titulo = corta(x.titulo, 40); x.texto = x.texto ? corta(x.texto, 90) : ''; if (!x.icone) x.icone = ICONE_RESERVA; });
      if (cards.length < 2) virarDestaque(c, i, c.titulo || (cards[0] && cards[0].titulo), cards[0] && cards[0].texto, 'grade com poucos cartões');
      else c.cards = cards;
    } else if (c.tipo === 'passos') {
      const ps = (Array.isArray(c.passos) ? c.passos : []).filter(x => x && typeof x === 'object' && x.titulo).slice(0, 5);
      ps.forEach(x => { x.titulo = corta(x.titulo, 40); x.texto = x.texto ? corta(x.texto, 80) : ''; });
      if (ps.length < 3) virarDestaque(c, i, c.titulo || (ps[0] && ps[0].titulo), ps.map(x => x.titulo).join(' · '), 'passos insuficientes');
      else c.passos = ps;
    } else if (c.tipo === 'decisao') {
      const ok = o => o && typeof o === 'object' && o.titulo;
      if (!c.pergunta || !ok(c.sim) || !ok(c.nao)) virarDestaque(c, i, c.pergunta || c.titulo, [c.sim && c.sim.titulo, c.nao && c.nao.titulo].filter(Boolean).join(' · '), 'decisão incompleta');
      else {
        // O rótulo "SIM"/"NÃO" da caixa vem do slot (c.sim / c.nao), não do texto: a IA às vezes escreve a RESPOSTA no slot errado (sim.titulo = "Não"),
        // e o vídeo mostrava a etiqueta SIM sobre o título "Não" (vídeo da jornada de 42 h). Se os dois estão trocados, troca; se só um está incoerente, a cena não é confiável.
        const diz = (x, re) => re.test(String(x.titulo).trim());
        if (diz(c.sim, /^n[ãa]o\b/i) && diz(c.nao, /^sim\b/i)) { [c.sim, c.nao] = [c.nao, c.sim]; log.push(`cena ${i + 1}: ramos sim/não estavam trocados → corrigidos`); }
        if (diz(c.sim, /^n[ãa]o\b/i) || diz(c.nao, /^sim\b/i)) virarDestaque(c, i, c.pergunta || c.titulo, [c.sim && c.sim.titulo, c.nao && c.nao.titulo].filter(Boolean).join(' · '), 'ramos sim/não incoerentes com o rótulo');
        else { c.pergunta = corta(c.pergunta, 110); ['sim', 'nao'].forEach(k => { c[k].titulo = corta(c[k].titulo, 40); c[k].texto = c[k].texto ? corta(c[k].texto, 90) : ''; }); }
      }
    }
  });
  // lista fora de 3–4 itens: com 5+ corta; com 1–2 vira "destaque"; item sem ícone ganha o ícone reserva
  r.cenas.forEach((c, i) => {
    if (c.tipo !== 'lista' || !Array.isArray(c.itens)) return;
    c.itens.forEach(x => { if (x && !x.icone) x.icone = ICONE_RESERVA; });
    if (c.itens.length > 4) { c.itens = c.itens.slice(0, 4); log.push(`cena ${i + 1}: lista cortada em 4 itens`); }
    else if (c.itens.length < 3) {
      const a = c.itens[0] || {}, b = c.itens[1] || {};
      c.tipo = 'destaque'; c.titulo = dividirTitulo(String(a.texto || c.titulo || 'Em resumo'), 6)[0]; c.sub = String(b.texto || a.texto || ' ').slice(0, 120); c.icone = a.icone || ICONE_RESERVA; delete c.itens;
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
      c.tipo = 'destaque'; { const [tt, ss] = dividirTitulo(t, 6); c.titulo = tt; c.sub = ss || ' '; }
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

export const COESAO_PROMPT = `COESÃO (muito importante): a narração é UM discurso contínuo dividido em cenas, e não uma lista de frases soltas. Antes de escrever, defina a linha de raciocínio: gancho → contexto → qual é o problema → o que a lei ou o tribunal diz → como isso se aplica na prática → resumo. Cada cena, exceto a primeira, deve COMEÇAR emendando a ideia da cena anterior, com um conector natural da fala ("Mas", "Por isso", "Nesse caso", "Na prática", "Ou seja", "Além disso", "Já", "Com isso", "Por outro lado", "E o que isso significa?", "Vamos ver"), variando-os (nunca o mesmo conector mais de duas vezes). Use só conectores comuns da fala: não use "aliás", "outrossim", "destarte", "ademais" nem expressões raras, que a voz sintética pronuncia mal. A cena que abre um tópico novo deve ser anunciada pela anterior ("Vamos ver como isso funciona."). Não repita o assunto-título em toda cena: use referências ("essa regra", "nesse caso", "o tribunal"). A penúltima cena fecha o raciocínio e leva ao convite final, sem repeti-lo. NOVIDADE: cada cena traz uma informação NOVA do artigo (condição, exemplo, exceção, consequência); NUNCA repita uma ideia já dita só para completar o tempo, e na conclusão resuma o essencial UMA única vez (não escreva 3 ou 4 cenas finais dizendo a mesma coisa com palavras diferentes). Se faltar palavra para o alvo, aprofunde com exemplos e detalhes que estão no artigo, em vez de repetir. RITMO: alterne frases curtas (6 a 10 palavras) com frases mais longas; não faça todas as cenas com a mesma estrutura de sujeito + verbo + complemento. ABERTURA: se a cena 1 é uma PERGUNTA, a cena 2 a RESPONDE logo no início, em poucas palavras (\"Não, em regra.\", \"Depende.\", \"Sim.\", \"O TST firmou que…\"), SEM conector de contraste ou consequência (\"Mas\", \"Por isso\", \"Com isso\", \"Portanto\"), porque ainda não há nada a contrastar. Faça no máximo UMA pergunta em todo o vídeo (a da abertura): nunca faça outra pergunta depois da resposta. Conector só quando existe ligação lógica real com a frase anterior; sem ligação, comece a frase direto.`;

export function metas(tipo, durSeg) {
  const palavras = Math.round(durSeg * PALAVRAS_POR_SEG);
  const porCena = tipo === 'short' ? 7.5 : 10; // slides-infográfico precisam de tempo na tela: cenas de ~7–10 s
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
  const porCena = Math.max(8, Math.round((m.palavras - 26) / Math.max(1, m.alvoCenas - 1)));
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
- Número de cenas: entre ${Math.max(m.cenasMin, m.alvoCenas - 2)} e ${m.cenasMax} (alvo ${m.alvoCenas}); com MENOS de ${Math.max(m.cenasMin, m.alvoCenas - 2)} cenas o vídeo fica curto demais. ORÇAMENTO: cada cena (exceto a última) tem de ${Math.max(5, porCena - 4)} a ${porCena + 4} palavras de narração (média ${porCena}), em 1 frase curta, ou 2 muito curtas, nas cenas de TEXTO (afirmacao, destaque, pergunta, citacao, numero). NÃO ultrapasse ${porCena + 6} palavras nem escreva menos de ${Math.max(5, porCena - 6)} nessas cenas. As cenas de INFOGRÁFICO (decisao, grade, passos, comparacao, lista) têm de ${porCena + 5} a ${porCena + 16} palavras: a narração percorre CADA item na ordem em que ele aparece na tela (a pergunta, depois o sim e o não; cartão a cartão; passo a passo), porque o espectador precisa de tempo para ler. O total precisa ficar entre ${m.min} e ${m.max}. Antes de responder, SOME as palavras: se passar de ${m.max}, corte; se faltar para ${m.min}, acrescente cenas ou alongue as cenas.\n- O campo \"narracao\" é OBRIGATÓRIO em TODAS as cenas, inclusive na capa (nunca omita nem renomeie).
- ${COESAO_PROMPT}
- A narração NÃO pode conter dígitos, "R$", "%" nem símbolos: escreva tudo por extenso ("artigo quatrocentos e sessenta e nove", "cinco meses"). O texto na TELA, ao contrário, usa SEMPRE algarismos e abreviações, nunca números por extenso ("art. 469", "5 meses", "Tema 176", "LC 150/2015", "25 horas", "50%", "3,2%"): o espectador lê a tela e ouve a voz. TUDO o que aparece na tela (cada item de grade, passo, lista ou comparação, e o subtítulo) tem de ser dito pela narração DA MESMA CENA: não coloque na tela um dado que a voz não menciona, e faça a narração citar cada item na ordem. Cada cena é uma frase COMPLETA: começa com maiúscula e termina com ponto, "?" ou "!"; nunca divida uma frase entre duas cenas. Textos de tela são curtos (até 8 palavras) e completos (não terminam em preposição, artigo ou vírgula).
- Cena 1 é SEMPRE do tipo "capa" (gancho em pergunta neutra) e a última é SEMPRE do tipo "encerramento". Nunca 3 cenas seguidas do mesmo tipo (alterne, por exemplo, afirmacao → destaque → pergunta → lista). A cena 2 NUNCA é do tipo "pergunta": a capa já é a pergunta e a cena 2 começa a responder. Use "pergunta" só para abrir um tópico novo (no máximo ${longo ? 3 : 1} no vídeo), sempre respondida pela cena seguinte; nunca duas perguntas seguidas. Varie os tipos e os ícones conforme o assunto do artigo.
- VARIEDADE E INFORMAÇÃO NOS SLIDES: os slides são INFOGRÁFICOS que se montam enquanto o narrador fala, e não frases com um símbolo. Escolha o tipo pelo conteúdo da cena: "decisao" quando a regra é um teste sim/não (ex.: "trabalha mais de dois dias por semana?"); "grade" para requisitos, elementos, critérios ou direitos (2 a 4 cartões); "passos" para etapas ou ordem de análise (3 a 5); "comparacao" quando o artigo contrapõe dois conceitos (ex.: diarista × doméstica); "numero" para um número-chave que esteja no artigo; "lista" para o resumo; "citacao" para a frase-síntese de uma regra. "afirmacao" e "destaque" são o ÚLTIMO recurso: no máximo ${longo ? '40%' : '50%'} das cenas de conteúdo. Cite nos textos dos cartões, passos e opções as MESMAS palavras que a narração usa para cada item, e na MESMA ordem (o item aparece na tela quando o narrador o menciona). ${longo ? 'No vídeo longo use pelo menos 4 tipos diferentes. A PENÚLTIMA cena é o RESUMO: tipo "lista" com 3 itens, titulo "Em resumo", e narração que começa com "Em resumo," e retoma os pontos principais.' : 'No Short use pelo menos 3 tipos diferentes.'}
- O texto de tela carrega a INFORMAÇÃO-CHAVE da cena (um critério, um dado ou uma conclusão, em 6 a 12 palavras), e não só um rótulo de 2 ou 3 palavras. Ruim: "Autonomia na prestação". Bom: "Atende várias casas, com autonomia: diarista".
- Cada cena mostra na tela uma versão CURTA do que a narração diz (texto de tela ≤ 110 caracteres; títulos ≤ 6 palavras; textos de cartão ≤ 60 caracteres).
- Use "**termo**" para destacar 1 expressão-chave por cena (no máximo).

TIPOS DE CENA E CAMPOS (além de "narracao" em todas):
1. capa: {"tipo":"capa","narracao":"…","kicker":"área do direito","titulo":"pergunta central ou tese em frase COMPLETA e gramatical, de 3 a 8 palavras, com **destaque** (nunca corte uma expressão ao meio: 'no contrato de experiência' não pode virar 'no experiência')","sub":"gancho/resposta curta em até 2 linhas","refs":["até 3 permitidas"],"pontos_titulo":"…","pontos":[{"icone":"…","texto":"≤3 palavras"} x3]}
2. pergunta: {"tipo":"pergunta","narracao":"…","titulo":"…?","kicker":"opcional","marca_dagua":"ícone","refs":[]}
3. afirmacao: {"tipo":"afirmacao","narracao":"…","texto":"…","icone":"…","refs":[]}
4. destaque: {"tipo":"destaque","narracao":"…","titulo":"…","sub":"…","icone":"…","refs":[]}
5. comparacao: {"tipo":"comparacao","narracao":"…","titulo":"opcional","centro":"vs"|"seta","esq":{"icone":"…","titulo":"≤4 palavras","texto":"…","estilo":"normal"|"aviso"|"ok","selo":"x"|"ok"(opcional)},"dir":{…igual…},"refs":[]}  (use "aviso" para o lado errado/arriscado e "ok" para o correto)
6. lista: {"tipo":"lista","narracao":"…","titulo":"…","estilo":"ok"(positivo)|"aviso"(alertas),"itens":[{"icone":"…","texto":"≤4 palavras"} de 3 a 4]}
7. citacao: {"tipo":"citacao","narracao":"…","texto":"frase-síntese"}
8. encerramento: {"tipo":"encerramento","narracao":"qualquer coisa (será substituída)"}
9. numero (OPCIONAL, para destacar um número-chave que ESTÁ NO ARTIGO: prazo, quantidade de dias/meses, percentual): {"tipo":"numero","narracao":"…","numero":"só dígitos, ex.: 2","prefixo":"opcional, ≤3 palavras (ex.: Mais de)","unidade":"≤4 palavras (ex.: dias por semana)","sufixo":"opcional: % ou +","sub":"≤90 caracteres","icone":"…","refs":[]}
10. grade (REQUISITOS, ELEMENTOS, CRITÉRIOS ou DIREITOS em cartões lado a lado): {"tipo":"grade","narracao":"…","titulo":"≤6 palavras","cards":[{"icone":"…","titulo":"≤3 palavras","texto":"≤60 caracteres"} de 2 a 4],"refs":[]}
11. passos (PROCESSO, ETAPAS ou ORDEM de análise, ligados por uma linha): {"tipo":"passos","narracao":"…","titulo":"≤6 palavras","passos":[{"titulo":"≤3 palavras","texto":"≤50 caracteres"} de 3 a 5],"refs":[]}
12. decisao (FLUXO SIM/NÃO, no máximo 1 por vídeo e NUNCA no Short. A narração DESSA cena (mínimo 25 palavras) faz a pergunta E explica os DOIS ramos com as mesmas palavras dos textos "sim" e "nao": "…? Sim, … Já quando … , …". A pergunta NUNCA usa "apenas", "só" ou "somente" (inverte o Sim/Não). O ramo "sim" vale quando a resposta à pergunta é SIM e o "nao" quando é NÃO: o titulo de "sim" nunca começa com "Não" e o de "nao" nunca começa com "Sim"): {"tipo":"decisao","narracao":"…","pergunta":"≤90 caracteres, termina com ?","sim":{"titulo":"≤4 palavras","texto":"≤60 caracteres"},"nao":{"titulo":"≤4 palavras","texto":"≤60 caracteres"},"refs":[]}
CHIPS (opcional em afirmacao, destaque e numero): "chips":["termo-chave","termo-chave"] com 2 a 3 etiquetas de até 3 palavras cada, que aparecem na tela como resumo visual do que a narração diz.

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
  numero: ['numero', 'unidade'],
  grade: ['titulo', 'cards'],
  passos: ['titulo', 'passos'],
  decisao: ['pergunta', 'sim', 'nao'],
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
// ---------- TELA: números e leis em ALGARISMOS (a voz continua lendo por extenso) ----------
const _CAT = new Map(); const _VAL = new Map();
const _reg = (cat, obj) => Object.entries(obj).forEach(([w, v]) => { _CAT.set(w, cat); _VAL.set(w, v); });
_reg('U', { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 });
_reg('T', { dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 });
_reg('D', { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 });
_reg('C', { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 });
_reg('M', { mil: 1000 });
const _UNIDADES = new Set(['hora', 'horas', 'dia', 'dias', 'mês', 'mes', 'meses', 'ano', 'anos', 'semana', 'semanas', 'minuto', 'minutos', 'vez', 'vezes', 'real', 'reais', 'centavo', 'centavos', 'parcela', 'parcelas']);
const _MARCADORES = new Set(['artigo', 'artigos', 'art', 'tema', 'súmula', 'sumula', 'lei', 'complementar', 'oj', 'inciso', 'parágrafo', 'paragrafo', 'anexo', 'nr', 'sdi']);
function _podeSeguir(ant, prox, viaE) {
  if (ant === 'D') return viaE && prox === 'U';
  if (ant === 'C') return viaE && (prox === 'U' || prox === 'T' || prox === 'D');
  if (ant === 'M') return viaE ? ['U', 'T', 'D', 'C'].includes(prox) : prox === 'C';
  return false; // U e T encerram o número
}
/** Converte numerais por extenso em algarismos no texto de TELA. Ex.: "Lei Complementar cento e cinquenta" → "Lei Complementar 150";
 *  "três vírgula dois por cento" → "3,2%"; "vinte e cinco horas" → "25 horas". Números pequenos (até vinte) só mudam junto de unidade/norma
 *  ("seis horas", "Tema ..."), para não trocar o artigo "um" nem "os dois lados". */
export function numerosParaTela(texto) {
  const s = String(texto ?? '');
  const toks = s.match(/[\p{L}]+|[^\p{L}]+/gu) || [];
  const low = toks.map(t => t.toLowerCase());
  const ehPal = k => k >= 0 && k < toks.length && /^\p{L}/u.test(toks[k]);
  const ehNum = k => ehPal(k) && _CAT.has(low[k]);
  const fmt = n => String(n);
  // lê um numeral a partir de i: { fim, valor, palavras, cat } ou null
  const ler = (i) => {
    if (!ehNum(i)) return null;
    let k = i, total = 0, cur = 0, n = 0, ant = null;
    for (;;) {
      const w = low[k], cat = _CAT.get(w), v = _VAL.get(w);
      if (cat === 'M') total += (cur || 1) * 1000, cur = 0; else cur += v;
      n++; ant = cat;
      // próximo componente: "<espaço>[e<espaço>]<numeral>"
      let j = k + 1, viaE = false;
      if (j < toks.length && /^\s+$/.test(toks[j])) j++; else break;
      if (ehPal(j) && low[j] === 'e') { viaE = true; j++; if (j < toks.length && /^\s+$/.test(toks[j])) j++; else break; }
      if (!ehNum(j)) break;
      const prox = _CAT.get(low[j]);
      const multiplicador = prox === 'M' && !viaE && ['U', 'T', 'D', 'C'].includes(ant) && total === 0;
      if (!multiplicador && !_podeSeguir(ant, prox, viaE)) break;
      k = j;
    }
    return { fim: k + 1, valor: total + cur, palavras: n, cat: ant };
  };
  const proxPalavra = (k) => { let j = k; while (j < toks.length && /^\s+$/.test(toks[j])) j++; return ehPal(j) ? j : -1; };
  const antPalavra = (k) => { let j = k - 1; while (j >= 0 && /^[^\p{L}]+$/u.test(toks[j]) && /^\s+$/.test(toks[j])) j--; return ehPal(j) ? j : -1; };
  const out = [];
  let i = 0;
  while (i < toks.length) {
    const r = ler(i);
    if (!r) { out.push(toks[i]); i++; continue; }
    let fim = r.fim, texto2 = fmt(r.valor), decimal = false, pct = false;
    // decimal: "<n> vírgula <n>"
    const pv = proxPalavra(fim);
    if (pv > 0 && /^v[ií]rgula$/.test(low[pv])) {
      const pn = proxPalavra(pv + 1);
      const r2 = pn > 0 ? ler(pn) : null;
      if (r2) { texto2 += ',' + String(r2.valor); fim = r2.fim; decimal = true; }
    }
    // percentual: "<n> por cento"
    const p1 = proxPalavra(fim);
    if (p1 > 0 && low[p1] === 'por') { const p2 = proxPalavra(p1 + 1); if (p2 > 0 && low[p2] === 'cento') { pct = true; fim = p2 + 1; } }
    const pu = proxPalavra(fim);
    const unidade = pu > 0 && _UNIDADES.has(low[pu]);
    const pa = antPalavra(i);
    const marcador = pa >= 0 && _MARCADORES.has(low[pa]);
    const grande = r.valor >= 21 || r.palavras > 1;
    const pequenoOk = unidade || marcador;
    const ehUmArtigo = r.palavras === 1 && (low[i] === 'um' || low[i] === 'uma') && !unidade;
    if (!decimal && r.valor >= 1000 && (r.valor >= 10000 || (pu > 0 && /^reais?$/.test(low[pu])))) texto2 = r.valor.toLocaleString('pt-BR'); // 1.200 reais, mas ano fica 2015
    const converter = !ehUmArtigo && (decimal || pct || grande || pequenoOk);
    if (!converter) { for (let q = i; q < r.fim; q++) out.push(toks[q]); i = r.fim; continue; }
    out.push(texto2 + (pct ? '%' : '')); i = fim;
  }
  return out.join('');
}
const _SEM_CONVERTER = new Set(['narracao', 'prompt_imagem', 'tipo', 'icone', 'marca_dagua', 'centro', 'estilo', 'selo', 'personagem', 'refs', 'texto_na_imagem']);
/** Aplica numerosParaTela a todos os textos de tela de uma cena (tudo, menos narração, prompt de imagem, ícones e tipos). */
export function aplicarNumerosNaTela(c) {
  const visita = (v, k) => {
    if (typeof v === 'string') return _SEM_CONVERTER.has(k) ? v : numerosParaTela(v.replace(/\*\*|__|`/g, ''));  // tira marcação de markdown que a IA às vezes põe na tela
    if (Array.isArray(v)) return v.map(x => visita(x, k));
    if (v && typeof v === 'object') { Object.keys(v).forEach(kk => { v[kk] = visita(v[kk], kk); }); return v; }
    return v;
  };
  if (c && typeof c === 'object') Object.keys(c).forEach(k => { c[k] = visita(c[k], k); });
  return c;
}
// Tela × fala e tela cortada: por padrão só AVISAM (a IA de roteiro nem sempre consegue cumprir e o job não pode cair por isso).
// ROTEIRO_TELA_ESTRITA=1 volta a reprovar o roteiro.
const TELA_ESTRITA = process.env.ROTEIRO_TELA_ESTRITA === '1';
const _FUNC_FIM = /(?:^|\s)(?:de|do|da|dos|das|o|a|os|as|e|ou|em|no|na|nos|nas|para|com|que|um|uma|por|ao|aos|pelo|pela|sem|sob|entre)$/i;
/** Texto de tela que termina no meio da frase (preposição, artigo, vírgula): sinal de corte ruim. */
export function telaCortada(t) {
  const x = String(t ?? '').trim();
  if (x.split(/\s+/).length < 3) return false;
  return /[,;:]$/.test(x) || _FUNC_FIM.test(x);
}
/** Divide um texto em título curto + resto, sem cortar no meio da frase e sem repetir o texto inteiro no subtítulo. */
export function dividirTitulo(t, n = 6) {
  const x = String(t ?? '').trim();
  const pal = x.split(/\s+/);
  if (pal.length <= n + 2) return [x, '']; // até 2 palavras de folga: melhor um título completo do que cortado
  let corte = n;
  for (let k = Math.min(pal.length - 1, n + 2); k >= 3; k--) if (/[,;:]$/.test(pal[k - 1])) { corte = k; break; } // prefere fechar numa vírgula
  while (corte > 3 && _FUNC_FIM.test(pal.slice(0, corte).join(' ').replace(/[,;:]+$/, ''))) corte--;
  const titulo = pal.slice(0, corte).join(' ').replace(/[,;:\s]+$/, '');
  let resto = pal.slice(corte).join(' ').trim();
  if (resto) resto = resto[0].toUpperCase() + resto.slice(1);
  return [titulo, resto];
}
const _SEM_ACENTO = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const _GENERICAS = new Set(['sobre', 'quando', 'sempre', 'ainda', 'outros', 'outras', 'apenas', 'depois', 'antes', 'esses', 'essas', 'dessa', 'desse']);
function _radicais(t) { return (_SEM_ACENTO(t).match(/[a-z]{5,}/g) || []).filter(w => !_GENERICAS.has(w)).map(w => w.slice(0, 5)); }
const _CHAVES_NAO_FALADAS = new Set(['tipo', 'icone', 'marca_dagua', 'centro', 'estilo', 'selo', 'narracao', 'refs', 'chips', 'pontos', 'prompt_imagem']);
function textosFalaveis(c) {
  const out = [];
  const visit = (v, k) => { if (typeof v === 'string') { if (!_CHAVES_NAO_FALADAS.has(k)) out.push(v); } else if (Array.isArray(v)) v.forEach(x => visit(x, k)); else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => visit(vv, kk)); };
  Object.entries(c).forEach(([k, v]) => visit(v, k));
  return out;
}
/** Fração das palavras de conteúdo do texto de tela que aparecem (pelo radical) na narração da cena. */
export function coberturaTelaNarracao(tela, narracao) {
  const alvo = _radicais(tela); if (!alvo.length) return { total: 0, cobertura: 1 };
  const falado = new Set(_radicais(narracao));
  const achou = alvo.filter(w => falado.has(w)).length;
  return { total: alvo.length, cobertura: achou / alvo.length };
}
// ---------- REPAROS que evitam derrubar o job por problema que dá para consertar sozinho ----------
/** Tira das cenas as referências (chips) que não estão entre as permitidas e limita a 3. Chip é enfeite: o artigo-fonte continua sendo a verdade. */
export function filtrarRefs(r, refsPermitidas) {
  const ok = new Set((refsPermitidas || []).map(normRef));
  const reparos = [];
  (r.cenas || []).forEach((c, i) => {
    if (!c || !Array.isArray(c.refs)) return;
    const boas = c.refs.filter(x => ok.has(normRef(x))).slice(0, 3);
    if (boas.length !== c.refs.length) reparos.push(`cena ${i + 1}: ${c.refs.length - boas.length} referência(s) fora das permitidas removida(s)`);
    c.refs = boas;
  });
  return reparos;
}
/** Nada na tela que a voz não diga: tira da cena chips, subtítulo e itens de grade/passos/lista que a narração não menciona (a tela segue a fala, nunca o contrário).
 *  Se sobrarem itens de menos, a cena vira "afirmacao" só com o título. Devolve a lista de reparos feitos. */
const _GENERO = [[/\bdois\b/g, 'duas'], [/\bum\b/g, 'uma'], [/\bduzentos\b/g, 'duzentas'], [/\btrezentos\b/g, 'trezentas']];
/** O número que aparece na tela ("42", "14,29", "3.000") é dito na narração, em algarismos ou por extenso (com concordância de gênero)? */
export function numeroFalado(n, narracao) {
  const t = _SEM_ACENTO(narracao);
  const pedacos = String(n).replace(/\.(?=\d{3}(?!\d))/g, '').split(/[,.]/).filter(Boolean);
  return pedacos.every((p) => {
    if (new RegExp(`(?<![\\d])${p}(?![\\d])`).test(t)) return true;
    const v = Number(p); if (!Number.isInteger(v) || v < 0 || v >= 1e6) return true; // não sabe ler: não reprova
    const ext = _SEM_ACENTO(numeroPorExtenso(v));
    const variantes = new Set([ext, ext.replace('quatorze', 'catorze'), ext.replace('catorze', 'quatorze')]); // as duas grafias são corretas
    for (const e of [...variantes]) { let g = e; for (const [re, to] of _GENERO) g = g.replace(re, to); variantes.add(g); }
    return [...variantes].some(e => new RegExp(`(?<![a-z])${_escRe(e)}(?![a-z])`).test(t));
  });
}
/** Texto de tela tirado da própria fala: a primeira frase se couber (≤ 100 caracteres) ou o trecho até a última vírgula/palavra inteira, sem terminar em artigo/preposição. */
const _RE_CONECTOR_ABERTURA = /^(?:mas|por isso|com isso|nesse caso|nessa hip[óo]tese|na pr[áa]tica|ou seja|al[ée]m disso|j[áa]|assim|ent[ãa]o|portanto|dessa forma|desse modo|por outro lado|em resumo|vamos ver[^.!?]*[.!?])[,\s]+/i;
export function textoDaFala(narracao) {
  let bruto = String(narracao || '').trim().replace(_RE_CONECTOR_ABERTURA, '');
  bruto = bruto.charAt(0).toUpperCase() + bruto.slice(1);
  const frase = bruto.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '');
  if (frase.length <= 100) return frase;
  let corte = frase.slice(0, 100); const v = corte.lastIndexOf(','); if (v >= 40) corte = corte.slice(0, v); else corte = corte.slice(0, corte.lastIndexOf(' '));
  let pal = corte.split(/\s+/); while (pal.length > 3 && _FUNC_FIM.test(pal.join(' '))) pal.pop();
  return pal.join(' ');
}
const _RE_TIPO_NORMA = [[/s[úu]mula/i, /s[úu]mula/i], [/^\s*lei\b/i, /\blei\b/i], [/tema/i, /\btema\b/i], [/\bOJ\b|orienta/i, /\boj\b|orienta[cç][aã]o/i], [/\bart\b|artigo|CLT|CF\b|CC\b|CPC|ADCT/i, /\bartigo|\bclt\b|consolida[cç][aã]o|constitui[cç][aã]o|\bcf\b|c[óo]digo|\badct\b|\bcpc\b/i]];
/** O chip de norma só aparece na cena cuja narração fala dessa norma (pelo número ou pelo tipo: "a lei", "a súmula", "a CLT"). A IA espalhava a norma principal por todas as cenas:
 *  "Lei nº 12.506/2011" saiu sobre FGTS, desconto e término natural, e "Súmula 441" sobre 13º e férias (o artigo cita a Súmula 371 para isso). A capa lista as referências do vídeo e fica de fora. */
export function refsSoSeFaladas(r) {
  const reparos = [];
  (r.cenas || []).forEach((c, i) => {
    if (!c || !Array.isArray(c.refs) || !c.refs.length || ['capa', 'encerramento'].includes(c.tipo)) return;
    const nar = String(c.narracao || ''), narNorm = _SEM_ACENTO(nar);
    const mencionaNumero = (n) => {
      const limpo = n.replace(/\./g, '');
      if ([n, limpo].some(v => new RegExp(`(?<![\\d])${_escRe(v)}(?![\\d])`).test(nar))) return true;
      const v = Number(limpo); if (!Number.isInteger(v) || v >= 1e6) return false;
      return new RegExp(`(?<![a-z])${_escRe(_SEM_ACENTO(numeroPorExtenso(v)))}(?![a-z])`).test(narNorm);
    };
    const ok = c.refs.filter((ref) => {
      const nums = (String(ref).match(/\d[\d.]*/g) || []).map(n => n.replace(/\.+$/, '')).filter(n => n.length >= 2);
      return nums.some(mencionaNumero) || _RE_TIPO_NORMA.some(([naRef, naFala]) => naRef.test(ref) && naFala.test(nar));
    });
    if (ok.length !== c.refs.length) { reparos.push(`cena ${i + 1}: ${c.refs.length - ok.length} referência(s) de norma que a cena não menciona removida(s)`); c.refs = ok; }
  });
  return reparos;
}

/** Slides que só têm um título genérico ganham a frase que a voz diz; títulos repetidos em cenas seguidas são trocados. */
export function enriquecerSlidesFracos(r) {
  const reparos = [];
  const cenas = r.cenas || [];
  let anterior = '';
  cenas.forEach((c, i) => {
    if (!c || ['capa', 'encerramento'].includes(c.tipo)) { anterior = ''; return; }
    const nar = c.narracao || '';
    if (c.tipo === 'destaque' && (!c.sub || !String(c.sub).trim()) && nar) {
      const x = coberturaTelaNarracao(c.titulo || '', nar);
      if (!(x.total >= 2 && x.cobertura >= 0.67)) { c.sub = textoDaFala(nar) || ' '; reparos.push(`cena ${i + 1}: destaque só com título ganhou a frase que a voz diz`); }
    } else if (c.tipo === 'afirmacao' && nar && String(c.texto || '').trim().split(/\s+/).length <= 4) {
      const x = coberturaTelaNarracao(c.texto || '', nar);
      if (!(x.total >= 2 && x.cobertura >= 0.67)) { const tit = c.texto; const refs = Array.isArray(c.refs) ? c.refs : [], icone = c.icone || 'lu-info'; Object.keys(c).forEach(k => { if (k !== 'narracao') delete c[k]; }); Object.assign(c, { tipo: 'destaque', titulo: tit, sub: textoDaFala(nar) || ' ', icone, refs }); reparos.push(`cena ${i + 1}: afirmação de poucas palavras virou destaque com a frase que a voz diz`); }
    }
    const t = _SEM_ACENTO(c.titulo || c.texto || '').replace(/\s+/g, ' ').trim();
    if (t && t === anterior && nar) {
      const f = textoDaFala(nar); const virg = f.indexOf(',');
      let tit = virg >= 12 && f.slice(0, virg).split(/\s+/).length <= 8 ? f.slice(0, virg) : f.split(/\s+/).slice(0, 7).join(' ');
      let pal = tit.split(/\s+/); while (pal.length > 3 && _FUNC_FIM.test(pal.join(' '))) pal.pop(); tit = pal.join(' ');
      if (c.titulo !== undefined) { c.titulo = tit; if (c.tipo === 'destaque') c.sub = f.slice(tit.length).replace(/^[,;:\s]+/, '') || c.sub || ' '; reparos.push(`cena ${i + 1}: título igual ao da cena anterior trocado`); }
    }
    anterior = _SEM_ACENTO(c.titulo || c.texto || '').replace(/\s+/g, ' ').trim();
  });
  return reparos;
}

/** Cena de uma frase curta (< 8 palavras, ex.: "Vamos ver os elementos considerados pelo Tribunal.") fica só ~3 s na tela e é só ponte: vai para o começo da cena seguinte.
 *  Ajusta os capítulos (numeração das cenas). Não mexe na capa, na pergunta, no resumo nem no encerramento. */
export function juntarCenasCurtas(r) {
  const reparos = [];
  const cenas = r.cenas || [];
  for (let i = cenas.length - 4; i >= 1; i--) {
    const c = cenas[i], prox = cenas[i + 1];
    if (!c || !prox || ['capa', 'pergunta', 'encerramento'].includes(c.tipo) || ['encerramento'].includes(prox.tipo)) continue;
    const nar = String(c.narracao || '').trim();
    if (nar.split(/\s+/).filter(Boolean).length >= 8 || /\?\s*$/.test(nar)) continue;
    prox.narracao = `${nar} ${String(prox.narracao || '').trim()}`.trim();
    cenas.splice(i, 1);
    if (Array.isArray(r.capitulos)) r.capitulos.forEach(k => { if (Number(k.cena) - 1 > i) k.cena = Number(k.cena) - 1; });
    reparos.push(`cena ${i + 1}: frase curta de ponte ("${nar.slice(0, 40)}") juntada à cena seguinte`);
  }
  return reparos;
}

/** Short: uma segunda pergunta logo depois da pergunta da capa (cena 2) só atrasa a resposta (no Short do Tema 142 a resposta veio aos 14 s de 47 s). A fala dela vira o começo da cena seguinte. */
export function fundirPerguntaRepetida(r) {
  const cenas = r.cenas || [];
  if (cenas.length < 4 || !cenas[1] || cenas[1].tipo !== 'pergunta' || !cenas[2] || cenas[2].tipo === 'encerramento') return [];
  cenas[2].narracao = `${String(cenas[1].narracao || '').trim()} ${String(cenas[2].narracao || '').trim()}`.trim();
  cenas.splice(1, 1);
  if (Array.isArray(r.capitulos)) r.capitulos.forEach(k => { if (Number(k.cena) - 1 > 1) k.cena = Number(k.cena) - 1; });
  return ['cena 2: pergunta logo depois da pergunta da capa juntada à cena seguinte (Short)'];
}

/** Reparos nos slides "numero" que dependem do artigo: o selo "%" só vale se o artigo traz esse número em porcentagem (o vídeo da jornada de 42 h mostrava
 *  "21,43" com "%" para um valor de R$ 21,43), e valor em reais precisa dizer "reais" (o círculo só mostra o número). */
export function repararNumerosDaTela(r, textoArtigo) {
  const reparos = [];
  if (!textoArtigo) return reparos;
  (r.cenas || []).forEach((c, i) => {
    if (!c || c.tipo !== 'numero' || !c.numero) return;
    const n = String(c.numero).replace(/\s+/g, '');
    const v = [...new Set([n, n.replace('.', ','), n.replace(',', '.')])].map(_escRe).join('|');
    const emReais = new RegExp(`R\\$\\s*(?:${v})(?![\\d])`).test(textoArtigo);
    const emPct = new RegExp(`(?<![\\d])(?:${v})\\s*(?:%|por cento)`, 'i').test(textoArtigo);
    if (c.sufixo && /%/.test(c.sufixo) && !emPct) { delete c.sufixo; reparos.push(`cena ${i + 1}: selo "%" removido (o artigo não traz ${n} em porcentagem)`); }
    if (emReais && !/reais|R\$/i.test([c.prefixo, c.unidade, c.sufixo].filter(Boolean).join(' '))) {
      c.unidade = c.unidade ? `${String(c.unidade).trim()} em reais` : 'reais';
      reparos.push(`cena ${i + 1}: valor em reais sem a palavra "reais" → acrescentada à unidade`);
    }
  });
  return reparos;
}
/** Conteúdo de slide que a voz não sustenta é retirado, MAS nunca deixando o slide vazio: o que sobra é a própria fala (textoDaFala). Antes, itens/subtítulos "não falados"
 *  eram só apagados e a cena virava um cartão com o título ("Etapas da análise", "Impactos práticos", "Em resumo" sem os 3 itens): 13 de 19 slides do vídeo do Tema 142. */
export function alinharTelaComFala(r, { tipo = '' } = {}) {
  const reparos = [];
  const MIN_ITENS = { cards: 2, passos: 3, itens: 3 };
  (r.cenas || []).forEach((c, i) => {
    if (!c || typeof c !== 'object' || ['capa', 'encerramento', 'numero'].includes(c.tipo)) return;
    const nar = c.narracao || '';
    // Número "pesado" na tela (≥ 3 algarismos ou com vírgula/ponto) que a voz não diz é informação nova (a tela mostrava "44 h → 220" e "40 h → 200" e a voz só explicava a regra).
    // Números pequenos e ordinais ("1º", "§ 8º", "3") ficam de fora: a voz diz "primeiro", "oitavo"... e o radical não enxerga isso.
    const numerosOk = (t) => (String(t).match(/\d[\d.,]*\d|\d/g) || []).filter(n => /[.,]/.test(n) || n.length >= 3).every(n => numeroFalado(n, nar));
    const falado = (t) => { if (!numerosOk(t)) return false; const x = coberturaTelaNarracao(t, nar); return x.total < 2 || x.cobertura >= 0.3; }; // pouco conteúdo para medir: mantém
    const comoDestaque = (titulo, motivo) => {
      const refs = Array.isArray(c.refs) ? c.refs : [], icone = c.icone || 'lu-info', tipoAntigo = c.tipo;
      const tit = String(titulo || 'Em destaque').replace(/\s+/g, ' ').trim();
      Object.keys(c).forEach(k => { if (k !== 'narracao') delete c[k]; });
      Object.assign(c, { tipo: 'destaque', titulo: tit, sub: textoDaFala(nar) || ' ', icone, refs });
      reparos.push(`cena ${i + 1}: ${tipoAntigo} ${motivo}; virou destaque com a frase que a voz diz`);
    };

    // ---- DECISÃO ("pergunta-chave"). Nos vídeos analisados: a narração só fazia a pergunta, as respostas (Sim/Não) entravam na tela sem ninguém explicar (ou no último segundo
    // da cena) e a caixa azul destacava o "SIM" mesmo quando a resposta certa era "NÃO" ("A multa incide SÓ sobre o salário-base?" → SIM: "Todas as parcelas integram a base").
    // Só fica uma decisão que (a) não é Short, (b) tem pergunta sem "apenas/só/somente" (que inverte o sentido), (c) tem narração longa o bastante para explicar e (d) fala os DOIS ramos.
    if (c.tipo === 'decisao') {
      const perg = String(c.pergunta || '');
      const palavras = nar.trim().split(/\s+/).filter(Boolean).length;
      const ramo = (x) => coberturaTelaNarracao([x && x.titulo, x && x.texto].filter(Boolean).join(' '), nar);
      const cs = ramo(c.sim), cn = ramo(c.nao);
      const explicaDois = (cs.total < 2 || cs.cobertura >= 0.3) && (cn.total < 2 || cn.cobertura >= 0.3);
      let motivo = '';
      if (tipo === 'short') motivo = 'não se usa no Short';
      else if (/\b(?:apenas|somente|s[óo]|exclusivamente|unicamente)\b/i.test(perg)) motivo = 'pergunta com "apenas/só" inverte o sentido do Sim/Não';
      else if (palavras < 22) motivo = 'a narração só faz a pergunta (não explica os ramos)';
      else if (!explicaDois) motivo = 'a narração não fala os dois ramos';
      if (motivo) {
        if (/\?\s*$/.test(nar.trim()) && palavras <= 30) {
          const refs = Array.isArray(c.refs) ? c.refs : [];
          Object.keys(c).forEach(k => { if (k !== 'narracao') delete c[k]; });
          Object.assign(c, { tipo: 'pergunta', titulo: perg || textoDaFala(nar), refs });
          reparos.push(`cena ${i + 1}: decisão ${motivo}; virou slide de pergunta`);
        } else comoDestaque(perg || c.titulo, `decisão ${motivo}`);
        return;
      }
    }
    // Comparação cujo conteúdo a voz NÃO menciona em nada: vira destaque com o que a voz diz.
    if (c.tipo === 'comparacao') {
      const ramos = [c.esq, c.dir].map(x => [x && x.titulo, x && x.texto].filter(Boolean).join(' ')).join(' ');
      const cCab = coberturaTelaNarracao(c.titulo || '', nar), cRamos = coberturaTelaNarracao(ramos, nar);
      if ((c.titulo ? (cCab.total >= 2 && cCab.cobertura < 0.34) : true) && cRamos.total >= 2 && cRamos.cobertura < 0.2) { comoDestaque(c.titulo, 'comparação sem relação com a fala'); return; }
    }
    if (Array.isArray(c.chips)) {
      const ok = c.chips.filter(falado);
      if (ok.length !== c.chips.length) { reparos.push(`cena ${i + 1}: etiqueta(s) não faladas removida(s)`); if (ok.length >= 2) c.chips = ok; else delete c.chips; }
    }
    if (typeof c.sub === 'string' && c.sub.trim() && !falado(c.sub)) {
      if (c.tipo === 'destaque') { c.sub = textoDaFala(nar) || ' '; reparos.push(`cena ${i + 1}: subtítulo não falado trocado pela frase que a voz diz`); }
      else { c.sub = ' '; reparos.push(`cena ${i + 1}: subtítulo não falado removido`); }
    }
    for (const campo of ['cards', 'passos', 'itens']) {
      const lista = c[campo];
      if (!Array.isArray(lista)) continue;
      const ok = lista.filter(it => falado([it && it.titulo, it && it.texto].filter(Boolean).join(' ')));
      if (ok.length === lista.length) continue;
      if (ok.length >= MIN_ITENS[campo]) { c[campo] = ok; reparos.push(`cena ${i + 1}: ${lista.length - ok.length} item(ns) não falado(s) removido(s)`); }
      else { comoDestaque(c.titulo || (ok[0] && ok[0].titulo) || (lista[0] && lista[0].titulo) || 'Em resumo', 'itens não falados'); break; }
    }
  });
  return reparos;
}
const _CONECTORES_APOS_PERGUNTA = /^(?:mas|por isso|com isso|portanto|assim|então|por outro lado|al[ée]m disso|ou seja)\b[,\s]+/i;
/** Depois de uma pergunta de abertura a cena seguinte RESPONDE; conector que liga a "algo dito antes" (Mas…, Por isso…) fica sem sentido e é retirado. */
export function corrigirAberturaPergunta(cenas) {
  const reparos = [];
  for (let i = 1; i < (cenas || []).length; i++) {
    const ant = String((cenas[i - 1] && cenas[i - 1].narracao) || '').trim();
    const c = cenas[i];
    if (!c || !c.narracao || !/\?["”')\]]*$/.test(ant)) continue;
    const m = String(c.narracao).match(_CONECTORES_APOS_PERGUNTA);
    if (!m) continue;
    const resto = String(c.narracao).slice(m[0].length);
    c.narracao = resto.charAt(0).toUpperCase() + resto.slice(1);
    reparos.push(`cena ${i + 1}: conector "${m[0].trim()}" retirado (vinha logo depois de uma pergunta)`);
  }
  return reparos;
}
// ---------- FIDELIDADE: normas e números que a FALA cita precisam existir no artigo-fonte ----------
// Antes, só o texto de TELA e as "refs" eram conferidas contra o artigo; a narração podia citar "artigo 999" ou "Súmula 777" sem nenhum erro
// (no Short ilustrado a fala usa algarismos, e o RE_CITA_NORMA só reconhece numerais por extenso: a checagem nunca disparava).
const RE_NORMA_FALADA = /(?<![\p{L}])(?:artigos?|arts?\.?|s[úu]mulas?|s[úu]m\.?|temas?|oj|orienta[cç][aã]o jurisprudencial|lei complementar|lei|lc)\s+(?:(?:n[úu]meros?|n[ºo°]\.?)\s*)?(\d[\d.]*(?:\s*(?:,|e)\s*\d[\d.]*)*)/giu;
/** Normas citadas num texto falado: [{ trecho, numero }], um item por número ("artigos 468, 469 e 483" gera três). Números por extenso são lidos ("artigo quatrocentos e setenta e sete"). */
export function normasCitadas(texto) {
  const t = numerosParaTela(String(texto ?? ''));
  const out = [];
  for (const m of t.matchAll(RE_NORMA_FALADA)) {
    for (const n of m[1].split(/\s*(?:,|\se)\s*/)) {
      const numero = n.replace(/\.+$/, '').trim();
      if (numero) out.push({ trecho: m[0].trim(), numero });
    }
  }
  return out;
}
// ROTEIRO_NORMAS_ESTRITAS=0 rebaixa o erro a aviso (válvula de escape se a IA passar a reprovar demais por norma que o artigo cita de outro jeito).
export const NORMAS_ESTRITAS = process.env.ROTEIRO_NORMAS_ESTRITAS !== '0';
const _escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** O número ("477", "14,29", "1.200") aparece no artigo, como algarismo isolado ou por extenso? */
export function numeroNoArtigo(numero, textoArtigo) {
  const texto = String(textoArtigo ?? '');
  const n = String(numero ?? '').replace(/\s+/g, '');
  if (!n) return true;
  const variantes = [...new Set([n, n.replace('.', ','), n.replace(',', '.')])];
  if (variantes.some((v) => new RegExp(`(?<![\\d])${_escRe(v)}(?![\\d])`).test(texto))) return true;
  const inteiro = Number(n.replace(/\./g, '').replace(',', '.'));
  if (Number.isInteger(inteiro) && inteiro >= 0 && inteiro < 1e6) {
    const ext = numeroPorExtenso(inteiro);
    if (new RegExp(`(?<![\\p{L}])${_escRe(ext)}(?![\\p{L}])`, 'iu').test(texto)) return true;
  }
  return false;
}
/** Erros de fidelidade da narração de UMA cena (lista vazia = ok). Sem texto do artigo, não verifica. */
export function errosNormasNaNarracao(narracao, textoArtigo, n) {
  if (!textoArtigo) return [];
  return normasCitadas(narracao)
    .filter(({ numero }) => !numeroNoArtigo(numero, textoArtigo))
    .map(({ trecho, numero }) => `Cena ${n}: a narração cita "${trecho}", mas o número ${numero} NÃO está no artigo-fonte (cite só normas do artigo ou reescreva sem citar).`);
}

export const RE_JUNK_SEM_NUM = /\bn[úu]meros?\b|\bn\.?\s*[º°]|[*_`#~<>\[\]{}|\\]|\b(?:ali[aá]s|outrossim|destarte|ademais|porquanto)\b/i;
export const RE_NARRACAO_SUJA = /[0-9%]|R\$|\bn[úu]meros?\b|\bn\.?\s*[º°]|[*_`#~<>\[\]{}|\\]|\b(?:ali[aá]s|outrossim|destarte|ademais|porquanto)\b/i;
/** Converte dígitos, "R$", "%" e ordinais em palavras (pt-BR). Ex.: "R$ 1.200,50" → "mil e duzentos reais e cinquenta centavos". */
export function numerosPorExtenso(t, { manterNumeros = false } = {}) {
  let x = String(t ?? '');
  // Conectores raros que a voz sintética lê mal ("Aliás" saiu como "Elias"): troca por equivalentes comuns, mantendo a maiúscula inicial.
  const RAROS = { 'aliás': 'além disso', 'alias': 'além disso', 'outrossim': 'além disso', 'ademais': 'além disso', 'destarte': 'assim', 'porquanto': 'pois' };
  x = x.replace(/\b(ali[aá]s|outrossim|destarte|ademais|porquanto)\b/gi, (m) => { const r = RAROS[m.toLowerCase()] || m; return m[0] === m[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r; });
  // Marcadores/placeholders e formatação que a voz leria em voz alta ("*número*", "[número]", "**negrito**", "#"): somem.
  x = x.replace(/[*_`#~<>\[\]{}|]+\s*n[úu]meros?\s*[*_`#~<>\[\]{}|]+/gi, ' ').replace(/[*_`#~<>\[\]{}|\\]+/g, ' ');
  // "Tema número 171" / "Tema nº 171": a voz lê "número"; o natural é "Tema cento e setenta e um".
  x = x.replace(/\b(tema|s[úu]mula|artigos?|art\.?|lei|oj|orienta[çc][ãa]o jurisprudencial|precedente|inciso|par[áa]grafo)\s+(?:n[úu]meros?|n\.?\s*[º°o]\.?)\s+/gi, '$1 ');
  x = x.replace(/\bn(?:[úu]mero|\.?\s*[º°])\s*(?=\d)/gi, '');
  if (manterNumeros) return x.replace(/\s+/g, ' ').trim();
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
    if (c.tipo === 'numero' && !c.icone) erros.push(`Cena ${n}: numero precisa de "icone".`);
    if (c.tipo === 'grade' && Array.isArray(c.cards) && (c.cards.length < 2 || c.cards.length > 4 || c.cards.some(x => !x || !x.icone || !x.titulo))) erros.push(`Cena ${n}: grade precisa de 2 a 4 cartões com icone e titulo.`);
    if (c.tipo === 'passos' && Array.isArray(c.passos) && (c.passos.length < 3 || c.passos.length > 5 || c.passos.some(x => !x || !x.titulo))) erros.push(`Cena ${n}: passos precisa de 3 a 5 passos com titulo.`);
    if (c.tipo === 'decisao' && (!c.sim || !c.sim.titulo || !c.nao || !c.nao.titulo)) erros.push(`Cena ${n}: decisao precisa de sim e nao com titulo.`);
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
      if (!/[.!?…]["”')\]]*\s*$/.test(nar.trim())) erros.push(`Cena ${n}: a narração termina no meio da frase (feche com ponto, "?" ou "!").`);
      if (/^[a-zà-ÿ]/.test(nar.trim())) erros.push(`Cena ${n}: a narração começa em minúscula (continua a frase da cena anterior); cada cena é uma frase completa.`);
      if (RE_SEGUNDA.test(nar)) erros.push(`Cena ${n}: não use segunda pessoa na narração.`);
      if (ctx.tom === 'neutro' && RE_PARCIAL.test(nar)) avisos.push(`Cena ${n}: palavra parcial na narração (tom neutro).`);
      errosNormasNaNarracao(nar, textoArtigo, n).forEach(e => (NORMAS_ESTRITAS ? erros : avisos).push(e));
    }
    if (c.tipo === 'numero' && c.numero && textoArtigo && !numeroNoArtigo(c.numero, textoArtigo)) (NORMAS_ESTRITAS ? erros : avisos).push(`Cena ${n}: o número em destaque "${c.numero}" NÃO está no artigo-fonte (use só um número que o artigo traz).`);
    if (c.tipo === 'capa' && c.titulo) { const pt = String(c.titulo).replace(/\*\*/g, '').trim().split(/\s+/).length; if (pt > 9) erros.push(`Capa: "titulo" com ${pt} palavras (máx. 9): reescreva curto, em frase completa.`); }
    // texto de tela
    const telas = textosDeTela(c);
    telas.forEach(t => { if (RE_SEGUNDA.test(t)) erros.push(`Cena ${n}: não use segunda pessoa no texto da tela ("${t.slice(0, 40)}").`); });
    telas.forEach(t => { if (telaCortada(t)) (TELA_ESTRITA ? erros : avisos).push(`Cena ${n}: texto de tela cortado no meio da frase ("${String(t).slice(0, 50)}"): reescreva completo e curto.`); });
    if (c.tipo !== 'capa' && c.tipo !== 'encerramento' && c.tipo !== 'numero') {
      textosFalaveis(c).forEach(t => {
        const { total, cobertura } = coberturaTelaNarracao(t, c.narracao);
        if (total >= 3 && cobertura < 0.25) (TELA_ESTRITA ? erros : avisos).push(`Cena ${n}: a tela mostra "${String(t).slice(0, 50)}" mas a narração desta cena não menciona isso; narre o item ou tire-o da tela.`);
        else if (total >= 2 && cobertura < 0.5) avisos.push(`Cena ${n}: pouco do texto de tela "${String(t).slice(0, 40)}" aparece na narração.`);
      });
    }
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
    const ids = [c.icone, c.marca_dagua, c.esq && c.esq.icone, c.dir && c.dir.icone, ...(c.cards || []).map(x => x && x.icone), ...(c.itens || []).map(x => x.icone), ...(c.pontos || []).map(x => x.icone)].filter(Boolean);
    ids.forEach(id => { if (!idsOk(id)) erros.push(`Cena ${n}: ícone "${id}" não existe nas listas permitidas.`); usadosIcone[id] = (usadosIcone[id] || 0) + 1; });
    // comprimento de tela
    if (c.texto && String(c.texto).length > 130) erros.push(`Cena ${n}: texto de tela muito longo (${String(c.texto).length} > 130).`);
    if (i >= 2 && cenas[i - 1].tipo === c.tipo && cenas[i - 2].tipo === c.tipo) avisos.push(`Cena ${n}: 3 cenas seguidas do tipo "${c.tipo}" (só estética).`);
  });
  Object.entries(usadosIcone).forEach(([id, q]) => { if (q > 3) avisos.push(`Ícone ${id} usado ${q} vezes.`); });
  // variedade: afirmacao/destaque (frase + ícone) em excesso. Erro "suave": pede nova tentativa, mas não derruba o roteiro.
  const conteudo = cenas.filter(c => c.tipo !== 'capa' && c.tipo !== 'encerramento');
  const fracos = conteudo.filter(c => c.tipo === 'afirmacao' || c.tipo === 'destaque').length;
  const limite = Math.floor(conteudo.length * (tipo === 'longo' ? 0.4 : 0.5));
  const erroVariedade = conteudo.length >= 6 && fracos > limite ? `Variedade: ${fracos} de ${conteudo.length} cenas são afirmacao/destaque (máx. ${limite}). Troque algumas por decisao (teste sim/não), grade (requisitos/critérios), passos (etapas), comparacao, numero ou lista.` : null;
  // orçamento de palavras (encerramento tem CTA fixo de ~20 palavras)
  const total = palavras + PALAVRAS_CTA;
  const faixa = { min: m.min, max: m.max };
  let erroPalavras = null;
  if (total < faixa.min || total > faixa.max) {
    const n = Math.max(1, cenas.length - 1), media = Math.max(1, Math.round(palavras / n)), diff = Math.abs(m.palavras - total);
    const guia = total < faixa.min
      ? ` Escreva MAIS: faltam ~${diff} palavras. As ${cenas.length} cenas têm em média ${media} palavras; escreva ~${Math.ceil(diff / media)} cenas a mais OU alongue cada cena para ~${Math.round((m.palavras - 20) / n)} palavras.`
      : ` Escreva MENOS: sobram ~${diff} palavras. Corte ~${Math.round(diff / n)} palavras de cada cena ou remova ~${Math.ceil(diff / media)} cenas.`;
    erroPalavras = `Narração total com ${total} palavras; o alvo é ${m.palavras} (aceito ${faixa.min}–${faixa.max}).${guia}`;
  }
  return { erros, avisos, erroPalavras, erroVariedade, totalPalavras: total, metas: m };
}

export const CTA_FINAL = 'Para se aprofundar no assunto, leia o artigo completo no Calcula Prazo, com o link na descrição. E, se este conteúdo ajudou, inscreva-se no canal para acompanhar mais.';
export const PALAVRAS_CTA = CTA_FINAL.split(/\s+/).length;
