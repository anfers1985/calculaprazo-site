// Testes de regressão do pipeline de vídeos do admin (sem rede, sem banco, sem chaves):  node scripts/video-admin/testes/regressao.mjs
// Cada caso reproduz um defeito visto nos vídeos/log analisados na auditoria de nov/2026.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const BLOG = path.join(LIB, '..', '..', '..', 'blog');
const imp = (f) => import(path.join(LIB, f));
const R = await imp('roteiro-regras.mjs'), I = await imp('roteiro-ilustrado.mjs'), C = await imp('cena.mjs'), A = await imp('ia-imagem.mjs'), F = await imp('fidelidade.mjs');
const { parseArtigo } = await imp('artigo.mjs');
const RT = await imp('revisao-tela.mjs');

let ok = 0, falhas = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : falhas++; console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra ? ' — ' + extra : ''}`); };
const artigo = 'O Tema 143 do TST... multa do artigo 477, § 8º, da CLT. Lei Complementar 150/2015. R$ 14,29 e 4,76%. Tema 163. artigo 10, II. dois dias por semana. Julgado em 2025.';

console.log('== Legendas em blocos (Short ilustrado)');
t('"art." não fica sozinho na tela', !C.dividirEmBlocos('E o que isso significa para a multa do art. 477 da CLT?').includes('art.'));
t('"Súm." e "inc." não terminam bloco', C.dividirEmBlocos('Vale o inc. II do art. 10 e a Súm. 244 do TST.').every((b) => !/(?:inc|art|Súm)\.$/.test(b)));
t('fimDeFrase: abreviação não, ponto final sim', !C.fimDeFrase('art.') && !C.fimDeFrase('J.') && C.fimDeFrase('CLT?') && C.fimDeFrase('2025.'));
{ const b = C.temporizarBlocos(['um dois', 'três quatro.'], 10, 16, 4); t('legenda usa a duração real da fala (fala_seg)', Math.abs(b[b.length - 1].t1 - 16) < 1e-6 && b[0].t1 < 12.6, JSON.stringify(b.map((x) => [x.t0, x.t1]))); }

console.log('== Validação de fidelidade (fala × artigo)');
t('norma inventada em algarismos é detectada', R.errosNormasNaNarracao('Segundo o art. 999 da CLT e a Súmula 777 do TST.', artigo, 4).length === 2);
t('norma do artigo passa', R.errosNormasNaNarracao('Segundo o art. 477 da CLT e o Tema 143.', artigo, 1).length === 0);
t('norma inventada por extenso é detectada', R.errosNormasNaNarracao('Segundo o artigo novecentos e noventa e nove da consolidação.', artigo, 1).length === 1);
t('LC 150 por extenso passa', R.errosNormasNaNarracao('Pela Lei Complementar cento e cinquenta, vale.', artigo, 1).length === 0);
t('número fora do artigo é detectado (21,43 ausente)', !R.numeroNoArtigo('21,43', artigo) && R.numeroNoArtigo('14,29', artigo) && R.numeroNoArtigo('2', artigo));
const mk = (nar) => ({ titulo_seo: 't', descricao: 'd', hashtags: ['#a', '#b', '#c'], cenas: Array.from({ length: 11 }, (_, i) => ({ narracao: i === 3 ? nar : 'O tribunal decidiu que o atraso isolado não basta para gerar a indenização.', prompt_imagem: 'a worker with a broom on a city sidewalk', refs: [] })) });
t('Short ilustrado: norma inventada na fala reprova o roteiro', I.validarIlustrado(mk('Segundo o art. 999 da CLT, o prazo muda para todos os casos tratados aqui.'), { durSeg: 60, refsPermitidas: [], tom: 'neutro', textoArtigo: artigo }).erros.some((e) => /999/.test(e)));
for (const [slug, srt] of [['tema-143-tst-atraso-verbas-rescisorias-dano-moral'], ['tema-163-tst-estabilidade-gestante-contrato-experiencia']]) {
  const f = path.join(BLOG, slug + '.html');
  if (!fs.existsSync(f)) continue;
  const a = parseArtigo(fs.readFileSync(f, 'utf8'), 'u/' + slug);
  t(`sem falso positivo em frases do próprio artigo (${slug.slice(0, 12)})`, R.errosNormasNaNarracao(a.texto.split(/(?<=\.)\s/).filter((x) => /art|tema/i.test(x)).slice(0, 12).join(' '), a.texto, 1).length === 0);
}

console.log('== Telas');
const ic = R.catalogoIcones();
const dec = (sim, nao) => ({ cenas: [{ tipo: 'decisao', narracao: 'x', pergunta: 'Há redução salarial com a nova jornada?', sim, nao, refs: [] }, { tipo: 'encerramento', narracao: 'x' }] });
{ const r = dec({ titulo: 'Não', texto: 'a' }, { titulo: 'Sim', texto: 'b' }); R.repararRoteiro(r, ic); t('decisão com ramos trocados é corrigida (etiqueta SIM sobre título "Não")', r.cenas[0].tipo === 'decisao' && r.cenas[0].sim.titulo === 'Sim'); }
{ const r = dec({ titulo: 'Não', texto: 'a' }, { titulo: 'Vale a regra', texto: 'b' }); R.repararRoteiro(r, ic); t('decisão com um só ramo incoerente vira destaque', r.cenas[0].tipo === 'destaque'); }
{ const r = dec({ titulo: 'Reconhecida', texto: 'a' }, { titulo: 'Afastada', texto: 'b' }); R.repararRoteiro(r, ic); t('decisão coerente não muda', r.cenas[0].tipo === 'decisao' && r.cenas[0].sim.titulo === 'Reconhecida'); }
{ const f = I.finalizarIlustrado({ cenas: [{ narracao: 'a?' }, { narracao: 'x', rotulos: ['Jurisprudência'], numero_destaque: { valor: '3', unidade: 'dias' } }] }); t('cena final não herda etiqueta nem carimbo (saiu "Jurisprudência" sobre o convite)', !f.cenas[1].rotulos && !f.cenas[1].numero_destaque); }

console.log('== Imagens');
{ const per = 'A man in his 40s with short gray hair, round glasses and a navy sweater';
  t('personagem é injetado quando a cena tem pessoa', I.montarPromptImagem({ prompt_imagem: 'A man reads a document at a desk.' }, per).includes('round glasses'));
  t('não injeta sem pessoa nem duplica', !I.montarPromptImagem({ prompt_imagem: 'A wooden gavel.' }, per).includes('round glasses') && (I.montarPromptImagem({ prompt_imagem: per + ' reads a file.' }, per).match(/round glasses/g) || []).length === 1); }
t('"statute" e "calendar" não chegam ao gerador (viravam "STATUTE" e "DAIM" na imagem)', !/statute|calendar/i.test(A.limparPalavrasQueViramTexto('An open statute book and a wall calendar on a desk.')));
{ // cota diária esgotada: 5 chamadas (1 por provedor) em vez de 55 (11 cenas × 5), e mensagem que diz a causa
  Object.assign(process.env, { CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: 't', GEMINI_API_KEY: 'k1', GEMINI_API_KEY_2: 'k2', IMG_ORDEM: 'cloudflare,gemini', IMG_INTERVALO_MS: '0' });
  let n = 0; const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url) => { n++; const cf = String(url).includes('cloudflare'); return new Response(JSON.stringify(cf ? { success: false, errors: [{ code: 4006, message: 'AiError: you have used up your daily free allocation of 10,000 neurons' }] } : { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', details: [{ violations: [{ quotaMetric: 'x/free_tier_requests', quotaValue: '0' }] }] } }), { status: 429, headers: { 'content-type': 'application/json' } }); };
  A._resetarEsgotados();
  let msg = '';
  try { await A.gerarImagensDoRoteiro({ cenas: Array.from({ length: 11 }, (_, i) => ({ p: i })), montarPrompt: (c) => 'x' + c.p, dir: path.join(process.env.TMPDIR || '/tmp', 'img-teste'), log: () => {} }); } catch (e) { msg = e.message; }
  globalThis.fetch = fetchOriginal;
  t('cota esgotada: para na 1ª cena, 5 chamadas (não 55)', n === 5, `chamadas=${n}`);
  t('cota esgotada: a mensagem do job diz a causa', /Cota diária de imagens esgotada/.test(msg) && /4006/.test(msg) && /limite 0/.test(msg));
}

console.log('== Conferência de fidelidade (IA simulada)');
{ const cenas = [...Array.from({ length: 5 }, (_, i) => ({ tipo: 'afirmacao', narracao: `Cena ${i + 1} com texto suficiente para passar no tamanho mínimo exigido pelo validador.` })), { tipo: 'encerramento', narracao: 'x' }];
  const validar = () => ({ erros: [], totalPalavras: 100, metas: { palavras: 100 } });
  const nova = 'Na prática, é preciso verificar também a existência da gravidez e a incidência da garantia prevista na norma.';
  const ia = async () => ({ text: JSON.stringify({ problemas: [{ cena: 3, trecho: 'x', motivo: 'o artigo não diz isso', correcao: nova }] }) });
  const out = await F.verificarFidelidade({ r: { cenas }, chamarIA: ia, validar, tom: 'neutro', log: () => {}, textoArtigo: 'artigo qualquer' });
  t('correção de fidelidade aplicada e registrada', out.cenas[2].narracao === nova && out.fidelidade.corrigidos === 1);
  const falha = await F.verificarFidelidade({ r: { cenas }, chamarIA: async () => { throw new Error('fora do ar'); }, validar, tom: 'neutro', log: () => {}, textoArtigo: 'artigo qualquer' });
  t('falha da IA: roteiro segue intacto (falha aberta)', falha.cenas[2].narracao === cenas[2].narracao && !falha.fidelidade);
}

console.log('== Tela × fala (revisão 2: cenas reais do vídeo da jornada de 42 h)');
{ const r = { cenas: [
    { tipo: 'decisao', narracao: 'Essa estabilidade na remuneração nominal resulta de regras constitucionais de proteção ao trabalhador.', pergunta: 'Há redução salarial com a nova jornada?', sim: { titulo: 'Sim', texto: 'Apenas para horas reduzidas' }, nao: { titulo: 'Não', texto: 'Salário mensal permanece igual' }, refs: [] },
    { tipo: 'grade', narracao: 'O divisor mensal é obtido multiplicando a jornada semanal por cinco, conforme os parâmetros aplicáveis ao regime geral.', titulo: 'Cálculo do divisor', cards: [{ icone: 'lu-clock', titulo: '44 horas', texto: 'Divisor 220' }, { icone: 'lu-calculator', titulo: '42 horas', texto: 'Divisor 210' }, { icone: 'lu-trending-up', titulo: '40 horas', texto: 'Divisor 200' }], refs: [] },
    { tipo: 'numero', narracao: 'A hora extra com adicional de cinquenta por cento corresponderá a vinte e um reais e quarenta e três centavos.', numero: '21,43', prefixo: 'Hora extra de', unidade: '50%', sufixo: '%', icone: 'lu-clock', refs: [] },
    { tipo: 'decisao', narracao: 'A gestante tem garantia de emprego no contrato de experiência? Sim, o Tribunal Superior do Trabalho reconheceu que a proteção constitucional se aplica também a esse contrato por prazo determinado. Já a ideia de que o prazo pré-estabelecido elimina a garantia foi afastada pelo Pleno.', pergunta: 'Garantia de emprego na experiência?', sim: { titulo: 'Reconhecida', texto: 'A proteção constitucional se aplica' }, nao: { titulo: 'Afastada', texto: 'O prazo pré-estabelecido elimina' }, refs: [] },
    { tipo: 'grade', narracao: 'Para uma jornada de quarenta e duas horas semanais, o divisor proporcional utilizado como referência será duzentos e dez.', titulo: 'Divisores', cards: [{ icone: 'lu-clock', titulo: '42 horas', texto: 'Divisor 210' }, { icone: 'lu-calculator', titulo: 'Referência', texto: 'Jornada semanal proporcional' }], refs: [] }] };
  R.alinharTelaComFala(r); R.repararNumerosDaTela(r, 'A hora extra de R$ 21,43 com adicional de 50%. R$ 14,29. 210.');
  t('decisão que a voz não menciona em nada vira destaque com a frase da fala', r.cenas[0].tipo === 'destaque' && /estabilidade/i.test(r.cenas[0].sub));
  t('grade com números (44/220/40/200) que a voz não diz vira destaque com a frase da fala (nunca só o título)', r.cenas[1].tipo === 'destaque' && /divisor mensal/i.test(r.cenas[1].sub));
  t('"%" em valor de R$ é removido e "reais" entra na unidade', r.cenas[2].sufixo === undefined && /reais/.test(r.cenas[2].unidade));
  t('decisão cuja narração faz a pergunta e explica os dois ramos é mantida', r.cenas[3].tipo === 'decisao');
  t('números falados por extenso (42 → "quarenta e duas") são aceitos', r.cenas[4].tipo === 'grade' && r.cenas[4].cards.length === 2);
  t('numeroFalado: gênero, decimais e catorze/quatorze', R.numeroFalado('42', 'quarenta e duas horas') && R.numeroFalado('14,29', 'catorze reais e vinte e nove centavos') && R.numeroFalado('14', 'quatorze') && !R.numeroFalado('220', 'multiplicar por cinco'));
}
console.log('== Revisão dos textos de tela (IA simulada)');
{ const mkR = () => ({ cenas: [{ tipo: 'capa', narracao: 'A gestante tem garantia de emprego durante o contrato de experiência?', titulo: 'Estabilidade da gestante no experiência', sub: 'Tema 163 do TST', pontos: [{ texto: 'Proteção legal' }, { texto: 'Tribunal Pleno' }, { texto: 'Prazo determinado' }] },
      { tipo: 'destaque', narracao: 'Na prática, é necessário verificar também a existência da gravidez e a incidência da garantia.', titulo: 'Impactos práticos', icone: 'lu-info' },
      { tipo: 'afirmacao', narracao: 'O precedente tem efeito vinculante em toda a Justiça do Trabalho.', texto: 'Efeito vinculante', icone: 'lu-info' }, { tipo: 'encerramento', narracao: 'x' }] });
  const validar = () => ({ erros: [] });
  const ia = (corr) => async () => ({ text: JSON.stringify({ correcoes: corr }) });
  const a = await RT.revisarTextosDeTela({ r: mkR(), chamarIA: ia([{ id: 'cenas.0.titulo', texto: 'Estabilidade da gestante na experiência' }, { id: 'cenas.1.titulo', texto: 'Verificar gravidez e incidência da garantia' }]), validar, textoArtigo: 'x', log: () => {} });
  t('português da capa corrigido ("no experiência" → "na experiência")', a.cenas[0].titulo === 'Estabilidade da gestante na experiência');
  t('rótulo genérico reescrito com o que a voz diz', a.cenas[1].titulo === 'Verificar gravidez e incidência da garantia');
  const b = await RT.revisarTextosDeTela({ r: mkR(), chamarIA: ia([{ id: 'cenas.1.titulo', texto: 'A empresa deve indenizar a gestante em dobro' }, { id: 'cenas.2.texto', texto: 'Efeito vinculante em 2030' }]), validar, textoArtigo: 'x', log: () => {} });
  t('reescrita que não sai da fala e número inventado são barrados', b.cenas[1].titulo === 'Impactos práticos' && b.cenas[2].texto === 'Efeito vinculante');
  const c = await RT.revisarTextosDeTela({ r: mkR(), chamarIA: async () => { throw new Error('fora do ar'); }, validar, textoArtigo: 'x', log: () => {} });
  t('IA fora do ar: slides intactos (falha aberta)', c.cenas[0].titulo === 'Estabilidade da gestante no experiência');
  t('distanciaRelativa separa ajuste de reescrita', RT.distanciaRelativa('no experiência', 'na experiência') < 0.2 && RT.distanciaRelativa('Impactos práticos', 'Verificar gravidez e incidência') > 0.5);
}
console.log('== Repetição de ideias');
{ const { verificarRepeticao } = F; const r = { cenas: [...Array.from({ length: 6 }, (_, i) => ({ narracao: `Cena ${i + 1}.` })), { narracao: 'x' }] };
  const txt = await verificarRepeticao({ r, chamarIA: async () => ({ text: JSON.stringify({ repeticoes: [{ cenas: [3, 8], ideia: 'lesão concreta' }], faltou: ['fundamentos legais'] }) }), textoArtigo: 'artigo', log: () => {} });
  t('repetição devolve o retorno para regenerar o roteiro', /cenas 3 e 8/.test(txt) && /fundamentos legais/.test(txt));
  t('sem repetição: texto vazio; IA fora do ar: texto vazio', (await verificarRepeticao({ r, chamarIA: async () => ({ text: '{"repeticoes":[],"faltou":[]}' }), textoArtigo: 'a', log: () => {} })) === '' && (await verificarRepeticao({ r, chamarIA: async () => { throw new Error('x'); }, textoArtigo: 'a', log: () => {} })) === '');
}

console.log('== Pergunta-chave, slides fracos, normas por cena (vídeos do Tema 142 e do aviso prévio)');
{ const d = (nar, perg, sim, nao) => ({ cenas: [{ tipo: 'capa', narracao: 'x?' }, { tipo: 'decisao', narracao: nar, pergunta: perg, sim: { titulo: sim[0], texto: sim[1] }, nao: { titulo: nao[0], texto: nao[1] }, refs: [] }, { tipo: 'encerramento', narracao: 'x' }] });
  let x = d('O cálculo da penalidade deve considerar apenas salário base do trabalhador afetado?', 'A multa incide só sobre o salário-base?', ['Inclusão salarial', 'Todas as parcelas integram a base'], ['Não restrito', 'A penalidade não se limita ao salário base']);
  R.alinharTelaComFala(x, { tipo: 'short' }); t('Short: pergunta-chave que só pergunta (respostas sem explicação) vira slide de pergunta', x.cenas[1].tipo === 'pergunta');
  x = d('Nesse caso, o Tribunal Pleno concluiu que a interpretação adequada exige que a multa considere as parcelas de natureza salarial e não apenas o salário base fixo do empregado no mês.', 'A multa abrange apenas o salário-base?', ['Sim', 'A tese abrange toda verba salarial.'], ['Não', 'Inclui outras parcelas salariais.']);
  R.alinharTelaComFala(x, { tipo: 'longo' }); t('pergunta com "apenas" (inverte Sim/Não: o SIM azul dizia o contrário) vira destaque com a fala', x.cenas[1].tipo === 'destaque' && /Tribunal Pleno/.test(x.cenas[1].sub));
  x = d('Qual é o limite da multa prevista na lei para o atraso no pagamento das verbas do contrato?', 'A multa tem limite?', ['Sim', 'Um salário'], ['Não', 'Sem limite']);
  R.alinharTelaComFala(x, { tipo: 'longo' }); t('decisão de narração curta (só a pergunta) vira pergunta', x.cenas[1].tipo === 'pergunta');
  const sh = { capitulos: [{ cena: 3, titulo: 'a' }], cenas: [{ tipo: 'capa', narracao: 'Qual é a base?' }, { tipo: 'pergunta', narracao: 'A multa incide só sobre o salário-base?', titulo: 'x?' }, { tipo: 'destaque', narracao: 'O Tribunal definiu que todas as parcelas salariais integram a base.', titulo: 't', sub: ' ' }, { tipo: 'afirmacao', narracao: 'y', texto: 'z' }, { tipo: 'encerramento', narracao: 'x' }] };
  R.fundirPerguntaRepetida(sh); t('Short: segunda pergunta logo após a da capa é fundida na cena seguinte', sh.cenas.length === 4 && /^A multa incide só sobre o salário-base\? O Tribunal/.test(sh.cenas[1].narracao) && sh.capitulos[0].cena === 2);
}
{ const mk = (nar, refs, tipo = 'destaque') => ({ tipo, narracao: nar, titulo: 'x', sub: 'y', icone: 'lu-info', refs });
  const r = { cenas: [{ tipo: 'capa', narracao: 'a?', refs: ['Lei nº 12.506/2011'] }, mk('Antes da Lei doze mil quinhentos e seis de dois mil e onze, o aviso era fixo em trinta dias.', ['Lei nº 12.506/2011']), mk('Os depósitos do fundo de garantia incidem sobre o período de aviso indenizado.', ['Lei nº 12.506/2011']), mk('O período do aviso é computado como tempo de serviço para o décimo terceiro.', ['Súmula nº 441 do TST']), mk('Se o trabalhador não cumpre o prazo, o valor é descontado, conforme a CLT.', ['CLT, art. 487', 'Lei nº 12.506/2011']), { tipo: 'encerramento', narracao: 'x' }] };
  R.refsSoSeFaladas(r);
  t('capa mantém as referências do vídeo', r.cenas[0].refs.length === 1);
  t('norma falada pelo número (por extenso) fica', r.cenas[1].refs.length === 1);
  t('"Lei 12.506" sobre FGTS e "Súmula 441" sobre 13º (que a fala não menciona) saem', r.cenas[2].refs.length === 0 && r.cenas[3].refs.length === 0);
  t('"conforme a CLT" mantém o art. 487 e tira a lei', r.cenas[4].refs.join() === 'CLT, art. 487');
}
{ const w = { cenas: [{ tipo: 'capa', narracao: 'x?' }, { tipo: 'destaque', narracao: 'Todas as parcelas de natureza salarial devem integrar a base utilizada para apurar a multa.', titulo: 'Composição da multa', sub: ' ', icone: 'lu-info', refs: [] }, { tipo: 'destaque', narracao: 'Para aplicar corretamente a regra, o procedimento exige verificar a composição da remuneração e a natureza jurídica de cada verba.', titulo: 'Composição da multa', sub: ' ', icone: 'lu-info', refs: [] }, { tipo: 'encerramento', narracao: 'x' }] };
  R.enriquecerSlidesFracos(w);
  t('destaque só com título ganha a frase da fala', /parcelas de natureza salarial/i.test(w.cenas[1].sub));
  t('título repetido em cenas seguidas é trocado', w.cenas[2].titulo !== 'Composição da multa');
  const c = { capitulos: [{ cena: 1, titulo: 'a' }, { cena: 4, titulo: 'b' }, { cena: 6, titulo: 'c' }], cenas: [{ tipo: 'capa', narracao: 'a?' }, { tipo: 'destaque', narracao: 'O Tribunal Pleno fixou uma tese com efeito vinculante para todo o país.' }, { tipo: 'destaque', narracao: 'Vamos ver os elementos considerados pelo Tribunal.' }, { tipo: 'destaque', narracao: 'Todas as parcelas de natureza salarial devem integrar a base de cálculo da multa.' }, { tipo: 'destaque', narracao: 'Outra cena com bastante texto para ficar de pé sozinha na tela do vídeo.' }, { tipo: 'lista', narracao: 'Em resumo, a multa abrange todas as parcelas salariais do empregado.' }, { tipo: 'encerramento', narracao: 'x' }] };
  R.juntarCenasCurtas(c);
  t('cena de ponte de 3 s ("Vamos ver…") é juntada à seguinte e os capítulos são renumerados', c.cenas.length === 6 && /^Vamos ver os elementos considerados pelo Tribunal\. Todas as parcelas/.test(c.cenas[2].narracao) && c.capitulos.map(k => k.cena).join() === '1,3,5');
}
console.log('== Tempo das respostas e pronúncia');
t('decisão: a última resposta fica ≥ 3 s na tela (antes ~1 s)', Math.max(...C.calcularQuando('Nesse caso o tribunal concluiu que a multa considera as parcelas de natureza salarial.', ['A multa abrange?', 'Sim A tese abrange toda verba salarial', 'Não Inclui outras parcelas salariais'], 8, { primeiroFixo: 0.3, sobra: 3.2 })) <= 8 - 3.2 + 1e-9);
{ const pron = JSON.parse(fs.readFileSync(path.join(LIB, '..', 'pronuncias.json'), 'utf8')); t('"base" tem fonema próprio (a voz lia "bazi")', pron.base && /ˈbaze/.test(pron.base.ipa)); }

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
