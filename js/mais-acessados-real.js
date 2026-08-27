/*
 * Mais Acessados (real) — usado nas sidebars de artigos e ferramentas.
 *
 * A lista que fica "congelada" no HTML no momento da publicação é apenas um
 * fallback estático (5 posts curados). Este script, ao carregar a página,
 * busca o ranking REAL de acessos (mesma API/fonte usada na home em
 * "🔥 CONTEÚDOS MAIS ACESSADOS") e substitui o conteúdo do bloco
 * #mais-acessados-list pelos 5 posts realmente mais visitados no momento.
 *
 * Se a API falhar ou não responder, a lista estática original permanece
 * visível (nunca deixamos o card vazio).
 */
(function () {
  var VIEWS_API = 'https://calculaprazo-views-api.andersonfernand3s.workers.dev';
  // Muitas páginas de artigo antigas carregam CSS próprio dentro do HTML.
  // Esta camada final mantém o mesmo ajuste global nelas, sem alterar
  // celular ou tablet e sem precisar manter centenas de cópias de estilo.
  var layoutStyle = document.createElement('style');
  layoutStyle.id = 'cp-desktop-layout-adjustment';
  layoutStyle.textContent = '@media(min-width:1200px){.container{width:82% !important;max-width:1560px !important;}}.post-reading-area>div[style*="380px"]{max-height:none !important;background:#EFF6FF;}.post-reading-area>div[style*="380px"]>img,.post-cover{display:block;width:100%;height:auto !important;max-height:none !important;object-fit:contain !important;}.post-cover{background:#EFF6FF;}html{overflow-x:hidden;}@media(max-width:767px){.post-reading-area>div[style*="440px"]{height:220px !important;}}';
  document.head.appendChild(layoutStyle);
  var FALLBACK_TOP_IDS = [
    'aviso-previo-proporcional-como-calcular',
    'calculadora-de-verbas-trabalhistas-rescisao-clt',
    'estabilidade-emprego-gestante-acidente-trabalho-cipa-stf-tst-normas-coletivas',
    'assedio-moral-no-trabalho-como-provar',
    'demissao-por-justa-causa-quantas-advertencias-e-suspensoes'
  ];

  function fetchJSON(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; });
  }

  function buildItemHTML(post, slug, rank) {
    var img = post.image || '';
    var cat = post.category_label || post.category || '';
    var title = post.title || slug;
    return '<a class="sidebar-item" href="/blog/' + slug + '.html">'
      + '<span class="sidebar-item-thumb"><img src="' + img + '" alt="" loading="lazy">'
      + '<span class="sidebar-item-badge top">' + rank + '</span></span>'
      + '<span class="sidebar-item-body"><span class="sidebar-item-title">' + title + '</span>'
      + (cat ? '<span class="sidebar-item-cat">' + cat + '</span>' : '')
      + '</span></a>';
  }

  function render(container, slugs, postsById, currentSlug) {
    var filtered = slugs.filter(function (s) { return s !== currentSlug && postsById[s]; });
    var top5 = filtered.slice(0, 5);
    if (!top5.length) return; // mantém o fallback estático já presente no HTML

    container.innerHTML = top5.map(function (s, i) {
      return buildItemHTML(postsById[s], s, i + 1);
    }).join('');
  }

  function buildLatestItemHTML(post, slug) {
    var img = post.image || '';
    var cat = post.category_label || post.category || '';
    var title = post.title || slug;
    return '<a class="sidebar-item" href="/blog/' + slug + '.html">'
      + '<span class="sidebar-item-thumb"><img src="' + img + '" alt="" loading="lazy"></span>'
      + '<span class="sidebar-item-body"><span class="sidebar-item-title">' + title + '</span>'
      + (cat ? '<span class="sidebar-item-cat">' + cat + '</span>' : '')
      + '</span></a>';
  }

  function initUltimosConteudos() {
    var container = document.getElementById('ultimos-conteudos-list');
    if (!container) return;

    var aside = container.closest('.post-sidebar, .tool-sidebar');
    var currentSlug = aside ? aside.getAttribute('data-current-slug') || '' : '';

    fetchJSON('/data/posts.json?v=' + Date.now()).then(function (posts) {
      if (!Array.isArray(posts) || !posts.length) return; // sem dados, mantém fallback

      var latest = posts
        .filter(function (p) {
          var id = p.id || p.slug;
          return id && id !== currentSlug && p.date;
        })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })
        .slice(0, 5);

      if (!latest.length) return; // mantém o fallback estático já presente no HTML

      container.innerHTML = latest.map(function (p) {
        return buildLatestItemHTML(p, p.id || p.slug);
      }).join('');
    }).catch(function () {
      // qualquer erro: mantém a lista estática que já está no HTML
    });
  }

  function init() {
    var container = document.getElementById('mais-acessados-list');
    if (!container) return;

    var aside = container.closest('.post-sidebar, .tool-sidebar');
    var currentSlug = aside ? aside.getAttribute('data-current-slug') || '' : '';

    Promise.all([
      fetchJSON('/data/posts.json?v=' + Date.now()).catch(function () { return null; }),
      fetchJSON(VIEWS_API + '/top/30').catch(function () { return null; })
    ]).then(function (results) {
      var posts = results[0];
      var viewsData = results[1];

      if (!Array.isArray(posts) || !posts.length) return; // sem dados de posts, mantém fallback

      var postsById = {};
      posts.forEach(function (p) {
        var id = p.id || p.slug;
        if (id) postsById[id] = p;
      });

      var rankedSlugs = (viewsData && viewsData.top && viewsData.top.length)
        ? viewsData.top.map(function (t) { return t.slug || t; })
        : FALLBACK_TOP_IDS;

      render(container, rankedSlugs, postsById, currentSlug);
    }).catch(function () {
      // qualquer erro: mantém a lista estática que já está no HTML
    });
  }

  function initAll() {
    init();
    initUltimosConteudos();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
