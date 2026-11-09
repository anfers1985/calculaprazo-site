// Revisão dos TEXTOS DE TELA (slides) por IA: português e rótulos genéricos. Falha "aberta": se a IA não responder bem, os slides seguem como estavam.
//
// Por que existe: nenhuma etapa lia o português do que aparece na tela. Nos vídeos analisados saíram "Estabilidade da gestante no experiência" (capa),
// "Nova limite semanal pela Emenda Constitucional 141" (slide) e vários slides que só trazem um rótulo de categoria ("Impactos práticos", "Análise do
// tribunal", "Fundamento no artigo 64 da CLT") enquanto a voz diz a informação de verdade.
//
// Segurança: cada correção passa por um portão determinístico (mesma marcação **, tamanho, números que já estavam ou que a voz/o artigo dizem, e, se for
// reescrita e não só ajuste de português, o texto novo tem de sair da narração da própria cena) e pela MESMA validação do roteiro. Env: ROTEIRO_REVISAO_TELA=0 desliga.
import { extrairJson, coberturaTelaNarracao, numeroFalado, numeroNoArtigo } from './roteiro-regras.mjs';

const IGNORAR = new Set(['tipo', 'icone', 'estilo', 'selo', 'centro', 'refs', 'narracao', 'numero', 'sufixo', 'marca_dagua', 'painel', 'botao', 'artigo', 'url_exibida', 'modelo']);
const MAX_CAMPOS = 90, MAX_CORRECOES = 8;

/** Campos de texto de tela de todas as cenas (menos o encerramento, que é fixo): [{ id, caminho, valor, cena, tipo }]. */
export function camposDeTela(r) {
  const out = [];
  const walk = (v, caminho, cena, tipo) => {
    if (typeof v === 'string') { const t = v.trim(); if (t.length >= 3 && !/^[\d\s.,%R$]+$/.test(t)) out.push({ id: caminho.join('.'), caminho, valor: v, cena, tipo }); }
    else if (Array.isArray(v)) v.forEach((x, k) => walk(x, [...caminho, k], cena, tipo));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!IGNORAR.has(k)) walk(x, [...caminho, k], cena, tipo); });
  };
  (r.cenas || []).forEach((c, i) => { if (c && c.tipo !== 'encerramento') Object.entries(c).forEach(([k, x]) => { if (!IGNORAR.has(k)) walk(x, ['cenas', i, k], i + 1, c.tipo); }); });
  return out;
}
const ler = (r, caminho) => caminho.reduce((o, k) => (o == null ? o : o[k]), r);
const gravar = (r, caminho, valor) => { const pai = ler(r, caminho.slice(0, -1)); if (pai) pai[caminho[caminho.length - 1]] = valor; };
const _norm = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Distância de edição normalizada (0 = igual, 1 = totalmente diferente): separa "ajuste de português" de "reescrita". */
export function distanciaRelativa(a, b) {
  const x = _norm(a), y = _norm(b); if (!x.length && !y.length) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) { const cur = [i]; for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = cur; }
  return prev[y.length] / Math.max(x.length, y.length, 1);
}

export async function revisarTextosDeTela({ r, chamarIA, validar, textoArtigo = '', log = console.log }) {
  if (process.env.ROTEIRO_REVISAO_TELA === '0') return r;
  try {
    const campos = camposDeTela(r).slice(0, MAX_CAMPOS);
    if (campos.length < 3) return r;
    const narr = (r.cenas || []).map((c, i) => ({ cena: i + 1, tipo: c.tipo, narracao: String(c.narracao || '') }));
    const systemPrompt = 'Você é revisor de português do Brasil e editor de infográficos de vídeo jurídico. Responda SOMENTE com um objeto JSON válido (sem markdown e sem texto antes ou depois).';
    const userPrompt = `Abaixo estão os TEXTOS QUE APARECEM NA TELA de um vídeo e a NARRAÇÃO de cada cena.

NARRAÇÃO POR CENA:
${JSON.stringify(narr)}

TEXTOS DE TELA (id, cena, tipo, texto):
${JSON.stringify(campos.map((c) => ({ id: c.id, cena: c.cena, tipo: c.tipo, texto: c.valor })))}

TAREFA: devolva correções SÓ para textos que:
(1) tenham erro de português: ortografia, concordância de gênero/número ("Nova limite" → "Novo limite"), preposição+artigo errados ("no experiência" → "na experiência"/"no contrato de experiência"), palavra cortada ou frase que termina no meio;
(2) sejam apenas um RÓTULO GENÉRICO de categoria, sem informação ("Impactos práticos", "Análise do tribunal", "Fundamento no artigo 64 da CLT"), em cena de tipo afirmacao, destaque ou citacao: reescreva como a mensagem específica daquela cena, em até 9 palavras, usando SÓ o que a narração DESSA cena diz.
Regras: mantenha a marcação **destaque** quando existir; não invente fatos nem números; não mexa em texto que já está correto e informativo; no máximo ${MAX_CORRECOES} correções.
FORMATO: {"correcoes":[{"id":"cenas.3.titulo","texto":"texto corrigido","motivo":"em poucas palavras"}]}  (lista vazia se nada precisa mudar).`;
    const resp = await chamarIA({ systemPrompt, userPrompt, logPrefix: 'roteiro-revisao-tela', rapido: true });
    const lista = extrairJson(resp.text)?.correcoes;
    if (!Array.isArray(lista)) throw new Error('resposta sem a lista "correcoes"');

    const copia = JSON.parse(JSON.stringify(r));
    const porId = new Map(campos.map((c) => [c.id, c]));
    const feitas = [];
    for (const k of lista.slice(0, MAX_CORRECOES)) {
      const campo = porId.get(String(k?.id));
      const novo = String(k?.texto ?? '').trim();
      if (!campo || !novo || novo === campo.valor.trim() || /[\n\r]/.test(novo)) continue;
      const nar = String(copia.cenas[campo.cena - 1]?.narracao || '');
      const motivoNao = (() => {
        if ((novo.match(/\*\*/g) || []).length !== (campo.valor.match(/\*\*/g) || []).length) return 'marcação ** diferente';
        if (novo.length > Math.max(campo.valor.length * 1.6, campo.valor.length + 28)) return 'texto muito maior que o original';
        const numerosNovos = (novo.match(/\d[\d.,]*/g) || []).map((n) => n.replace(/[.,]+$/, ''));
        const antigos = new Set((campo.valor.match(/\d[\d.,]*/g) || []).map((n) => n.replace(/[.,]+$/, '')));
        if (numerosNovos.some((n) => !antigos.has(n) && !numeroFalado(n, nar) && !numeroNoArtigo(n, textoArtigo))) return 'número que não estava na tela, na fala nem no artigo';
        if (distanciaRelativa(campo.valor, novo) > 0.35) { const cob = coberturaTelaNarracao(novo, nar); if (cob.total >= 2 && cob.cobertura < 0.5) return 'reescrita que não sai da narração da cena'; }
        return '';
      })();
      const item = { id: campo.id, de: campo.valor, para: novo, motivo: String(k?.motivo || '').slice(0, 120), aplicada: false };
      feitas.push(item);
      if (motivoNao) { item.nao_aplicada = motivoNao; continue; }
      const antes = validar(copia).erros.length;
      gravar(copia, campo.caminho, novo);
      if (validar(copia).erros.length > antes) { gravar(copia, campo.caminho, campo.valor); item.nao_aplicada = 'reprovada na validação do roteiro'; continue; }
      item.aplicada = true;
    }
    copia.revisao_tela = { campos: campos.length, propostas: feitas.length, aplicadas: feitas.filter((x) => x.aplicada).length, itens: feitas };
    if (!feitas.length) log(`  revisão dos textos de tela: ${campos.length} textos conferidos, nada a corrigir.`);
    else {
      log(`  revisão dos textos de tela: ${feitas.length} proposta(s), ${copia.revisao_tela.aplicadas} aplicada(s).`);
      feitas.forEach((x) => log(`    ${x.id}: "${x.de.slice(0, 60)}" → "${x.para.slice(0, 60)}"${x.aplicada ? ' [aplicada]' : ` [mantido: ${x.nao_aplicada}]`}`));
    }
    return copia;
  } catch (e) {
    log(`  revisão dos textos de tela ignorada (${String(e.message).slice(0, 160)}); mantendo os slides.`);
    return r;
  }
}
