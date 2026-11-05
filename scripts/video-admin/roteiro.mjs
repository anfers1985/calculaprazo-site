// Etapa 1 — gera o roteiro em slides (cenas com narração + visual) a partir do artigo.
import { getJob, updateJob } from './lib/db.mjs';
import { lerArtigo } from './lib/artigo.mjs';
import { catalogoIcones, montarPrompt, validarRoteiro, repararRoteiro, extrairJson, CTA_FINAL } from './lib/roteiro-regras.mjs';
import { gerarRoteiroIlustrado } from './lib/roteiro-ilustrado.mjs';
import { costurarNarracao } from './lib/costura.mjs';
import { gerarTextoComFallback } from '../lib/ia-texto.mjs'; // somente leitura: reaproveita a cadeia de fallback (Gemini → OpenRouter → NVIDIA)

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
    const reparos = repararRoteiro(r, icones); // ícones antigos, narração em outro campo, 3 cenas iguais
    if (reparos.length) log(`  reparos automáticos (${reparos.length}): ${reparos.slice(0, 6).join(' | ')}`);
    const v = validarRoteiro(r, { tipo, durSeg, refsPermitidas, textoArtigo: artigo.texto, icones, tom });
    v.avisos.slice(0, 8).forEach(a => log('  aviso: ' + a));
    const todos = [...v.erros, ...(v.erroPalavras ? [v.erroPalavras] : []), ...(v.erroVariedade ? [v.erroVariedade] : [])];
    const validar = (x) => validarRoteiro(x, { tipo, durSeg, refsPermitidas, textoArtigo: artigo.texto, icones, tom });
    if (!todos.length) { r.modelo = modelo; const costurado = await costurarNarracao({ r, chamarIA, validar, tom, log, textoArtigo: artigo.texto }); return { roteiro: finalizarRoteiro(costurado, artigo), tentativas: tentativa, avisos: v.avisos }; }
    log(`  reprovado (${todos.length}): ${todos.slice(0, 6).join(' | ')}`);
    // guarda a melhor tentativa: só erro de contagem de palavras, dentro de ±30 %
    const desvio = v.erroPalavras ? Math.abs(v.totalPalavras - v.metas.palavras) / v.metas.palavras : 0;
    // melhor tentativa: sem erro grave; a contagem de palavras pode ficar até 45 % fora e a variedade pode estar fraca (erros "suaves")
    const nota = desvio + (v.erroVariedade ? 0.2 : 0);
    if (!v.erros.length && (!v.erroPalavras || desvio <= 0.45) && (!melhor || nota < melhor.nota)) melhor = { r, modelo, v, desvio, nota };
    motivo = todos.slice(0, 15).map(x => '- ' + x).join('\n');
  }
  if (melhor) { log('Usando a melhor tentativa (só a contagem de palavras e/ou a variedade de slides ficaram fora do ideal).'); melhor.r.modelo = melhor.modelo; const costurado = await costurarNarracao({ r: melhor.r, chamarIA, validar: (x) => validarRoteiro(x, { tipo, durSeg, refsPermitidas, textoArtigo: artigo.texto, icones, tom }), tom, log, textoArtigo: artigo.texto }); return { roteiro: finalizarRoteiro(costurado, artigo), tentativas: MAX_TENTATIVAS, avisos: [melhor.v.erroPalavras] }; }
  throw new Error(`A IA não gerou um roteiro válido em ${MAX_TENTATIVAS} tentativas. Último motivo:\n${motivo}`);
}

export async function etapaRoteiro(jobId) {
  const job = await getJob(jobId);
  await updateJob(jobId, { etapa_atual: 'roteiro' });
  const artigo = await lerArtigo(job.post_url);
  console.log(`Artigo: "${artigo.titulo}" — ${artigo.palavras} palavras; referências no texto: ${JSON.stringify(artigo.refs)}`);
  // Short ilustrado usa o roteiro próprio (narração + prompt de imagem por cena); o resto usa o roteiro em slides.
  const ilustrado = job.tipo === 'short' && job.estilo === 'ilustrado';
  const { roteiro, tentativas } = ilustrado
    ? await gerarRoteiroIlustrado({ artigo, durSeg: job.duracao_alvo_seg, tom: job.tom, chamarIA: gerarTextoComFallback })
    : await gerarRoteiroPara({ artigo, tipo: job.tipo, durSeg: job.duracao_alvo_seg, tom: job.tom, chamarIA: gerarTextoComFallback });
  roteiro.artigo_palavras = artigo.palavras;
  roteiro.tentativas = tentativas;
  await updateJob(jobId, { roteiro, post_titulo: artigo.titulo, status: 'roteiro_ok', erro_etapa: null, erro_mensagem: null });
  console.log(`Roteiro pronto: ${roteiro.cenas.length} cenas.`);
}
