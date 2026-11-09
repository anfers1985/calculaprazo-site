// Núcleo da geração de roteiro em slides — SEM acesso ao banco, para rodar no GitHub Actions E no computador local (app do computador).
// FONTE ÚNICA: roteiro.mjs (etapa do GitHub) importa daqui. Antes havia duas cópias divergentes: esta, sem os reparos automáticos, sem a costura da
// narração e sem a escolha da "melhor tentativa", e a de roteiro.mjs. Quem usasse a cópia antiga (o cabeçalho dizia que ela era para o app do computador,
// que não veio no ZIP e por isso não foi verificado) geraria roteiros piores que os do GitHub.
import { catalogoIcones, montarPrompt, validarRoteiro, repararRoteiro, filtrarRefs, alinharTelaComFala, repararNumerosDaTela, extrairJson, CTA_FINAL } from './roteiro-regras.mjs';
import { costurarNarracao } from './costura.mjs';
import { verificarFidelidade, verificarRepeticao } from './fidelidade.mjs';
import { revisarTextosDeTela } from './revisao-tela.mjs';

const MAX_TENTATIVAS = 3;

export function finalizarRoteiro(r, artigo) {
  const cenas = r.cenas;
  const ult = cenas[cenas.length - 1];
  ult.narracao = CTA_FINAL;
  ult.titulo = 'Leia o artigo completo';
  ult.sub = 'no link da descrição';
  ult.botao = 'calculaprazo.com.br';
  ult.artigo = { url_exibida: artigo.urlExibida, categoria: ['Início', 'Conteúdo', artigo.categoria].filter(Boolean).join(' › '), titulo: artigo.titulo, autor: `Por ${artigo.autor}`, data: artigo.data ? `Publicado em: ${artigo.data}` : '', resumo: artigo.resumo };
  const primeira = cenas[0];
  if (Array.isArray(primeira.refs)) primeira.refs = primeira.refs.slice(0, 3);
  return r;
}

/** Costura (fluência entre cenas) + conferência de fidelidade ao artigo + (só slides) revisão do português e dos rótulos genéricos da tela.
 *  Todas falham "abertas": se algo der errado, o roteiro entra como estava. */
export async function polirNarracao({ r, chamarIA, validar, tom, log, textoArtigo, manterNumeros = false, revisarTela = false }) {
  const costurado = await costurarNarracao({ r, chamarIA, validar, tom, log, textoArtigo, manterNumeros });
  const fiel = await verificarFidelidade({ r: costurado, chamarIA, validar, tom, log, textoArtigo, manterNumeros });
  return revisarTela ? revisarTextosDeTela({ r: fiel, chamarIA, validar, textoArtigo, log }) : fiel;
}

export async function gerarRoteiroPara({ artigo, tipo, durSeg, tom, chamarIA, log = console.log }) {
  const icones = catalogoIcones();
  const refsPermitidas = artigo.refs;
  const validar = (x) => validarRoteiro(x, { tipo, durSeg, refsPermitidas, textoArtigo: artigo.texto, icones, tom });
  let motivo = '';
  let melhor = null;
  let reserva = null; // roteiro válido que repetia ideias: só é usado se as tentativas seguintes não derem outro válido
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const { systemPrompt, userPrompt } = montarPrompt({ artigo, tipo, durSeg, tom, refsPermitidas, icones, motivoRetentativa: motivo });
    log(`Roteiro — tentativa ${tentativa}/${MAX_TENTATIVAS} (${tipo}, ${durSeg}s, tom ${tom})`);
    let r, modelo = '';
    try {
      const resp = await chamarIA({ systemPrompt, userPrompt, logPrefix: 'roteiro-slides' });
      modelo = resp.modeloUsado || '';
      r = extrairJson(resp.text);
    } catch (e) { motivo = `A resposta anterior não foi um JSON válido (${e.message}). Responda apenas com o objeto JSON completo.`; log(motivo); continue; }
    const reparos = repararRoteiro(r, icones); // ícones antigos, narração em outro campo, 3 cenas iguais, decisão sim/não trocada
    reparos.push(...filtrarRefs(r, refsPermitidas), ...alinharTelaComFala(r), ...repararNumerosDaTela(r, artigo.texto)); // referência fora das permitidas e tela que a voz não diz: consertados, não reprovados
    if (reparos.length) log(`  reparos automáticos (${reparos.length}): ${reparos.slice(0, 6).join(' | ')}`);
    const v = validar(r);
    v.avisos.slice(0, 8).forEach(a => log('  aviso: ' + a));
    const todos = [...v.erros, ...(v.erroPalavras ? [v.erroPalavras] : []), ...(v.erroVariedade ? [v.erroVariedade] : [])];
    if (!todos.length) {
      r.modelo = modelo;
      if (tentativa < MAX_TENTATIVAS) { const rep = await verificarRepeticao({ r, chamarIA, textoArtigo: artigo.texto, log }); if (rep) { reserva = reserva || { r, modelo, v }; motivo = rep; continue; } }
      const pronto = await polirNarracao({ r, chamarIA, validar, tom, log, textoArtigo: artigo.texto, revisarTela: true }); return { roteiro: finalizarRoteiro(pronto, artigo), tentativas: tentativa, avisos: v.avisos };
    }
    log(`  reprovado (${todos.length}): ${todos.slice(0, 6).join(' | ')}`);
    // melhor tentativa: sem erro grave; a contagem de palavras pode ficar até 45 % fora e a variedade pode estar fraca (erros "suaves")
    const desvio = v.erroPalavras ? Math.abs(v.totalPalavras - v.metas.palavras) / v.metas.palavras : 0;
    const nota = desvio + (v.erroVariedade ? 0.2 : 0);
    if (!v.erros.length && (!v.erroPalavras || desvio <= 0.45) && (!melhor || nota < melhor.nota)) melhor = { r, modelo, v, desvio, nota };
    motivo = todos.slice(0, 15).map(x => '- ' + x).join('\n');
  }
  if (reserva) {
    log('Usando o roteiro válido da tentativa com repetição de ideias (as seguintes não produziram outro válido).');
    reserva.r.modelo = reserva.modelo;
    const pronto = await polirNarracao({ r: reserva.r, chamarIA, validar, tom, log, textoArtigo: artigo.texto, revisarTela: true });
    return { roteiro: finalizarRoteiro(pronto, artigo), tentativas: MAX_TENTATIVAS, avisos: reserva.v.avisos };
  }
  if (melhor) {
    log('Usando a melhor tentativa (só a contagem de palavras e/ou a variedade de slides ficaram fora do ideal).');
    melhor.r.modelo = melhor.modelo;
    const pronto = await polirNarracao({ r: melhor.r, chamarIA, validar, tom, log, textoArtigo: artigo.texto, revisarTela: true });
    return { roteiro: finalizarRoteiro(pronto, artigo), tentativas: MAX_TENTATIVAS, avisos: [melhor.v.erroPalavras] };
  }
  throw new Error(`A IA não gerou um roteiro válido em ${MAX_TENTATIVAS} tentativas. Último motivo:\n${motivo}`);
}
