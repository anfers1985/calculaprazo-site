// Converte o roteiro do job (cenas com narração + campos visuais + duracao_seg)
// no "cena.json" que o motor visual (slides/template.html) entende.
export const MARCA = { nome1: 'Calcula', nome2: 'Prazo', site: 'calculaprazo.com.br', tag: 'Direto ao Ponto' };

// ---- Legenda em blocos curtos (Short ilustrado): 1 a 3 palavras por vez, sincronizadas com a fala ----
const PAUSA_FINAL_CENA = 0.38; // mesma pausa que narracao.py coloca ao fim de cada cena
const PAUSA_FRASE = 0.3;
const SEG_POR_CHAR = 0.062;    // ~16 caracteres/s: ritmo médio da voz

export function dividirEmBlocos(narracao, { maxPalavras = 3, maxChars = 26 } = {}) {
  const palavras = String(narracao || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const blocos = [];
  let atual = [];
  const fechar = () => { if (atual.length) { blocos.push(atual.join(' ')); atual = []; } };
  for (const p of palavras) {
    const tentativa = [...atual, p].join(' ');
    if (atual.length && (atual.length >= maxPalavras || tentativa.length > maxChars)) fechar();
    atual.push(p);
    if (/[.!?;:,…]$/.test(p)) fechar(); // quebra na pontuação
  }
  fechar();
  // não deixa sobrar um bloco de uma palavra curta (de, a, e, o...) sozinho no fim
  if (blocos.length > 1 && blocos[blocos.length - 1].length <= 3 && !/[.!?]$/.test(blocos[blocos.length - 1])) {
    const ult = blocos.pop(); blocos[blocos.length - 1] += ' ' + ult;
  }
  return blocos;
}

/** Distribui os blocos no tempo da cena [t0, t1]: peso proporcional ao tamanho + pausa ao fim de frase. */
export function temporizarBlocos(blocos, t0, t1) {
  if (!blocos.length) return [];
  const janela = Math.max(0.6, (t1 - t0) - PAUSA_FINAL_CENA);
  const pesos = blocos.map(b => b.length * SEG_POR_CHAR + (/[.!?]$/.test(b) ? PAUSA_FRASE : /[,;:]$/.test(b) ? PAUSA_FRASE / 2 : 0));
  const soma = pesos.reduce((a, b) => a + b, 0);
  let t = t0;
  return blocos.map((texto, i) => {
    const dur = janela * pesos[i] / soma;
    const ini = t; t += dur;
    // o último bloco fica na tela até o fim da cena
    return { t0: Math.round(ini * 1000) / 1000, t1: i === blocos.length - 1 ? Math.round(t1 * 1000) / 1000 : Math.round(t * 1000) / 1000, texto };
  });
}

export function roteiroParaCena(roteiro, tipo, duracaoAudioSeg, estilo = 'slides') {
  const cenas = roteiro.cenas || [];
  const cortes = [0];
  let acc = 0;
  cenas.forEach(c => {
    acc += Number(c.duracao_seg) || 5;
    cortes.push(Math.round(acc * 1000) / 1000);
  });
  // O vídeo termina exatamente quando o áudio termina.
  if (duracaoAudioSeg && duracaoAudioSeg > cortes[cortes.length - 2]) cortes[cortes.length - 1] = Math.round(duracaoAudioSeg * 1000) / 1000;
  if (estilo === 'ilustrado') {
    return {
      formato: 'short',
      estilo: 'ilustrado',
      marca: MARCA,
      cortes,
      cenas: cenas.map((c, i) => ({
        tipo: c.tipo || 'ilustracao',
        imagem_arquivo: c.imagem_arquivo || null, // preenchido pelo render (caminho local); null = cartão de papel
        legenda_vazia: c.texto_na_imagem || '',
        blocos: temporizarBlocos(dividirEmBlocos(c.narracao), cortes[i], cortes[i + 1]),
      })),
    };
  }
  return {
    formato: tipo === 'short' ? 'short' : 'longo',
    marca: MARCA,
    cortes,
    cenas: cenas.map(c => {
      const { narracao, duracao_seg, ...visual } = c; // narração e duração não vão pro visual
      return visual;
    }),
  };
}

// Capítulos do YouTube (só vídeo longo): ≥ 3, o primeiro em 0:00, cada um com ≥ 10 s.
export function montarCapitulos(roteiro, cortes) {
  const lista = Array.isArray(roteiro.capitulos) ? [...roteiro.capitulos] : [];
  const validos = [];
  lista.sort((a, b) => a.cena - b.cena).forEach(cap => {
    const i = Number(cap.cena) - 1;
    if (!(i >= 0 && i < cortes.length - 1) || !cap.titulo) return;
    const t = cortes[i];
    if (validos.length === 0) { if (i !== 0) return; }
    else if (t - validos[validos.length - 1].t < 10) return;
    validos.push({ t, titulo: String(cap.titulo).slice(0, 80) });
  });
  const total = cortes[cortes.length - 1];
  while (validos.length && total - validos[validos.length - 1].t < 10) validos.pop();
  if (validos.length < 3) return [];
  const fmt = s => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };
  return validos.map(v => `${fmt(v.t)} ${v.titulo}`);
}
