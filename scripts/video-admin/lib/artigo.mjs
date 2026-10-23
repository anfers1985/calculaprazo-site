// Lê o artigo do site (HTML publicado) e extrai texto, metadados e as referências legais citadas.
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&mdash;': '—', '&ordm;': 'º' };
export function decodificar(s) {
  return String(s).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;|&#39;/gi, m => ENT[m.toLowerCase()] ?? m);
}
const semTags = h => decodificar(h.replace(/<[^>]+>/g, ' ')).replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

const MARCADORES_FIM = ['Continue lendo', 'Escrito por', 'Leia também', 'Leia tambem', 'Compartilhe', 'Receba novidades', 'Newsletter'];

// ---- Referências legais citadas no texto (únicas permitidas nos slides) ----
const SIGLAS = [
  [/consolida[cç][aã]o das leis do trabalho|\bCLT\b/i, 'CLT'],
  [/constitui[cç][aã]o federal|\bCF\/?88\b|\bCF\b/i, 'CF'],
  [/atos? das disposi[cç][oõ]es constitucionais transit[oó]rias|\bADCT\b/i, 'ADCT'],
  [/c[oó]digo de processo civil|\bCPC\b/i, 'CPC'],
  [/c[oó]digo civil|\bCC\b/i, 'CC'],
];
export function extrairRefs(texto) {
  const refs = new Set();
  const t = texto.replace(/\s+/g, ' ');
  // art. N [, inciso X] [, alínea "a"] da/do <norma>
  const reArt = /\b(?:art(?:igo)?s?\.?)\s*(\d+[A-Za-z]?(?:-[A-Z])?)\s*[º°o]?(?:\s*,?\s*(?:inciso|inc\.)\s+([IVXL]+))?(?:\s*,?\s*al[ií]nea\s+[“"']?([a-z])[”"']?)?[^.;:()]{0,40}?\b(?:da|do|de)\s+(Consolida[cç][aã]o das Leis do Trabalho(?:\s*\(CLT\))?|CLT|Constitui[cç][aã]o Federal|CF|ADCT|Atos? das Disposi[cç][oõ]es Constitucionais Transit[oó]rias|CPC|C[oó]digo de Processo Civil|C[oó]digo Civil|Lei(?:\s+n[ºo°.]?)?\s*[\d.]+\/\d{2,4})/gi;
  for (const m of t.matchAll(reArt)) {
    let norma = m[4];
    const sig = SIGLAS.find(([re]) => re.test(norma));
    norma = sig ? sig[1] : norma.replace(/\s+/g, ' ').replace(/Lei\s+n?[ºo°.]?\s*/i, 'Lei nº ');
    refs.add(`${norma}, art. ${m[1]}${m[2] ? ', ' + m[2].toUpperCase() : ''}${m[3] ? ', ' + m[3].toLowerCase() : ''}`);
  }
  // listas: "artigos 468, 469, 483 e 62, inciso II" (a norma vem logo depois ou foi citada pouco antes)
  const reLista = /\bartigos\s+((?:\d+[A-Za-z]?(?:-[A-Z])?\s*(?:,|\se)\s*)+\d+[A-Za-z]?(?:-[A-Z])?)(?:\s*,\s*inciso\s+([IVXL]+))?/gi;
  const NORMAS = /\b(CLT|Consolida[cç][aã]o das Leis do Trabalho|Constitui[cç][aã]o Federal|ADCT|CPC|C[oó]digo de Processo Civil|C[oó]digo Civil)\b/gi;
  for (const m of t.matchAll(reLista)) {
    const depois = t.slice(m.index + m[0].length, m.index + m[0].length + 70).match(/^[^.;]{0,50}?\b(?:da|do|de)\s+(CLT|Consolida[cç][aã]o das Leis do Trabalho|Constitui[cç][aã]o Federal|ADCT|CPC|C[oó]digo de Processo Civil|C[oó]digo Civil)/i);
    const antes = [...t.slice(Math.max(0, m.index - 220), m.index).matchAll(NORMAS)].pop();
    const nome = (depois && depois[1]) || (antes && antes[1]);
    if (!nome) continue;
    const sigla = (SIGLAS.find(([re]) => re.test(nome)) || [])[1];
    if (!sigla) continue;
    const nums = m[1].split(/\s*(?:,|\se)\s*/).filter(Boolean);
    nums.forEach((n, i) => refs.add(`${sigla}, art. ${n}${i === nums.length - 1 && m[2] ? ', ' + m[2].toUpperCase() : ''}`));
  }
  for (const m of t.matchAll(/\bS[úu]mula\s*(?:n[ºo°.]?\s*)?(\d+)\s*(?:do|da)\s+(TST|STF|STJ)/gi)) refs.add(`Súmula nº ${m[1]} do ${m[2].toUpperCase()}`);
  for (const m of t.matchAll(/\bTema\s*(?:n[ºo°.]?\s*)?(\d+)\s*(?:do|da)\s+(TST|STF|STJ)/gi)) refs.add(`Tema ${m[1]} do ${m[2].toUpperCase()}`);
  for (const m of t.matchAll(/\b(?:OJ|Orienta[cç][aã]o Jurisprudencial)\s*(?:n[ºo°.]?\s*)?(\d+)\s*(?:da|do)\s+(SDI-?\s?[12]|SBDI-?\s?[12]|SDC)/gi)) refs.add(`OJ nº ${m[1]} da ${m[2].toUpperCase().replace(/\s/g, '')}`);
  for (const m of t.matchAll(/\bLei\s*(?:Complementar\s*)?(?:n[ºo°.]?\s*)?(\d{1,2}\.?\d{3})\/(\d{4})/gi)) refs.add(`Lei nº ${m[1]}/${m[2]}`);
  return [...refs];
}
export const normRef = r => String(r).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

// ---- Parse do HTML ----
export function parseArtigo(html, url) {
  const art = (html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || [])[1] || '';
  if (!art) throw new Error('Não encontrei o <article> na página do post.');
  const titulo = semTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s*[|–-]\s*Calcula Prazo.*$/i, '');
  let corpo = art.replace(/<(script|style|svg|noscript|iframe|form|button|nav|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<p\b(?:(?!<\/p>)[\s\S])*?Leia também(?:(?!<\/p>)[\s\S])*?<\/p>/gi, ' ')   // cartões "Leia também" no meio do texto
    .replace(/<div\b[^>]*class="[^"]*\b(?:ad-|adst)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ')   // blocos de anúncio
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr|\/blockquote)[^>]*>/gi, '\n');
  let texto = semTags(corpo);
  // corta o que vem depois do conteúdo (autor, "continue lendo", newsletter...)
  let corte = texto.length;
  for (const mk of MARCADORES_FIM) { const i = texto.lastIndexOf(mk); if (i > texto.length * 0.85 && i < corte) corte = i; } // só rodapé do artigo
  texto = texto.slice(0, corte).trim();
  // resumo rápido
  const resumo = [];
  const iRes = art.search(/Resumo r[aá]pido/i);
  if (iRes > -1) {
    const bloco = art.slice(iRes, iRes + 3000);
    const ul = bloco.match(/<ul[\s\S]*?<\/ul>/i);
    if (ul) for (const li of ul[0].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) { const x = semTags(li[1]); if (x) resumo.push(x); }
  }
  const autor = (html.match(/Por\s*(?:<[^>]+>\s*)*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ.\- ]{3,40}?)\s*(?:<|·|\|)/) || [])[1] || 'Anderson Fernandes';
  const data = (html.match(/Publicado em:?\s*(?:<[^>]+>\s*)*(\d{1,2} de [a-zç]+ de \d{4})/i) || [])[1] || '';
  let categoria = '';
  const bc = html.match(/<nav[^>]*breadcrumb[^>]*>([\s\S]*?)<\/nav>/i) || html.match(/class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/(?:nav|div|ol|ul)>/i);
  if (bc) { const partes = [...bc[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map(m => semTags(m[1])).filter(Boolean); categoria = partes[partes.length - 1] || ''; }
  const slug = String(url).replace(/[?#].*$/, '').replace(/\/$/, '').split('/').pop().replace(/\.html$/, '');
  return {
    titulo, autor: autor.trim(), data, categoria, resumo: resumo.slice(0, 3), texto,
    palavras: (texto.match(/\S+/g) || []).length, refs: extrairRefs(texto + ' ' + resumo.join(' ')),
    urlExibida: `calculaprazo.com.br/blog/${slug}`,
  };
}
export async function lerArtigo(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'calculaprazo-video-admin' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`Não consegui abrir o artigo (${r.status}): ${url}`);
  return parseArtigo(await r.text(), url);
}
