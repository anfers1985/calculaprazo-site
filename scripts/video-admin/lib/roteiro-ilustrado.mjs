// Roteiro do Short ILUSTRADO (estilo do vídeo de referência: uma ilustração por cena + legenda em blocos).
// Sem acesso ao banco: roda no GitHub Actions e também no computador local.
import { polirNarracao } from './roteiro-core.mjs'; // costura + conferência de fidelidade ao artigo
import { verificarRepeticao } from './fidelidade.mjs';
import { extrairJson, COESAO_PROMPT, TOM, RE_SEGUNDA, RE_DIGITOS, RE_NARRACAO_SUJA, numerosPorExtenso, numerosParaTela, RE_JUNK_SEM_NUM, filtrarRefs, corrigirAberturaPergunta, RE_PARCIAL, PALAVRAS_POR_SEG, CTA_FINAL, PALAVRAS_CTA, ctaFinal, errosNormasNaNarracao, numeroNoArtigo, NORMAS_ESTRITAS } from './roteiro-regras.mjs';
import { normRef } from './artigo.mjs';

const MAX_TENTATIVAS = 3;
const SEG_POR_CENA = 5.5; // referência: ~12 ilustrações em 66 s

// Estilo visual FIXO (em inglês, porque os geradores de imagem respondem melhor). Vai em TODAS as imagens
// para o Short ficar com cara de série. É a "identidade" do canal: mexa aqui para mudar o visual.
export const ESTILO_IMAGEM =
  'Hand-drawn editorial illustration, loose ink linework with soft watercolor fills, warm muted palette ' +
  '(cream, mustard yellow, dusty blue, terracotta, sage green), slightly textured paper feel. ' +
  'The main subject is isolated like a die-cut sticker with a thick off-white outline and a soft drop shadow, ' +
  'on a plain flat off-white background (#F7F2E4). One clear focal subject, simple uncluttered composition, ' +
  'vertical 9:16 framing, subject centered with generous margins. No watermark, no logo, no brand names, no real people.';

export const PROMPT_IMAGEM_FINAL =
  'A hand holding a modern smartphone whose screen shows a clean website page with a big colorful button, ' +
  'a cursor arrow clicking the button, a few colorful paper scraps and highlighter strokes behind the phone';
export const TEXTO_IMAGEM_FINAL = 'CALCULA PRAZO';

export function metasIlustrado(durSeg) {
  const palavras = Math.round(durSeg * PALAVRAS_POR_SEG);
  const alvoCenas = Math.max(5, Math.round(durSeg / SEG_POR_CENA));
  return { palavras, min: Math.round(palavras * 0.85), max: Math.round(palavras * 1.15), cenasMin: Math.max(5, Math.round(alvoCenas * 0.7)), cenasMax: Math.round(alvoCenas * 1.35), alvoCenas };
}

/** Texto do pedido de imagem que realmente vai para o gerador (estilo fixo + cena + regra de texto). */
const RE_PESSOA_NO_PROMPT = /\b(?:man|woman|person|people|worker|employee|employer|character|boy|girl|manager|boss|lawyer|judge|clerk|guard|sweeper|driver|nurse|doctor|pregnant|he|she)\b/i;
export function montarPromptImagem(cena, personagem = '') {
  const texto = String(cena.texto_na_imagem || '').trim();
  // O prompt manda copiar a descrição do "personagem" em toda cena com pessoa, mas nada garantia isso: o mesmo Short mostrou um homem ruivo de camisa amarela,
  // depois um barbudo de óculos e depois outro de gravata vermelha. Se a cena fala de uma pessoa e a descrição não está no pedido, ela é acrescentada aqui.
  const perso = String(personagem || '').trim();
  const pedido = String(cena.prompt_imagem || '').trim();
  const chave = perso.toLowerCase().slice(0, 24);
  const comPessoa = perso && cena.tipo !== 'encerramento' && RE_PESSOA_NO_PROMPT.test(pedido) && !pedido.toLowerCase().includes(chave);
  const cenaTexto = comPessoa ? `${pedido} The person in the scene is: ${perso.replace(/[.\s]+$/, '')}.` : pedido;
  const regraTexto = texto
    ? `The ONLY text visible in the image reads exactly "${texto}" (Brazilian Portuguese, clean capital letters, no other text, letters or numbers anywhere).`
    : 'No text, letters, numbers or signs with writing anywhere in the image.';
  return `${ESTILO_IMAGEM} Scene: ${cenaTexto} ${regraTexto}`.replace(/\s+/g, ' ').trim();
}

export function montarPromptIlustrado({ artigo, durSeg, tom, refsPermitidas, motivoRetentativa }) {
  const m = metasIlustrado(durSeg);
  const porCena = Math.max(8, Math.round((m.palavras - 26) / Math.max(1, m.alvoCenas - 1)));
  const systemPrompt = [
    'Você é roteirista dos Shorts ilustrados do canal "Calcula Prazo — Direto ao Ponto". Escreve em português do Brasil, em TERCEIRA PESSOA, com linguagem clara, ritmo rápido e profissional.',
    'Seu roteiro é FIEL ao artigo-fonte: não acrescente fatos, números, prazos, valores, artigos de lei, súmulas ou decisões que não estejam no artigo. Se algo não está no artigo, não existe.',
    TOM[tom] || TOM.neutro,
    'Nunca use a segunda pessoa (você, vocês, seu, sua). Não dê aconselhamento individual, não prometa resultado e não use sensacionalismo.',
    'Responda SOMENTE com um objeto JSON válido (sem markdown, sem comentários, sem texto antes ou depois).',
  ].join('\n');

  const userPrompt = `ARTIGO-FONTE (título: ${artigo.titulo})
"""
${artigo.texto.slice(0, 30000)}
"""

REFERÊNCIAS LEGAIS PERMITIDAS (use EXATAMENTE estas strings no campo "refs" da cena que citar a norma): ${refsPermitidas.length ? JSON.stringify(refsPermitidas) : '[] (o artigo não cita normas: não cite nenhuma norma na narração)'}

OBJETIVO: Short vertical (9:16) ILUSTRADO de ${Math.round(durSeg)} segundos. Cada cena é UMA ilustração desenhada à mão que fica na tela enquanto a narração é falada, com legenda em blocos curtos.
- Narração total: entre ${m.min} e ${m.max} palavras (alvo ${m.palavras}; a voz fala ~${PALAVRAS_POR_SEG} palavras por segundo).
- Número de cenas: entre ${m.cenasMin} e ${m.cenasMax} (alvo ${m.alvoCenas}); ORÇAMENTO: cada cena (exceto a última) tem de ${Math.max(5, porCena - 4)} a ${porCena + 4} palavras (média ${porCena}), em 1 frase curta, ou 2 muito curtas. NÃO passe de ${porCena + 6} palavras em nenhuma cena: o total estouraria o limite. Some as palavras antes de responder e corte o que passar de ${m.max}.
- Cena 1 é o GANCHO: pergunta ou situação que prende a atenção nos primeiros segundos, sem sensacionalismo. A última cena é o encerramento (a narração dela será substituída por um convite para ler o artigo; escreva só "encerramento" nela).
- ${COESAO_PROMPT}
- Na narração, escreva números, artigos, leis, temas, prazos e porcentagens em ALGARISMOS ("Tema 176", "art. 227 da CLT", "LC 150/2015", "25 horas", "50%", "3,2%"): a legenda e as etiquetas mostram o texto como escrito e a voz lê por extenso sozinha. Nunca use "R$" solto, símbolos, nem a palavra "número"/"nº" antes de tema, súmula ou artigo ("Tema 176", não "Tema número…").
- Cada cena é uma frase (ou duas) COMPLETA: começa com maiúscula e termina com ponto, "?" ou "!". Nunca divida uma frase entre duas cenas (a voz fecha a entonação no fim de cada cena).
- Se a narração de uma cena citar artigo de lei, súmula, tema ou lei, liste a norma em "refs" dessa cena (apenas as permitidas acima). Cena sem citação: "refs": [].
- ASSUNTO VISUAL: antes de escrever, identifique o assunto CONCRETO do artigo (a atividade, o local, os objetos e as pessoas de que ele fala; ex.: varrição de ruas → gari, vassoura, calçada, lixo, uniforme, luvas) e use-o para ilustrar a maioria das cenas (pelo menos 2 de cada 3). Cada imagem deve mostrar algo que a narração DAQUELA cena diz; nunca ilustre com uma balança, martelo ou pilha de livros genéricos quando a cena fala de uma situação concreta. Símbolos jurídicos (balança, martelo, documento) só nas poucas cenas que falam da lei ou do tribunal.
- Use no máximo duas cenas com a pessoa (o "personagem"), no ambiente do assunto; as demais mostram objetos e lugares do assunto ou, quando a cena for sobre a norma ou o tribunal, um símbolo jurídico.

PEDIDO DE IMAGEM (campo "prompt_imagem", SEMPRE EM INGLÊS, 1 a 2 frases): descreva APENAS o assunto e a ação da ilustração (o estilo visual é aplicado automaticamente). Uma ideia visual por cena, concreta e desenhável, que combine com o que a narração diz. Cite no prompt os substantivos concretos da narração (ex.: "a street sweeper with a broom on a city sidewalk"). NÃO peça itens com escrita legível (calendário com mês, placa, página de livro, tela de celular, documento com texto, carimbo, selo, etiqueta, "law book", "final judgment"): o gerador ESCREVE no desenho as palavras que aparecem no pedido (saiu "Law" e "FINAL JUDGEMEON" assim): a IA escreve letras erradas ou em inglês; peça o item sem texto ou deixe-o de fora. Sem pessoas reais, sem logotipos, sem marcas. Se houver uma pessoa, copie literalmente a descrição do "personagem" definido abaixo para ela ficar igual em todas as cenas.
INFORMAÇÃO EM CIMA DA ILUSTRAÇÃO (a ilustração sozinha não informa; estes campos fazem o vídeo ensinar): "rotulos" (opcional, de 1 a 2 termos-chave da cena, até 3 palavras cada, ex.: ["Mais de dois dias", "Subordinação"]) aparecem como post-its no momento em que a narração os menciona; use as MESMAS palavras da narração, na mesma ordem. "numero_destaque" (opcional, só quando a cena traz um número-chave que está NO ARTIGO): {"valor":"2","unidade":"dias por semana"}, aparece como carimbo com contagem. Use rótulos em pelo menos 2 de cada 3 cenas e numero_destaque no máximo 2 vezes no vídeo.
VARIEDADE VISUAL: alterne os planos nos pedidos de imagem (um plano aberto do ambiente, um plano médio da ação, um close de um detalhe) e não repita a mesma composição em cenas seguidas.
Texto dentro da imagem (campo opcional "texto_na_imagem"): só quando ajuda muito (ex.: "CONTRATO", "ERRO", "PRAZO"); em português, MAIÚSCULAS, no máximo 3 palavras e sem números. Na dúvida, omita.

CAMPOS DE PUBLICAÇÃO: "titulo_seo" (≤ 70 caracteres, em pergunta/benefício, sem clickbait), "descricao" (2 a 3 frases informativas), "hashtags" (3 a 5, começando com #), "personagem" (descrição em inglês, 1 frase, de um personagem fixo: idade aproximada, cabelo, roupa).

FORMATO DE SAÍDA:
{"titulo_seo":"…","descricao":"…","hashtags":["#…"],"personagem":"…","cenas":[{"narracao":"…","prompt_imagem":"…","texto_na_imagem":"opcional","rotulos":["termo-chave"],"numero_destaque":{"valor":"2","unidade":"dias por semana"},"refs":[]}, …]}
${motivoRetentativa ? `\nATENÇÃO — a tentativa anterior foi REPROVADA pelos motivos abaixo. Corrija TODOS:\n${motivoRetentativa}\n` : ''}`;
  return { systemPrompt, userPrompt, metas: m };
}

const NUMERAIS = '(?:um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)';
const RE_CITA_NORMA = new RegExp(`(?<![\\p{L}])(?:artigos?|s[úu]mulas?|temas?|orienta[cç][aã]o jurisprudencial|lei(?:\\s+complementar)?)\\s+(?:(?:n[úu]mero|n[ºo°])\\s*)?${NUMERAIS}(?![\\p{L}])`, 'iu');

export function validarIlustrado(r, ctx) {
  const { durSeg, refsPermitidas, tom, textoArtigo } = ctx;
  const m = metasIlustrado(durSeg);
  const erros = [], avisos = [];
  if (!r || typeof r !== 'object') return { erros: ['Resposta não é um objeto.'], avisos };
  if (!r.titulo_seo || String(r.titulo_seo).length > 100) erros.push('titulo_seo ausente ou > 100 caracteres.');
  if (!r.descricao) erros.push('descricao ausente.');
  if (!Array.isArray(r.hashtags) || r.hashtags.length < 2) erros.push('hashtags: informe de 3 a 5.');
  const cenas = r.cenas;
  if (!Array.isArray(cenas) || !cenas.length) return { erros: [...erros, 'cenas ausentes.'], avisos };
  if (cenas.length < m.cenasMin || cenas.length > m.cenasMax) erros.push(`Número de cenas ${cenas.length} fora do intervalo ${m.cenasMin}–${m.cenasMax}.`);
  const permitidas = new Set(refsPermitidas.map(normRef));
  let palavras = 0;
  cenas.forEach((c, i) => {
    const n = i + 1;
    const ultima = i === cenas.length - 1;
    if (!c || typeof c !== 'object') { erros.push(`Cena ${n}: formato inválido.`); return; }
    const nar = String(c.narracao || '');
    if (!ultima) {
      const w = (nar.match(/\S+/g) || []).length;
      palavras += w;
      if (w < 5) erros.push(`Cena ${n}: narração curta demais.`);
      if (w > 45) erros.push(`Cena ${n}: narração longa demais (${w} palavras; máx. 45).`);
      if (!/[.!?…]["”')\]]*\s*$/.test(nar.trim())) erros.push(`Cena ${n}: a narração termina no meio da frase (feche com ponto, "?" ou "!").`);
      if (/^[a-zà-ÿ]/.test(nar.trim())) erros.push(`Cena ${n}: a narração começa em minúscula (continua a frase da cena anterior); cada cena é uma frase completa.`);
      if (RE_SEGUNDA.test(nar)) erros.push(`Cena ${n}: não use segunda pessoa na narração.`);
      if (tom === 'neutro' && RE_PARCIAL.test(nar)) avisos.push(`Cena ${n}: palavra parcial na narração (tom neutro).`);
      errosNormasNaNarracao(nar, textoArtigo, n).forEach(e => (NORMAS_ESTRITAS ? erros : avisos).push(e)); // a fala usa algarismos aqui: o RE_CITA_NORMA (só por extenso) nunca pegava norma inventada
      const pi = String(c.prompt_imagem || '').trim();
      if (pi.length < 20) erros.push(`Cena ${n}: "prompt_imagem" ausente ou curto demais (escreva em inglês, 1 a 2 frases).`);
      if (pi.length > 700) erros.push(`Cena ${n}: "prompt_imagem" longo demais (máx. 700 caracteres).`);
    }
    const t = String(c.texto_na_imagem || '').trim();
    if (t) {
      if (/\d/.test(t)) erros.push(`Cena ${n}: "texto_na_imagem" não pode ter números.`);
      if ((t.match(/\S+/g) || []).length > 3 || t.length > 24) erros.push(`Cena ${n}: "texto_na_imagem" deve ter no máximo 3 palavras (24 caracteres).`);
    }
    const refs = Array.isArray(c.refs) ? c.refs : [];
    refs.forEach(rf => { if (!permitidas.has(normRef(rf))) erros.push(`Cena ${n}: referência "${rf}" não está entre as permitidas.`); });
    if (refs.length > 3) erros.push(`Cena ${n}: no máximo 3 refs.`);
    if (!ultima && RE_CITA_NORMA.test(nar) && !refs.length) erros.push(`Cena ${n}: a narração cita uma norma, mas "refs" está vazio (liste a norma permitida ou reescreva sem citar).`);
  });
  const total = palavras + PALAVRAS_CTA; // encerramento tem CTA fixo
  let erroPalavras = null;
  if (total < m.min || total > m.max) erroPalavras = `Narração total com ${total} palavras; o alvo é ${m.palavras} (aceito ${m.min}–${m.max}).${total < m.min ? ' Escreva MAIS.' : ' Escreva MENOS.'}`;
  return { erros, avisos, erroPalavras, totalPalavras: total, metas: m };
}

export function finalizarIlustrado(r) {
  const cenas = r.cenas;
  const ult = cenas[cenas.length - 1];
  ult.narracao = ctaFinal(true);
  ult.tipo = 'encerramento';
  ult.prompt_imagem = PROMPT_IMAGEM_FINAL;
  ult.texto_na_imagem = TEXTO_IMAGEM_FINAL;
  ult.refs = [];
  delete ult.rotulos; delete ult.numero_destaque; // a IA põe etiqueta na cena final (saiu "Jurisprudência" sobre o convite); a fala do convite não a menciona
  cenas.forEach((c, i) => { if (i < cenas.length - 1) c.tipo = i === 0 ? 'gancho' : 'ilustracao'; });
  r.personagem = String(r.personagem || '').trim();
  return r;
}

export async function gerarRoteiroIlustrado({ artigo, durSeg, tom, chamarIA, log = console.log }) {
  const refsPermitidas = artigo.refs;
  let motivo = '';
  let melhor = null;
  let reserva = null; // roteiro válido que repetia ideias: só é usado se as tentativas seguintes não derem outro válido
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const { systemPrompt, userPrompt } = montarPromptIlustrado({ artigo, durSeg, tom, refsPermitidas, motivoRetentativa: motivo });
    log(`Roteiro ilustrado — tentativa ${tentativa}/${MAX_TENTATIVAS} (${durSeg}s, tom ${tom})`);
    let r, modelo = '';
    try {
      const resp = await chamarIA({ systemPrompt, userPrompt, logPrefix: 'roteiro-ilustrado' });
      modelo = resp.modeloUsado || '';
      r = extrairJson(resp.text);
    } catch (e) { motivo = `A resposta anterior não foi um JSON válido (${e.message}). Responda apenas com o objeto JSON completo.`; log(motivo); continue; }
    (r.cenas || []).forEach(c => { if (c && typeof c === 'object' && !c.narracao) { const alt = c['narração'] ?? c.narration ?? c.fala ?? c.locucao; if (alt) c.narracao = String(alt); } });
    // reparos determinísticos: números da narração por extenso; "texto_na_imagem" com número é descartado (a legenda do vídeo já mostra o texto)
    (r.cenas || []).forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      if (c.narracao) { let n0 = String(c.narracao); if (RE_JUNK_SEM_NUM.test(n0)) n0 = numerosPorExtenso(n0, { manterNumeros: true }); const n1 = numerosParaTela(n0); if (n1 !== c.narracao) { c.narracao = n1; log(`  reparo: cena ${i + 1}, números da narração em algarismos (a voz lê por extenso)`); } }
      if (Array.isArray(c.rotulos)) c.rotulos = c.rotulos.map((x) => (typeof x === 'string' ? numerosParaTela(x) : x));
      if (c.texto_na_imagem && /\d/.test(String(c.texto_na_imagem))) { log(`  reparo: cena ${i + 1}, "texto_na_imagem" com número descartado`); delete c.texto_na_imagem; }
    });
    // rótulos e número em destaque: só texto curto e válido; o que não servir é descartado (são enfeite informativo, não motivo para reprovar)
    (r.cenas || []).forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      if (Array.isArray(c.rotulos)) {
        c.rotulos = c.rotulos.filter((x) => typeof x === 'string' && x.trim()).map((x) => { const t = x.replace(/[*_`#]/g, '').trim(); return t.length > 28 ? t.split(/\s+/).slice(0, 3).join(' ') : t; }).slice(0, 2);
        if (!c.rotulos.length) delete c.rotulos;
      } else if (c.rotulos !== undefined) delete c.rotulos;
      const nd = c.numero_destaque;
      if (nd !== undefined) {
        const valor = nd && typeof nd === 'object' ? String(nd.valor ?? '').replace(/\s+/g, '') : '';
        if (/^\d{1,4}([.,]\d{1,2})?$/.test(valor) && numeroNoArtigo(valor, artigo.texto)) c.numero_destaque = { valor, unidade: String(nd.unidade || '').split(/\s+/).slice(0, 4).join(' ') };
        else { if (valor) log(`  reparo: cena ${i + 1}, número em destaque "${valor}" descartado (inválido ou fora do artigo)`); delete c.numero_destaque; }
      }
    });
    [...filtrarRefs(r, refsPermitidas), ...corrigirAberturaPergunta(r.cenas)].forEach(x => log('  reparo: ' + x));
    const v = validarIlustrado(r, { durSeg, refsPermitidas, tom, textoArtigo: artigo.texto });
    v.avisos.slice(0, 8).forEach(a => log('  aviso: ' + a));
    const todos = [...v.erros, ...(v.erroPalavras ? [v.erroPalavras] : [])];
    const validar = (x) => validarIlustrado(x, { durSeg, refsPermitidas, tom, textoArtigo: artigo.texto });
    if (!todos.length) {
      r.modelo = modelo;
      if (tentativa < MAX_TENTATIVAS) { const rep = await verificarRepeticao({ r, chamarIA, textoArtigo: artigo.texto, log }); if (rep) { reserva = reserva || { r, modelo, v }; motivo = rep; continue; } }
      const costurado = await polirNarracao({ r, chamarIA, validar, tom, log, textoArtigo: artigo.texto, manterNumeros: true });
      return { roteiro: finalizarIlustrado(costurado), tentativas: tentativa, avisos: v.avisos };
    }
    log(`  reprovado (${todos.length}): ${todos.slice(0, 6).join(' | ')}`);
    const desvio = v.erroPalavras ? Math.abs(v.totalPalavras - v.metas.palavras) / v.metas.palavras : 0;
    if (!v.erros.length && v.erroPalavras && desvio <= 0.45 && (!melhor || desvio < melhor.desvio)) melhor = { r, modelo, v, desvio };
    motivo = todos.slice(0, 15).map(x => '- ' + x).join('\n');
  }
  if (reserva) {
    log('Usando o roteiro válido da tentativa com repetição de ideias (as seguintes não produziram outro válido).');
    reserva.r.modelo = reserva.modelo;
    const costurado = await polirNarracao({ r: reserva.r, chamarIA, validar: (x) => validarIlustrado(x, { durSeg, refsPermitidas, tom, textoArtigo: artigo.texto }), tom, log, textoArtigo: artigo.texto, manterNumeros: true });
    return { roteiro: finalizarIlustrado(costurado), tentativas: MAX_TENTATIVAS, avisos: reserva.v.avisos };
  }
  if (melhor) { log('Usando a melhor tentativa (só a contagem de palavras ficou fora da faixa ideal).'); melhor.r.modelo = melhor.modelo; const costurado = await polirNarracao({ r: melhor.r, chamarIA, validar: (x) => validarIlustrado(x, { durSeg, refsPermitidas, tom, textoArtigo: artigo.texto }), tom, log, textoArtigo: artigo.texto, manterNumeros: true }); return { roteiro: finalizarIlustrado(costurado), tentativas: MAX_TENTATIVAS, avisos: [melhor.v.erroPalavras] }; }
  throw new Error(`A IA não gerou um roteiro ilustrado válido em ${MAX_TENTATIVAS} tentativas. Último motivo:\n${motivo}`);
}
