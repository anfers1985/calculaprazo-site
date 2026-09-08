// ════════════════════════════════════════════════════════════════════════
// PUBLICAÇÃO AGENDADA
// ════════════════════════════════════════════════════════════════════════
// Roda dentro do workflow `.github/workflows/publicar-agendados.yml`, nos
// horários fixos 09h/12h/15h/18h (Brasília), seg-sex.
//
// Lê data/agendados.json, pega os itens com status "pendente" cujo
// `publicarEm` já venceu, e publica cada um na ordem cronológica —
// replicando exatamente o que o botão "Publicar no GitHub" do admin faz
// (gera o HTML a partir do template, injeta relacionados/nav, atualiza
// posts.json e sitemap.xml, notifica indexação), mas escrevendo direto nos
// arquivos do checkout local (o workflow cuida do commit/push depois).
//
// Isso NÃO precisa do PAT pessoal do admin: o workflow usa o GITHUB_TOKEN
// nativo da Action (permissions: contents: write).
//
// IMPORTANTE: post.date é setado para o dia real em que a publicação
// aconteceu aqui (hoje, fuso Brasília) — é isso que faz o vídeo-pipeline
// (scripts/01-detectar-post.mjs) tratar este post exatamente como um post
// manual na hora de decidir se ele entra na cota diária de 3 shorts.
// ════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const SITE_BASE_URL = 'https://calculaprazo.com.br';
const WORKER_URL     = 'https://calculaprazo-views-api.andersonfernand3s.workers.dev';
const WORKER_SECRET  = process.env.WORKER_SECRET || '';

const ROOT             = process.cwd();
const AGENDADOS_PATH   = path.join(ROOT, 'data/agendados.json');
const POSTS_JSON_PATH  = path.join(ROOT, 'data/posts.json');
const TEMPLATE_PATH    = path.join(ROOT, 'blog/POST_TEMPLATE.html');
const SITEMAP_PATH     = path.join(ROOT, 'sitemap.xml');
const BLOG_DIR         = path.join(ROOT, 'blog');

const CAT_LABELS_MAP = {
  'jurisprudencia-trts':'TRT','jurisprudencia-tst':'TST','jurisprudencia-stj':'STJ','jurisprudencia-stf':'STF','jurisprudencia':'Jurisprudência',
  'noticias-mte':'MTE','noticias-mpt':'MPT','noticias-mte-mpt':'Outros órgãos',
  'legislacao-clt':'CLT','legislacao-cf':'CF/88','esocial':'eSocial','fgts-digital':'FGTS','esocial-fgts-digital':'eSocial/FGTS','legislacao-previdenciario':'Previdenciário','legislacao-sindical':'Sindical','legislacao-portarias':'Portarias','legislacao-nr':'NR','legislacao-normas':'Legislação e Normas',
  'rh-folha':'Folha de Pagamento','rh-jornada':'Jornada','rh-contrato':'Contrato','rh-salario':'Salário','rh-rescisao':'Rescisão','saude-seguranca':'Saúde e Segurança','rh-beneficios':'Benefícios','rh-ctps':'CTPS','rh-sindical':'Rel. Sindical','rh-fiscalizacao':'Fiscalização','rh-inss':'INSS','rh-modelos':'Modelos RH','orientacoes-praticas':'Outros RH',
  'processual-peticoes':'Petições e Peças','processual-pratica':'Prática Advocatícia','modelos':'Modelos','artigos':'Artigos','processual-analises':'Análises','processual-outros':'Outros Processual',
  'essenciais-livros':'Livros Jurídicos','essenciais-equipamentos':'Equipamentos','essenciais-cursos':'Cursos','essenciais-outros':'Outros Essenciais',
  'geral':'Geral'
};

// Páginas estáticas fixas do sitemap (mantidas em sincronia manual com admin/index.html)
const SITEMAP_STATIC_PAGES = [
  { loc: '/',                                  changefreq: 'daily',   priority: '1.0' },
  { loc: '/conteudo',                          changefreq: 'daily',   priority: '0.8' },
  // Páginas de categoria de /conteudo/ — se criar uma categoria nova, adicione a linha aqui também
  { loc: '/conteudo/artigos',                  changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/esocial',                  changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/essenciais',               changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/essenciais-cursos',        changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/essenciais-equipamentos',  changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/essenciais-livros',        changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/essenciais-outros',        changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/fgts-digital',             changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/jurisprudencia',           changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/jurisprudencia-stf',       changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/jurisprudencia-stj',       changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/jurisprudencia-trts',      changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/jurisprudencia-tst',       changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/legislacao-cf',            changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/legislacao-clt',           changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/legislacao-normas',        changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/legislacao-nr',            changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/legislacao-portarias',     changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/legislacao-previdenciario',changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/legislacao-sindical',      changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/modelos',                  changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/noticias-mpt',             changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/noticias-mte',             changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/orgaos-publicos',          changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/outros',                   changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/processual',               changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/processual-analises',      changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/processual-peticoes',      changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/processual-pratica',       changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-beneficios',            changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-contrato',              changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-ctps',                  changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-fiscalizacao',          changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-folha',                 changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-gestao',                changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-inss',                  changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-jornada',               changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-modelos',               changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-rescisao',              changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-salario',               changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/rh-sindical',              changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/saude-seguranca',          changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/orientacoes-praticas',    changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/noticias-mte-mpt',        changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/processual-outros',       changefreq: 'weekly',  priority: '0.6' },
  { loc: '/conteudo/geral',                   changefreq: 'weekly',  priority: '0.6' },
  { loc: '/calculadora-de-prazo-processual',    changefreq: 'monthly', priority: '0.9' },
  { loc: '/calculadora-verbas-trabalhistas',    changefreq: 'monthly', priority: '0.9' },
  { loc: '/correcao-monetaria',                 changefreq: 'monthly', priority: '0.8' },
  { loc: '/calculadora-salario-liquido',        changefreq: 'monthly', priority: '0.8' },
  { loc: '/calculadora-de-juros',               changefreq: 'monthly', priority: '0.5' },
  { loc: '/calculadora-de-porcentagem',         changefreq: 'monthly', priority: '0.3' },
  { loc: '/calculadora-de-datas',               changefreq: 'monthly', priority: '0.3' },
  { loc: '/conversor-de-moedas',                changefreq: 'monthly', priority: '0.3' },
  { loc: '/validador-cpf-cnpj',                 changefreq: 'monthly', priority: '0.3' },
  { loc: '/numero-por-extenso',                 changefreq: 'monthly', priority: '0.3' },
  { loc: '/calculadora-imc',                    changefreq: 'monthly', priority: '0.3' },
  { loc: '/calculadora-de-prescricao',          changefreq: 'monthly', priority: '0.5' },
  { loc: '/calculadora-salario-intermitente',   changefreq: 'monthly', priority: '0.5' },
  { loc: '/gerador-de-qr-code',                 changefreq: 'monthly', priority: '0.3' },
  { loc: '/gerador-de-senhas',                  changefreq: 'monthly', priority: '0.3' },
  { loc: '/sobre',                              changefreq: 'monthly', priority: '0.6' },
  { loc: '/contato',                            changefreq: 'monthly', priority: '0.5' },
  { loc: '/privacidade',                        changefreq: 'yearly',  priority: '0.3' },
  { loc: '/termos',                             changefreq: 'yearly',  priority: '0.3' }
];

// ── Utilidades de data (fuso Brasília) ─────────────────────────────────
function hojeBR() {
  // AAAA-MM-DD no fuso de Brasília, não em UTC (importante: o servidor da
  // Action roda em UTC, "hoje" tem que bater com o horário local do cron).
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date()); // en-CA => AAAA-MM-DD
}

function agoraISO() {
  return new Date().toISOString();
}

// ── Sanitização / injeções (portadas de admin/index.html) ─────────────
function sanitizeArticleContent(raw) {
  let html = (raw || '').trim();
  html = html.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  const wrapperMatch = html.match(/^<article class="article-body">([\s\S]*)<\/article>\s*$/i);
  if (wrapperMatch) html = wrapperMatch[1].trim();
  return html;
}

function pickRelatedForInlineLinks(post, allPosts, max) {
  const candidates = (allPosts || []).filter(p => p && p.id && p.id !== post.id);
  const postTags = new Set((post.tags || []).map(t => String(t).toLowerCase()));
  const postParentCat = (post.category || '').split('-')[0];

  const scored = candidates.map(p => {
    let score = 0;
    if (p.category === post.category) score += 3;
    else if (postParentCat && (p.category || '').split('-')[0] === postParentCat) score += 1;
    const pTags = new Set((p.tags || []).map(t => String(t).toLowerCase()));
    let overlap = 0;
    pTags.forEach(t => { if (postTags.has(t)) overlap++; });
    score += overlap * 2;
    return { p, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.p.date || '').localeCompare(a.p.date || ''));

  return scored.slice(0, max).map(x => x.p);
}

function buildLeiaTambemHTML(p) {
  return `\n<p style="margin:24px 0;padding:14px 18px;background:var(--card);border-left:4px solid #2563EB;border-radius:0 10px 10px 0;font-size:.92rem;">📖 <strong>Leia também:</strong> <a href="/blog/${p.id}.html" style="color:#2563EB;font-weight:600;">${p.title}</a></p>\n`;
}

function injectInlineRelatedLinks(html, post, allPosts) {
  const related = pickRelatedForInlineLinks(post, allPosts, 1);
  if (!related.length) return html;

  const h2Regex = /<h2[^>]*>[\s\S]*?<\/h2>/gi;
  const matches = [...html.matchAll(h2Regex)];

  if (matches.length === 0) {
    return html.replace(/\s*$/, '') + '\n' + buildLeiaTambemHTML(related[0]);
  }
  const anchor = matches.length >= 2 ? matches[1] : matches[0];
  const insertPos = anchor.index + anchor[0].length;
  return html.slice(0, insertPos) + buildLeiaTambemHTML(related[0]) + html.slice(insertPos);
}

const AD_MID_HTML = '\n  <!-- ▸ ANÚNCIO ADSTERRA: meio do artigo (native desktop / 300x250 mobile) -->\n'
  + '  <div style="display:flex;justify-content:center;">\n'
  + '    <div class="ad-desktop-only" id="ad-post-mid-native" style="width:100%;max-width:100%;margin:20px 0;">\n'
  + '      <div class="adst-native-slot" style="width:100%;"></div>\n'
  + '    </div>\n'
  + '    <div class="adst-slot ad-mobile-only" id="ad-post-mid-mobile-adsterra"\n'
  + '         data-adst-key="b4454cd1dba198adabbd5fad568cb2c6" data-adst-w="300" data-adst-h="250"\n'
  + '         style="width:300px;height:250px;max-width:100%;margin:20px 0;"></div>\n'
  + '  </div>\n';

function injectMidArticleAd(html) {
  const h2Regex = /<h2[^>]*>[\s\S]*?<\/h2>/gi;
  const matches = [...html.matchAll(h2Regex)];
  if (matches.length >= 3) {
    const anchor = matches[2];
    return html.slice(0, anchor.index) + AD_MID_HTML + html.slice(anchor.index);
  }
  if (matches.length === 2) {
    const anchor = matches[1];
    return html.slice(0, anchor.index) + AD_MID_HTML + html.slice(anchor.index);
  }
  const pMatches = [...html.matchAll(/<\/p>/gi)];
  if (!pMatches.length) return html;
  const mid = pMatches[Math.floor(pMatches.length / 2)];
  return html.slice(0, mid.index + mid[0].length) + AD_MID_HTML + html.slice(mid.index + mid[0].length);
}

const AD_NATIVE_AFTER_RESUMO_HTML = '\n  <!-- ▸ ANÚNCIO ADSTERRA NATIVE BANNER: abaixo do resumo rápido (desktop) -->\n'
  + '  <div class="ad-desktop-only" style="display:flex;justify-content:center;flex-direction:column;align-items:center;margin:20px 0;">\n'
  + '    <span class="ad-eyebrow">Publicidade</span>\n'
  + '    <div class="adst-native-slot" style="width:100%;"></div>\n'
  + '  </div>\n';

function injectNativeAdAfterResumo(html) {
  const resumoRegex = /<div class="resumo-rapido">[\s\S]*?<\/ul>\s*<\/div>/;
  const m = resumoRegex.exec(html);
  if (!m) return html;
  const insertPos = m.index + m[0].length;
  return html.slice(0, insertPos) + AD_NATIVE_AFTER_RESUMO_HTML + html.slice(insertPos);
}

function buildPnPrevSlot(p) {
  return p
    ? `<a class="pn-btn pn-prev" href="/blog/${p.id}.html"><span class="pn-arrow">‹</span><div><div class="pn-label">Artigo anterior</div><div class="pn-title">${p.title}</div>${p.category_label ? `<div class="pn-cat">${p.category_label}</div>` : ''}</div></a>`
    : `<div class="pn-btn" style="opacity:.35;pointer-events:none;"><span class="pn-arrow">‹</span><div><div class="pn-label">Artigo anterior</div><div class="pn-title">Início da lista</div></div></div>`;
}
function buildPnNextSlot(p) {
  return p
    ? `<a class="pn-btn pn-next" href="/blog/${p.id}.html"><div><div class="pn-label">Próximo artigo</div><div class="pn-title">${p.title}</div>${p.category_label ? `<div class="pn-cat">${p.category_label}</div>` : ''}</div><span class="pn-arrow">›</span></a>`
    : `<div class="pn-btn pn-next" style="opacity:.35;pointer-events:none;"><div><div class="pn-label">Próximo artigo</div><div class="pn-title">Fim da lista</div></div><span class="pn-arrow">›</span></div>`;
}

// Atualiza o nav Anterior/Próximo de UM vizinho já publicado, direto no arquivo local.
function atualizarVizinhoPNLocal(neighborId, side, newPostRef) {
  const filePath = path.join(BLOG_DIR, `${neighborId}.html`);
  try {
    if (!fs.existsSync(filePath)) return false;
    const html = fs.readFileSync(filePath, 'utf-8');

    const navMatch = html.match(/<nav class="pn-nav" id="pn-nav" aria-label="Navegação entre artigos">([\s\S]*?)<\/nav>/);
    if (!navMatch) return false;

    const navInner = navMatch[1];
    const splitIdx = navInner.search(/<(?:a class="pn-btn pn-next"|div class="pn-btn pn-next")/);
    if (splitIdx < 0) return false;

    const prevBlock = navInner.slice(0, splitIdx);
    const nextBlock = navInner.slice(splitIdx);
    const newPrevBlock = side === 'prev' ? buildPnPrevSlot(newPostRef) : prevBlock;
    const newNextBlock = side === 'next' ? buildPnNextSlot(newPostRef) : nextBlock;
    const newNavInner = newPrevBlock + newNextBlock;

    if (newNavInner === navInner) return true;

    const newHTML = html.replace(navMatch[0], `<nav class="pn-nav" id="pn-nav" aria-label="Navegação entre artigos">${newNavInner}</nav>`);
    fs.writeFileSync(filePath, newHTML, 'utf-8');
    return true;
  } catch (e) {
    console.warn(`[atualizarVizinhoPNLocal] falha ao sincronizar ${neighborId}:`, e.message);
    return false;
  }
}

function xmlEscape(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSitemapXML(posts) {
  const todayStr = hojeBR();
  const lines = [];
  lines.push("<?xml version='1.0' encoding='UTF-8'?>");
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  SITEMAP_STATIC_PAGES.forEach(p => {
    const lastmod = p.loc === '/' ? todayStr : (p.lastmod || todayStr);
    lines.push(`  <url><loc>${SITE_BASE_URL}${p.loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`);
  });

  const sortedPosts = [...posts].sort((a, b) => (a.date || '') < (b.date || '') ? 1 : -1);
  sortedPosts.forEach(p => {
    if (!p.id) return;
    const lastmod = p.updatedAt || p.date || todayStr;
    lines.push(`  <url><loc>${SITE_BASE_URL}/blog/${xmlEscape(p.id)}</loc><lastmod>${xmlEscape(lastmod)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
  });

  lines.push('</urlset>');
  return lines.join('\n');
}

async function notifyIndexing(urls) {
  if (!WORKER_SECRET) {
    console.warn('⚠️  WORKER_SECRET não configurado nos secrets da Action — pulando notificação de indexação.');
    return;
  }
  if (!urls || !urls.length) return;
  try {
    const r = await fetch(`${WORKER_URL}/index-google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': WORKER_SECRET },
      body: JSON.stringify({ urls })
    });
    if (r.ok) console.log('🔎 Indexação solicitada ao Google:', urls.join(', '));
    else console.warn('⚠️  Falha ao solicitar indexação (Google). Status:', r.status);
  } catch (e) {
    console.warn('⚠️  Falha ao solicitar indexação (Google):', e.message);
  }
}

// ── Publica UM item da fila ─────────────────────────────────────────────
function publicarItem(item, template, postsAtuais) {
  const slug = item.id;
  const postDate = hojeBR(); // dia real da publicação — usado pelo video-pipeline
  const updatedAt = postDate;

  const post = {
    id: slug,
    title: item.title,
    category: item.category,
    excerpt: item.excerpt,
    image: item.image || '',
    imageCaption: item.imageCaption || '',
    date: postDate,
    updatedAt,
    content: item.content,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 4) : []
  };

  const dateBR = new Date(post.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  const tagsArr = post.tags;
  const tagsBadgesHTML = tagsArr.map(t =>
    `<span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:.72rem;font-weight:700;background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.25);margin-right:5px;">${t}</span>`
  ).join('');
  const tagsJSON = JSON.stringify(tagsArr);

  const coverHTML = post.image
    ? `<div style="margin-bottom:${post.imageCaption ? '6px' : '24px'};border-radius:12px;overflow:hidden;height:440px;background:#eef2f7;display:flex;align-items:center;justify-content:center;"><img src="${post.image}" alt="${post.title}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" onerror="this.parentElement.style.display='none'"></div>${post.imageCaption ? `<p style="font-size:.75rem;color:var(--txt-s);margin:0 0 24px;">${post.imageCaption}</p>` : ''}`
    : '';
  const ogImageUrl = post.image || 'https://calculaprazo.com.br/og-image.jpg';
  const ogImageTag = `<meta property="og:image" content="${ogImageUrl}">`;
  const schemaImage = post.image ? `,"image":"${post.image}"` : '';

  const postHTML = template
    .replace(/\{\{TITLE\}\}/g, post.title)
    .replace(/\{\{DESCRIPTION\}\}/g, post.excerpt)
    .replace(/\{\{SLUG\}\}/g, post.id)
    .replace(/\{\{CATEGORY\}\}/g, post.category)
    .replace(/\{\{CATEGORY_LABEL\}\}/g, CAT_LABELS_MAP[post.category] || post.category)
    .replace(/\{\{DATE\}\}/g, post.date)
    .replace(/\{\{DATE_BR\}\}/g, dateBR)
    .replace(/\{\{UPDATED_DATE\}\}/g, post.updatedAt || post.date)
    .replace(/\{\{UPDATED_DATE_BR\}\}/g, '')
    .replace(/\{\{UPDATED_LINE\}\}/g, '')
    .replace(/\{\{CONTENT\}\}/g, injectNativeAdAfterResumo(injectMidArticleAd(injectInlineRelatedLinks(sanitizeArticleContent(post.content), post, postsAtuais))))
    .replace(/\{\{TAGS_BADGES\}\}/g, tagsBadgesHTML)
    .replace(/\{\{TAGS_JSON\}\}/g, tagsJSON)
    .replace(/\{\{OG_IMAGE\}\}/g, ogImageTag)
    .replace(/\{\{SCHEMA_IMAGE\}\}/g, schemaImage)
    .replace(/\{\{COVER_IMAGE_HTML\}\}/g, coverHTML);

  // Relacionados estáticos
  const relatedExact = postsAtuais
    .filter(p => p.id !== post.id && p.category === post.category)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 3);
  const parentCat = post.category.split('-')[0];
  const relatedFinal = relatedExact.length >= 1 ? relatedExact :
    postsAtuais.filter(p => p.id !== post.id && p.category.startsWith(parentCat))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 3);

  let relatedHTML = '';
  if (relatedFinal.length > 0) {
    const cards = relatedFinal.map(p => {
      const label = CAT_LABELS_MAP[p.category] || p.category_label || p.category;
      const dateStr = p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const img = p.image ? `<img class="r-img" src="${p.image}" alt="" loading="lazy">` : '';
      return `<a class="related-card" href="/blog/${p.id}.html">${img}<div class="r-cat">${label}</div><div class="r-title">${p.title}</div><div class="r-date">${dateStr}</div></a>`;
    }).join('');
    relatedHTML = `<h3>Artigos Relacionados</h3><div class="related-grid">${cards}</div>`;
  }

  let postHTMLFinal = relatedHTML
    ? postHTML.replace('<div class="related-section" id="related-section"></div>', `<div class="related-section" id="related-section">${relatedHTML}</div>`)
    : postHTML;

  // Navegação Anterior/Próximo
  const pnList = [...postsAtuais, {
    id: post.id, title: post.title,
    category_label: CAT_LABELS_MAP[post.category] || post.category,
    date: post.date
  }].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const pnIdx = pnList.findIndex(p => p.id === post.id);
  const pnPrev = pnIdx < pnList.length - 1 ? pnList[pnIdx + 1] : null;
  const pnNext = pnIdx > 0 ? pnList[pnIdx - 1] : null;
  const pnHTML = buildPnPrevSlot(pnPrev) + buildPnNextSlot(pnNext);

  postHTMLFinal = postHTMLFinal.replace(
    '<nav class="pn-nav" id="pn-nav" aria-label="Navegação entre artigos"></nav>',
    `<nav class="pn-nav" id="pn-nav" aria-label="Navegação entre artigos">${pnHTML}</nav>`
  );

  // Grava o HTML do post
  fs.writeFileSync(path.join(BLOG_DIR, `${post.id}.html`), postHTMLFinal, 'utf-8');

  // Sincroniza vizinhos
  const newPostRef = { id: post.id, title: post.title, category_label: CAT_LABELS_MAP[post.category] || post.category };
  if (pnPrev) atualizarVizinhoPNLocal(pnPrev.id, 'next', newPostRef);
  if (pnNext) atualizarVizinhoPNLocal(pnNext.id, 'prev', newPostRef);

  // Atualiza posts.json em memória (quem chama grava no fim)
  const filtrados = postsAtuais.filter(p => p.id !== post.id);
  filtrados.unshift({
    id: post.id,
    title: post.title,
    category: post.category,
    category_label: CAT_LABELS_MAP[post.category] || post.category,
    excerpt: post.excerpt,
    image: post.image || '',
    imageCaption: post.imageCaption || '',
    date: post.date,
    updatedAt: post.updatedAt || post.date,
    tags: post.tags || []
  });

  return filtrados;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(AGENDADOS_PATH)) {
    console.log('data/agendados.json não existe. Nada a fazer.');
    return;
  }

  const agendados = JSON.parse(fs.readFileSync(AGENDADOS_PATH, 'utf-8'));
  const agora = new Date();

  const pendentesVencidos = agendados
    .filter(a => a.status === 'pendente' && new Date(a.publicarEm).getTime() <= agora.getTime())
    .sort((a, b) => new Date(a.publicarEm) - new Date(b.publicarEm));

  if (pendentesVencidos.length === 0) {
    console.log('Nenhum post agendado vencido no momento. Nada a fazer.');
    return;
  }

  if (!fs.existsSync(TEMPLATE_PATH)) throw new Error('Template não encontrado em blog/POST_TEMPLATE.html');
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  let postsAtuais = JSON.parse(fs.readFileSync(POSTS_JSON_PATH, 'utf-8'));
  const urlsParaIndexar = [];

  for (const item of pendentesVencidos) {
    try {
      console.log(`Publicando: ${item.title} (${item.id})`);
      postsAtuais = publicarItem(item, template, postsAtuais);
      urlsParaIndexar.push(`${SITE_BASE_URL}/blog/${item.id}`);

      // Marca como publicado
      const idx = agendados.findIndex(a => a.id === item.id);
      if (idx >= 0) {
        agendados[idx].status = 'publicado';
        agendados[idx].publicadoEm = agoraISO();
      }
    } catch (e) {
      console.error(`Falha ao publicar ${item.id}:`, e.message);
      const idx = agendados.findIndex(a => a.id === item.id);
      if (idx >= 0) {
        agendados[idx].status = 'erro';
        agendados[idx].erro = e.message;
      }
    }
  }

  fs.writeFileSync(POSTS_JSON_PATH, JSON.stringify(postsAtuais, null, 2), 'utf-8');
  fs.writeFileSync(SITEMAP_PATH, buildSitemapXML(postsAtuais), 'utf-8');

  // Itens já publicados não precisam continuar em agendados.json — o post já
  // existe em posts.json e aparece em "Gerenciar Posts" no admin. Manter eles
  // aqui só fazia o arquivo crescer sem limite (chegou a passar de 1MB, o que
  // quebrava a leitura no admin, já que a Contents API do GitHub só devolve o
  // conteúdo em base64 pra arquivos até 1MB). Mantém só pendente/erro.
  const agendadosFinal = agendados.filter(a => a.status !== 'publicado');
  fs.writeFileSync(AGENDADOS_PATH, JSON.stringify(agendadosFinal, null, 2), 'utf-8');

  await notifyIndexing(urlsParaIndexar);

  console.log(`✅ ${urlsParaIndexar.length} post(s) publicado(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
