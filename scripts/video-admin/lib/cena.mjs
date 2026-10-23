// Converte o roteiro do job (cenas com narração + campos visuais + duracao_seg)
// no "cena.json" que o motor visual (slides/template.html) entende.
export const MARCA = { nome1: 'Calcula', nome2: 'Prazo', site: 'calculaprazo.com.br', tag: 'Direto ao Ponto' };

export function roteiroParaCena(roteiro, tipo, duracaoAudioSeg) {
  const cenas = roteiro.cenas || [];
  const cortes = [0];
  let acc = 0;
  cenas.forEach(c => {
    acc += Number(c.duracao_seg) || 5;
    cortes.push(Math.round(acc * 1000) / 1000);
  });
  // O vídeo termina exatamente quando o áudio termina.
  if (duracaoAudioSeg && duracaoAudioSeg > cortes[cortes.length - 2]) cortes[cortes.length - 1] = Math.round(duracaoAudioSeg * 1000) / 1000;
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
