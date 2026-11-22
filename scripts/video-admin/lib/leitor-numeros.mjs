// Leitor de números (pt-BR) do roteiro: a MESMA lógica de leitor_numeros.py (narração), conferida com os mesmos casos em
// testes/leitura_numeros.json. ordinais (13º → décimo terceiro), frações (1/12 → um doze avos), escalas (5x2 → cinco por dois),
// horas (8h24), concordância feminina (42 horas → quarenta e duas horas), dinheiro, decimais, leis com ano de 2 dígitos e incisos em romano.
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const UN_M = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
const UN_F = ['', 'primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona'];
const DEZ_M = ['', 'décimo', 'vigésimo', 'trigésimo', 'quadragésimo', 'quinquagésimo', 'sexagésimo', 'septuagésimo', 'octogésimo', 'nonagésimo'];
const CEN_M = ['', 'centésimo', 'ducentésimo', 'trecentésimo', 'quadringentésimo', 'quingentésimo', 'sexcentésimo', 'septingentésimo', 'octingentésimo', 'nongentésimo'];

const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const ate999 = (n) => {
  if (n < 20) return U[n];
  if (n < 100) return D[Math.floor(n / 10)] + (n % 10 ? ' e ' + U[n % 10] : '');
  if (n === 100) return 'cem';
  return C[Math.floor(n / 100)] + (n % 100 ? ' e ' + ate999(n % 100) : '');
};
const cardMasc = (n) => {
  if (n < 1000) return ate999(n);
  if (n < 1e6) {
    const mil = Math.floor(n / 1000), r = n % 1000;
    const m = mil === 1 ? 'mil' : ate999(mil) + ' mil';
    return r === 0 ? m : m + (r < 100 || r % 100 === 0 ? ' e ' : ' ') + ate999(r);
  }
  if (n < 1e9) {
    const mi = Math.floor(n / 1e6), r = n % 1e6;
    const m = mi === 1 ? 'um milhão' : cardMasc(mi) + ' milhões';
    return r === 0 ? m : m + (r < 100 || r % 100 === 0 ? ' e ' : ' ') + cardMasc(r);
  }
  return String(n);
};
const femPal = (p) => (p === 'um' ? 'uma' : p === 'dois' ? 'duas' : p.endsWith('entos') ? p.slice(0, -2) + 'as' : p);
export const cardinal = (n, fem = false) => {
  n = Math.floor(Number(n));
  const t = cardMasc(n);
  return fem && n < 1e6 ? t.split(' ').map(femPal).join(' ') : t;
};
export function ordinal(n, fem = false) {
  if (!(n >= 1 && n <= 999)) return cardinal(n);
  const c = Math.floor(n / 100), d = Math.floor((n % 100) / 10), u = n % 10;
  const fm = fem ? (x) => (x ? x.slice(0, -1) + 'a' : x) : (x) => x;
  return [fm(CEN_M[c]), fm(DEZ_M[d]), (fem ? UN_F : UN_M)[u]].filter(Boolean).join(' ');
}
const toInt = (s) => parseInt(String(s).replace(/\./g, ''), 10);
const decimais = (parte) => {
  const zeros = parte.length - parte.replace(/^0+/, '').length, resto = parte.replace(/^0+/, '');
  return [...Array(zeros).fill('zero'), ...(resto ? [cardinal(parseInt(resto, 10))] : [])].join(' ');
};
const FEM = ('hora horas semana semanas parcela parcelas vez vezes falta faltas diária diárias folga folgas multa multas faixa faixas instância instâncias ' +
  'turma turmas vara varas audiência audiências prestação prestações cota cotas quinzena quinzenas jornada jornadas causa causas pessoa pessoas ' +
  'empresa empresas trabalhadora trabalhadoras empregada empregadas doméstica domésticas mulher mulheres gestante gestantes cláusula cláusulas ' +
  'decisão decisões ação ações súmula súmulas tese teses lei leis norma normas hipótese hipóteses situação situações etapa etapas fase fases regra regras ' +
  'condição condições verba verbas quantia quantias vaga vagas reunião reuniões convenção convenções madrugada madrugadas noite noites tarde tardes ' +
  'manhã manhãs semana-base remuneração remunerações contribuição contribuições competência competências infração infrações penalidade penalidades ' +
  'demissão demissões contratação contratações compensação compensações hora-extra horas-extras').split(' ');
const RE_FEM = new RegExp('^(?:' + FEM.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}])', 'iu');
const ROM = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const romano = (s) => {
  s = s.toUpperCase(); let tot = 0;
  for (let i = 0; i < s.length; i++) { const v = ROM[s[i]]; if (!v) return null; tot += (i + 1 < s.length && ROM[s[i + 1]] > v) ? -v : v; }
  return tot > 0 && tot <= 200 ? tot : null;
};
const TERMO = { 3: 'terço', 4: 'quarto', 5: 'quinto', 6: 'sexto', 7: 'sétimo', 8: 'oitavo', 9: 'nono', 10: 'décimo' };

/** Recebe o texto (já sem marcadores) e devolve tudo por extenso. */
export function lerNumeros(texto) {
  let t = String(texto ?? '');
  // Lei/decreto/etc. com ano de 2 dígitos: "Lei 8.213/91" → "Lei 8.213 de 1991"
  t = t.replace(/\b(lei(?:\s+complementar)?|lc|decreto(?:-lei)?|portaria|mp|medida provisória|resolução|instrução normativa|emenda constitucional|ec)\s+(?:n[ºo°]\.?\s*)?(\d[\d.]*)\/(\d{2}|\d{4})\b/giu,
    (_, a, n, ano) => `${a} ${n} de ${ano.length === 2 ? (parseInt(ano, 10) >= 40 ? '19' : '20') + ano : ano}`);
  // Datas completas: 1/5/2026 → primeiro de maio de 2026
  t = t.replace(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g, (m, d, mes, ano) => (+mes >= 1 && +mes <= 12 ? `${+d === 1 ? 'primeiro' : +d} de ${MESES[+mes - 1]} de ${ano}` : m));
  // Escalas e vezes
  t = t.replace(/(?<![\w.,])(\d{1,3})\s*[xX×]\s*(\d{1,3})(?!\w)/g, (_, a, b) => `${a} por ${b}`);
  t = t.replace(/(?<![\w.,])(\d{1,3})\s*[xX×](?=[\s.,;:!?)]|$)/g, (_, a) => `${a} vezes`);
  // Horas e minutos
  t = t.replace(/(?<![\w.,])(\d{1,2})h(\d{2})?(?:min)?(?!\w)/g, (_, h, mi) => {
    const H = parseInt(h, 10); let s = `${H} ${H === 1 ? 'hora' : 'horas'}`;
    if (mi && parseInt(mi, 10)) s += ` e ${parseInt(mi, 10)} ${parseInt(mi, 10) === 1 ? 'minuto' : 'minutos'}`;
    return s;
  });
  t = t.replace(/(?<![\w.,])(\d{1,3})\s?min(?![\p{L}\d_])/gu, (_, n) => `${n} ${parseInt(n, 10) === 1 ? 'minuto' : 'minutos'}`);
  // Frações e datas sem ano
  const base = t;
  t = base.replace(/(?<![\d/.,])(\d{1,3})\/(\d{1,3})(?![\d/])/g, (m, a, b, off) => {
    const n = toInt(a), d = toInt(b);
    if (d === 0) return m;
    if (n < d) {
      const resto = base.slice(off + m.length);
      if (d === 2) {
        if (n === 1 && /^\s+(?:de|do|da|dos|das)(?![\p{L}])/iu.test(resto)) return 'metade';
        if (n === 1 && /^\s+hora(?![\p{L}])/iu.test(resto)) return 'meia';
        return `${cardinal(n)} meio${n > 1 ? 's' : ''}`;
      }
      if (TERMO[d]) return `${cardinal(n)} ${TERMO[d]}${n > 1 ? 's' : ''}`;
      return `${cardinal(n)} ${cardinal(d)} avos`;
    }
    if (d <= 12 && n <= 31) return `${n === 1 ? 'primeiro' : n} de ${MESES[d - 1]}`;
    return `${n} ${d}`;
  });
  // Dinheiro
  t = t.replace(/R\$\s*(\d+(?:\.\d{3})*(?:,\d+)?)\s+(mil|milh[ãõ]o|milh[õo]es|bilh[ãõ]o|bilh[õo]es)(?![\p{L}])/giu,
    (_, v, u) => `${v} ${u.toLowerCase()}${u.toLowerCase() === 'mil' ? '' : ' de'} reais`);
  t = t.replace(/R\$\s*(\d+(?:\.\d{3})*)(?:,(\d{1,2}))?(?!\d)/g, (_, i, c) => {
    const inteiro = toInt(i); let s = `${inteiro} ${inteiro === 1 ? 'real' : 'reais'}`;
    if (c && parseInt(c, 10)) { const k = parseInt(c.padEnd(2, '0').slice(0, 2), 10); s += ` e ${k} ${k === 1 ? 'centavo' : 'centavos'}`; }
    return s;
  });
  // Porcentagem e decimais
  t = t.replace(/(\d+),(\d+)\s*%/g, (_, a, b) => `${cardinal(parseInt(a, 10))} vírgula ${decimais(b)} por cento`);
  t = t.replace(/(\d+)\s*%/g, (_, a) => `${a} por cento`);
  t = t.replace(/(?<![\d.,])(\d+),(\d+)(?!\d)/g, (_, a, b) => `${cardinal(parseInt(a, 10))} vírgula ${decimais(b)}`);
  // Ordinais (em artigo/parágrafo/inciso só até 9º; depois é cardinal)
  const b2 = t;
  t = b2.replace(/(?<![\d.,])(\d{1,3})\.?\s*([ºª°])/g, (m, a, g, off) => {
    const n = parseInt(a, 10);
    const antes = b2.slice(Math.max(0, off - 24), off).toLowerCase();
    if (/(?:artigos?|art\.?|par[áa]grafos?|§|incisos?|al[ií]neas?)\s*$/.test(antes) && n >= 10) return String(n);
    return ordinal(n, g === 'ª');
  });
  // Incisos em romano
  t = t.replace(/\b(incisos?)\s+([IVXLC]{1,6})\b/gi, (m, a, r) => (romano(r) ? `${a} ${romano(r)}` : m));
  // Cardinais restantes, com concordância
  const b3 = t;
  t = b3.replace(/\d{1,3}(?:\.\d{3})+|\d+/g, (m, off) => {
    const n = toInt(m);
    const mm = b3.slice(off + m.length).match(/^\s+(?:(?:mil|milh[ãõ]o|milh[õo]es)\s+)?(\S+)/u);
    const fem = !!(mm && RE_FEM.test(mm[1].replace(/[.,;:!?)]+$/, '')) && n < 1e6);
    return cardinal(n, fem);
  });
  return t.replace(/\s+/g, ' ').trim();
}
