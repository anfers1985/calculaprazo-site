// Núcleo da geração de roteiro em slides — SEM acesso ao banco, para poder rodar também no computador local.
import { catalogoIcones, montarPrompt, validarRoteiro, extrairJson, CTA_FINAL } from './roteiro-regras.mjs';

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

export async function gerarRoteiroPara({ artigo, tipo, durSeg, tom, chamarIA, log = console.log }) {
  const icones = catalogoIcones();
  const refsPermitidas = artigo.refs;
  let motivo = '';
  let melhor = null;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const { systemPrompt, userPrompt } = montarPrompt({ artigo, tipo, durSeg, tom, refsPermitidas, icones, motivoRetentativa: motivo });
    log(`Roteiro — tentativa ${tentativa}/${MAX_TENTATIVAS} (${tipo}, ${durSeg}s, tom ${tom})`);
    let r, modelo = '';
    try {
      const resp = await chamarIA({ systemPrompt, userPrompt, logPrefix: 'roteiro-slides' });
      modelo = resp.modeloUsado || '';
      r = extrairJson(resp.text);
    } catch (e) { motivo = `A resposta anterior não foi um JSON válido (${e.message}). Responda apenas com o objeto JSON completo.`; log(motivo); continue; }
    const v = validarRoteiro(r, { tipo, durSeg, refsPermitidas, textoArtigo: artigo.texto, icones, tom });
    v.avisos.slice(0, 8).forEach(a => log('  aviso: ' + a));
    const todos = [...v.erros, ...(v.erroPalavras ? [v.erroPalavras] : [])];
    if (!todos.length) { r.modelo = modelo; return { roteiro: finalizarRoteiro(r, artigo), tentativas: tentativa, avisos: v.avisos }; }
    log(`  reprovado (${todos.length}): ${todos.slice(0, 6).join(' | ')}`);
    // guarda a melhor tentativa: só erro de contagem de palavras, dentro de ±30 %
    if (!v.erros.length && v.erroPalavras && Math.abs(v.totalPalavras - v.metas.palavras) / v.metas.palavras <= 0.3) melhor = { r, modelo, v };
    motivo = todos.slice(0, 15).map(x => '- ' + x).join('\n');
  }
  if (melhor) { log('Usando a melhor tentativa (só a contagem de palavras ficou fora da faixa ideal).'); melhor.r.modelo = melhor.modelo; return { roteiro: finalizarRoteiro(melhor.r, artigo), tentativas: MAX_TENTATIVAS, avisos: [melhor.v.erroPalavras] }; }
  throw new Error(`A IA não gerou um roteiro válido em ${MAX_TENTATIVAS} tentativas. Último motivo:\n${motivo}`);
}
