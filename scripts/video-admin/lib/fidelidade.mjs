// Fidelidade da narração ao artigo-fonte: uma passada de CONFERÊNCIA pela IA depois da costura.
//
// Por que existe: as validações determinísticas só pegam número de norma/valor que não está no artigo (roteiro-regras.mjs). Elas não pegam o que a IA
// ACRESCENTA com palavras: nos vídeos analisados a fala trazia "antes do encerramento do vínculo" (recomendação prática que o artigo não faz) e
// "resulta de regras constitucionais de proteção ao trabalhador" (o artigo não diz isso). Também some ressalva ("quando presentes os requisitos").
//
// Como funciona: a IA recebe o artigo e as narrações e devolve só os trechos sem apoio no artigo, cada um com uma reescrita da cena inteira.
// A reescrita só é aplicada se passar na MESMA validação do roteiro e não mudar muito de tamanho; senão a narração original fica e o achado vai
// para roteiro.fidelidade (o admin e o log mostram). Falha "aberta": se a IA não responder ou responder fora do formato, o roteiro segue como estava.
//
// Env: ROTEIRO_FIDELIDADE=0 desliga.
import { extrairJson, numerosPorExtenso, numerosParaTela, TOM } from './roteiro-regras.mjs';

const MAX_PROBLEMAS = 4;

function textoCena(c, manterNumeros) {
  const t = String(c || '');
  return (manterNumeros ? numerosParaTela(numerosPorExtenso(t, { manterNumeros: true })) : numerosPorExtenso(t)).trim();
}

export async function verificarFidelidade({ r, chamarIA, validar, textoArtigo = '', tom, log = console.log, manterNumeros = false }) {
  if (process.env.ROTEIRO_FIDELIDADE === '0') return r;
  const cenas = r.cenas || [];
  const n = cenas.length - 1; // a última (encerramento) tem texto fixo
  if (n < 3 || !String(textoArtigo).trim()) return r;
  try {
    const originais = cenas.slice(0, n).map((c) => String(c.narracao || ''));
    const systemPrompt = [
      'Você é revisor jurídico de roteiros de vídeo educativo de Direito do Trabalho, em português do Brasil.',
      'Sua única tarefa é conferir se a NARRAÇÃO diz algo que o ARTIGO-FONTE não sustenta. Seja rigoroso, mas não implicante: reformular com outras palavras o que o artigo diz NÃO é problema.',
      TOM[tom] || TOM.neutro,
      'Responda SOMENTE com um objeto JSON válido (sem markdown e sem texto antes ou depois).',
    ].join('\n');
    const userPrompt = `ARTIGO-FONTE (única fonte de fatos permitida):
"""
${String(textoArtigo).slice(0, 14000)}
"""

NARRAÇÃO POR CENA (${n} cenas, na ordem):
${JSON.stringify(originais.map((t, i) => ({ cena: i + 1, narracao: t })), null, 1)}

TAREFA: aponte, no máximo ${MAX_PROBLEMAS}, os trechos da narração que:
(a) afirmam fato, número, prazo, valor, norma, órgão ou consequência que NÃO está no artigo;
(b) dão recomendação ou orientação prática ("a empresa deve…", "o trabalhador deve…", "antes de…") que o artigo não faz;
(c) tiram uma ressalva ou condição do artigo e, sem ela, o sentido jurídico muda (ex.: "quando presentes os requisitos", "em regra", "salvo…");
(d) atribuem a uma fonte (lei, tribunal, tese) algo que o artigo não atribui a ela.
Para cada um, devolva a cena INTEIRA reescrita em "correcao", só com fatos do artigo, com quase o mesmo tamanho (±25% das palavras), mantendo o conector de abertura e o encadeamento com as cenas vizinhas, em terceira pessoa, frase(s) completa(s) começando com maiúscula e terminando em ponto, "?" ou "!". ${manterNumeros ? 'Escreva números, artigos, leis, temas e prazos em ALGARISMOS ("Tema 176", "art. 227", "50%").' : 'Sem dígitos, "R$", "%" ou símbolos: tudo por extenso.'} Não crie perguntas novas.
Se a narração está fiel, devolva a lista vazia.

FORMATO: {"problemas":[{"cena":3,"trecho":"trecho exato da narração","motivo":"em uma frase, o que o artigo não sustenta","correcao":"narração completa da cena, corrigida"}]}`;
    const resp = await chamarIA({ systemPrompt, userPrompt, logPrefix: 'roteiro-fidelidade', rapido: true });
    const achados = extrairJson(resp.text)?.problemas;
    if (!Array.isArray(achados)) throw new Error('resposta sem a lista "problemas"');

    const copia = JSON.parse(JSON.stringify(r));
    const relatorio = [];
    for (const a of achados.slice(0, MAX_PROBLEMAS)) {
      const idx = Number(a?.cena) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= n) continue;
      const item = { cena: idx + 1, trecho: String(a.trecho || '').slice(0, 200), motivo: String(a.motivo || '').slice(0, 240), corrigida: false };
      relatorio.push(item);
      const nova = textoCena(a.correcao, manterNumeros);
      const antiga = String(copia.cenas[idx].narracao || '');
      const pa = antiga.split(/\s+/).length, pn = nova.split(/\s+/).length;
      if (nova.length < 8 || pn < pa * 0.6 || pn > pa * 1.5) { item.motivo_nao_aplicada = 'reescrita com tamanho muito diferente'; continue; }
      copia.cenas[idx].narracao = nova;
      const antes = validar(r), depois = validar(copia);
      // Fidelidade pesa mais que a meta de palavras: só recusa se a correção tirou o roteiro de uma faixa de palavras em que ele estava.
      const piorou = !antes.erroPalavras && !!depois.erroPalavras;
      if (depois.erros.length || piorou) { copia.cenas[idx].narracao = antiga; item.motivo_nao_aplicada = depois.erros.length ? `reprovada na validação: ${depois.erros[0]}` : 'tirou o roteiro da faixa de palavras'; continue; }
      item.corrigida = true;
    }
    copia.fidelidade = { verificadas: n, apontados: relatorio.length, corrigidos: relatorio.filter((x) => x.corrigida).length, problemas: relatorio };
    if (!relatorio.length) log(`  fidelidade ao artigo: ${n} cenas conferidas, nada a corrigir.`);
    else {
      log(`  fidelidade ao artigo: ${relatorio.length} trecho(s) sem apoio no artigo, ${copia.fidelidade.corrigidos} corrigido(s).`);
      relatorio.forEach((x) => log(`    cena ${x.cena}: "${x.trecho.slice(0, 90)}" — ${x.motivo}${x.corrigida ? ' [corrigido]' : ` [mantido: ${x.motivo_nao_aplicada || 'sem correção válida'}]`}`));
    }
    return copia;
  } catch (e) {
    log(`  conferência de fidelidade ignorada (${String(e.message).slice(0, 160)}); mantendo o roteiro.`);
    return r;
  }
}

/** Repetição de ideias entre cenas: devolve o TEXTO de retorno para a IA regenerar o roteiro (ou '' se não há repetição). Falha aberta.
 *  Nos vídeos analisados, 4 das 9 cenas de conteúdo do Short do Tema 143 repetiam a mesma tese ("o atraso não gera dano moral automático; é preciso provar lesão")
 *  enquanto pontos do artigo (fundamentos legais, data do julgamento, efeito prático) ficaram de fora. Não se corrige no lugar: trocar a narração de uma cena
 *  descolaria a imagem/slide dela, então o roteiro inteiro é pedido de novo, com este retorno. Env: ROTEIRO_REPETICAO=0 desliga. */
export async function verificarRepeticao({ r, chamarIA, textoArtigo = '', log = console.log }) {
  if (process.env.ROTEIRO_REPETICAO === '0') return '';
  const cenas = r.cenas || [];
  const n = cenas.length - 1;
  if (n < 5 || !String(textoArtigo).trim()) return '';
  try {
    const narr = cenas.slice(0, n).map((c, i) => ({ cena: i + 1, narracao: String(c.narracao || '') }));
    const systemPrompt = 'Você é editor de roteiros de vídeo educativo de Direito do Trabalho, em português do Brasil. Responda SOMENTE com um objeto JSON válido (sem markdown e sem texto antes ou depois).';
    const userPrompt = `ARTIGO-FONTE:
"""
${String(textoArtigo).slice(0, 12000)}
"""

NARRAÇÃO POR CENA:
${JSON.stringify(narr)}

TAREFA: dizer se há cenas que repetem a MESMA ideia com outras palavras (cada cena deve trazer informação nova) e quais pontos relevantes do artigo ficaram de fora.
Considere repetição só quando a segunda cena não acrescenta fato, condição, fundamento ou consequência novos. Retomar a conclusão no fim, em uma frase, não conta.
FORMATO: {"repeticoes":[{"cenas":[3,8],"ideia":"a ideia repetida, em uma frase"}],"faltou":["ponto relevante do artigo que não aparece, em uma frase (no máximo 3)"]}
Se não há repetição, devolva {"repeticoes":[],"faltou":[]}.`;
    const resp = await chamarIA({ systemPrompt, userPrompt, logPrefix: 'roteiro-repeticao', rapido: true });
    const j = extrairJson(resp.text);
    const reps = (Array.isArray(j?.repeticoes) ? j.repeticoes : []).filter((x) => Array.isArray(x?.cenas) && x.cenas.length >= 2).slice(0, 3);
    if (!reps.length) { log('  repetição de ideias: nenhuma encontrada.'); return ''; }
    const faltou = (Array.isArray(j?.faltou) ? j.faltou : []).map((x) => String(x).slice(0, 200)).slice(0, 3);
    const texto = `Na tentativa anterior, cenas repetiam a mesma ideia: ${reps.map((x) => `cenas ${x.cenas.join(' e ')} (${String(x.ideia || '').slice(0, 160)})`).join('; ')}. Cada cena precisa trazer informação NOVA e continuar a anterior. Refaça o roteiro completo sem repetir${faltou.length ? ', aproveitando pontos do artigo que ficaram de fora: ' + faltou.map((x) => '- ' + x).join(' ') : ''}.`;
    log(`  repetição de ideias: ${reps.length} caso(s) — ${reps.map((x) => `cenas ${x.cenas.join('+')}`).join(', ')}; pedindo novo roteiro.`);
    return texto;
  } catch (e) {
    log(`  checagem de repetição ignorada (${String(e.message).slice(0, 160)}).`);
    return '';
  }
}
