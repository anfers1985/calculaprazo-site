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


// ---- Sincronia item × fala (slides): estima, pela posição da palavra-chave na narração, quando cada item deve aparecer ----
const normTxt = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
export function calcularQuando(narracao, rotulos, dur, { primeiroFixo = null } = {}) {
  const nar = normTxt(narracao), len = Math.max(1, nar.length);
  const fala = Math.max(1.5, dur - 0.5);          // a fala ocupa a cena menos a pausa final
  const min = 0.7, max = Math.max(min + 0.5, dur - 0.9), gap = 0.55;
  let ult = -1;
  const pos = rotulos.map((r) => {
    const palavras = normTxt(r).split(' ').filter((w) => w.length >= 5);
    let melhor = -1;
    for (const w of palavras) { const p = nar.indexOf(w, ult + 1); if (p >= 0 && (melhor < 0 || p < melhor)) melhor = p; }
    if (melhor >= 0) ult = melhor;
    return melhor;
  });
  let t = pos.map((p) => (p >= 0 ? (p / len) * fala - 0.35 : null));
  if (primeiroFixo !== null) t[0] = primeiroFixo;
  // itens sem palavra encontrada: distribui entre o vizinho anterior e o seguinte
  for (let k = 0; k < t.length; k++) {
    if (t[k] !== null) continue;
    let a = k - 1; while (a >= 0 && t[a] === null) a--;
    let b = k + 1; while (b < t.length && t[b] === null) b++;
    const ta = a >= 0 ? t[a] : min - gap, tb = b < t.length ? t[b] : max + gap;
    t[k] = ta + (tb - ta) * (k - a) / (b - a);
  }
  // ordem crescente, com intervalo mínimo, dentro da cena
  for (let k = 0; k < t.length; k++) {
    t[k] = Math.min(max, Math.max(min, t[k]));
    if (k > 0 && t[k] < t[k - 1] + gap) t[k] = Math.min(max, t[k - 1] + gap);
  }
  return t.map((x) => Math.round(x * 100) / 100);
}

// Short ilustrado: instante (s, relativo à cena) em que cada etiqueta entra = início do bloco de legenda em que a fala menciona o termo.
export function quandoPorBlocos(blocos, rotulos, t0, t1) {
  const dur = Math.max(1.5, t1 - t0), min = 0.5, max = Math.max(min + 0.5, dur - 1.0), gap = 0.6;
  const bn = (blocos || []).map((b) => ({ t: b.t0 - t0, n: normTxt(b.texto) }));
  let ult = -1;
  let t = rotulos.map((r) => {
    const palavras = normTxt(r).split(' ').filter((w) => w.length >= 4);
    let melhor = -1;
    for (let j = ult + 1; j < bn.length && melhor < 0; j++) if (palavras.some((w) => bn[j].n.includes(w))) melhor = j;
    if (melhor >= 0) ult = melhor;
    return melhor >= 0 ? bn[melhor].t - 0.3 : null;
  });
  for (let k = 0; k < t.length; k++) {
    if (t[k] !== null) continue;
    let a = k - 1; while (a >= 0 && t[a] === null) a--;
    let b = k + 1; while (b < t.length && t[b] === null) b++;
    const ta = a >= 0 ? t[a] : min - gap, tb = b < t.length ? t[b] : max + gap;
    t[k] = ta + (tb - ta) * (k - a) / (b - a);
  }
  for (let k = 0; k < t.length; k++) {
    t[k] = Math.min(max, Math.max(min, t[k]));
    if (k > 0 && t[k] < t[k - 1] + gap) t[k] = Math.min(max, t[k - 1] + gap);
  }
  return t.map((x) => Math.round(x * 100) / 100);
}
const txt = (o) => [o && o.titulo, o && o.texto].filter(Boolean).join(' ');
function rotulosDaCena(c) {
  switch (c.tipo) {
    case 'grade': return (c.cards || []).map(txt);
    case 'passos': return (c.passos || []).map(txt);
    case 'lista': return (c.itens || []).map((x) => x.texto);
    case 'comparacao': return [txt(c.esq), txt(c.dir)];
    case 'decisao': return [c.pergunta, txt(c.sim), txt(c.nao)];
    default: return null;
  }
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
      cenas: cenas.map((c, i) => {
        const blocos = temporizarBlocos(dividirEmBlocos(c.narracao), cortes[i], cortes[i + 1]);
        const rotulos = (Array.isArray(c.rotulos) ? c.rotulos : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 2);
        const nd = c.numero_destaque && c.numero_destaque.valor ? c.numero_destaque : null;
        return {
          tipo: c.tipo || 'ilustracao',
          imagem_arquivo: c.imagem_arquivo || null, // preenchido pelo render (caminho local); null = cartão de papel
          legenda_vazia: c.texto_na_imagem || '',
          blocos,
          rotulos,
          quando: rotulos.length ? quandoPorBlocos(blocos, rotulos, cortes[i], cortes[i + 1]) : [],
          numero: nd ? { valor: String(nd.valor), unidade: String(nd.unidade || ''), quando: quandoPorBlocos(blocos, [nd.unidade || nd.valor], cortes[i], cortes[i + 1])[0] } : null,
        };
      }),
    };
  }
  return {
    formato: tipo === 'short' ? 'short' : 'longo',
    marca: MARCA,
    cortes,
    cenas: cenas.map((c, i) => {
      const { narracao, duracao_seg, ...visual } = c; // narração e duração não vão pro visual
      const rot = rotulosDaCena(c);
      if (rot && rot.length) visual.quando = calcularQuando(narracao, rot, cortes[i + 1] - cortes[i], { primeiroFixo: c.tipo === 'decisao' ? 0.3 : null });
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
