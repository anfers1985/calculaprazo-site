/* ══════════════════════════════════════════════════════════════
   Busca global do Calcula Prazo
   - Filtra, no navegador, a lista de ferramentas + os artigos de
     /data/posts.json (reaproveita window.__cpFetchPosts quando
     blog.min.js já a definiu, evitando uma 2ª busca do arquivo).
   - Abre pelo ícone de lupa do header (mobile e desktop) ou pelo
     atalho de teclado "/".
   - Ao digitar: prévia (até 6 ferramentas + 6 artigos) com o botão
     "Ver todos os resultados" (ou Enter). A lista completa tem filtros
     (Tudo / Ferramentas / Conteúdo + seção), ordenação (mais relevantes /
     mais recentes) e paginação de 10 em 10.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TOOLS = [
    { name: 'Calculadora de Prazo Processual', desc: 'Dias úteis e corridos, CLT e CPC, mais de 30 tipos de prazo', url: '/calculadora-de-prazo-processual' },
    { name: 'Calculadora de Verbas Trabalhistas', desc: 'Rescisão CLT completa: aviso prévio, férias, 13º, FGTS e multas', url: '/calculadora-verbas-trabalhistas' },
    { name: 'Correção Monetária', desc: 'IPCA, IGP-M, INPC e SELIC com dados reais do Banco Central', url: '/correcao-monetaria' },
    { name: 'Salário Líquido', desc: 'Simule o holerite com as tabelas de INSS e IRRF atualizadas', url: '/calculadora-salario-liquido' },
    { name: 'Cálculo de Juros', desc: 'Juros simples e compostos, mensal ou anual', url: '/calculadora-de-juros' },
    { name: 'Salário Intermitente', desc: 'Cálculo de salário para contrato de trabalho intermitente', url: '/calculadora-salario-intermitente' },
    { name: 'Horas Extras', desc: 'Cálculo de horas extras com adicional de 50% ou 100%', url: '/calculadora-horas-extras' },
    { name: 'Seguro-Desemprego', desc: 'Número de parcelas e valores do seguro-desemprego', url: '/calculadora-seguro-desemprego' },
    { name: 'Rescisão Doméstica', desc: 'Cálculo de rescisão para empregado doméstico', url: '/calculadora-rescisao-domestica' },
    { name: 'Calculadora de Prescrição', desc: 'Prazos prescricionais trabalhistas e cíveis', url: '/calculadora-de-prescricao' },
    { name: 'Porcentagem', desc: 'Cálculos de porcentagem em geral', url: '/calculadora-de-porcentagem' },
    { name: 'Conversor de Moedas', desc: 'Cotação atualizada entre moedas', url: '/conversor-de-moedas' },
    { name: 'Operações com Datas', desc: 'Diferença entre datas, somar ou subtrair dias', url: '/calculadora-de-datas' },
    { name: 'Validador de CPF / CNPJ', desc: 'Verifica se um CPF ou CNPJ é válido', url: '/validador-cpf-cnpj' },
    { name: 'Gerador de QR Code', desc: 'Gera QR Code a partir de texto ou link', url: '/gerador-de-qr-code' },
    { name: 'Gerador de Senhas', desc: 'Senhas aleatórias e seguras', url: '/gerador-de-senhas' },
    { name: 'Número por Extenso', desc: 'Converte números em texto por extenso', url: '/numero-por-extenso' },
    { name: 'Calculadora de IMC', desc: 'Índice de Massa Corporal segundo a OMS', url: '/calculadora-imc' }
  ];

  var PAGE_SIZE = 10;

  // Seções do site (mesmas de blog.js → BLOG_SEC_MAP / BLOG_CAT_META)
  var SECTIONS = [
    { key: 'jurisprudencia',    name: 'Jurisprudência',     cats: ['jurisprudencia-tst','jurisprudencia-trts','jurisprudencia-stj','jurisprudencia-stf','jurisprudencia-outros','jurisprudencia'] },
    { key: 'orgaos-publicos',   name: 'Órgãos Públicos',    cats: ['noticias-mte-mpt','noticias-mte','noticias-mpt','orgaos-outros'] },
    { key: 'legislacao-normas', name: 'Legislação e Normas',cats: ['legislacao-normas','legislacao-clt','legislacao-cf','esocial-fgts-digital','esocial','fgts-digital','legislacao-previdenciario','legislacao-sindical','sindical','legislacao-portarias','legislacao-nr','legislacao-outros'] },
    { key: 'rh-gestao',         name: 'RH e Gestão',        cats: ['orientacoes-praticas','saude-seguranca','rh-folha','rh-jornada','rh-contrato','rh-salario','rh-rescisao','rh-beneficios','rh-ctps','rh-sindical','rh-fiscalizacao','rh-inss','rh-modelos','rh-outros','rh-gestao'] },
    { key: 'processual',        name: 'Processual',         cats: ['artigos','modelos','processual-peticoes','processual-pratica','processual-analises','processual-outros','processual-sumulas-tst','processual'] },
    { key: 'essenciais',        name: 'Essenciais',         cats: ['essenciais-livros','essenciais-equipamentos','essenciais-cursos','essenciais-outros','essenciais'] },
    { key: 'outros',            name: 'Outros',             cats: ['geral','outros'] }
  ];
  var CAT_TO_SEC = {};
  SECTIONS.forEach(function (s) { s.cats.forEach(function (c) { CAT_TO_SEC[c] = s.key; }); });
  function secOf(p) { return CAT_TO_SEC[p.category] || 'outros'; }

  var postsCache = null;
  function getPosts() {
    if (postsCache) return Promise.resolve(postsCache);
    var fetcher = window.__cpFetchPosts ? window.__cpFetchPosts() : fetch('/data/posts.json?v=' + Date.now()).then(function (r) { return r.ok ? r.json() : []; });
    return fetcher.then(function (posts) {
      postsCache = Array.isArray(posts) ? posts : [];
      return postsCache;
    }).catch(function () { return []; });
  }

  function norm(s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function formatDate(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Estilos próprios da lista completa (classes novas, prefixo ssm-) ──
  function injectStyles() {
    if (document.getElementById('ssm-extra-css')) return;
    var st = document.createElement('style');
    st.id = 'ssm-extra-css';
    st.textContent =
      '#site-search-filters{display:none;flex-shrink:0;padding:10px 12px 8px;border-bottom:1px solid var(--brd);font-family:var(--fh);}' +
      '#site-search-modal.ssm-full #site-search-filters{display:block;}' +
      '.ssm-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;}' +
      '.ssm-chips::-webkit-scrollbar{display:none;}' +
      '.ssm-chips+.ssm-chips{margin-top:8px;}' +
      '.ssm-chip{flex-shrink:0;border:1.5px solid var(--brd);background:var(--card);color:var(--txt-m);font:600 .78rem var(--fh);padding:6px 12px;border-radius:999px;cursor:pointer;white-space:nowrap;}' +
      '.ssm-chip:hover{border-color:var(--acc);color:var(--acc);}' +
      '.ssm-chip.on{background:var(--acc);border-color:var(--acc);color:#fff;}' +
      '.ssm-chip small{font-weight:600;opacity:.75;margin-left:4px;}' +
      '.ssm-chips.ssm-sub .ssm-chip{font-size:.74rem;padding:5px 10px;background:var(--b50);}' +
      '.ssm-chips.ssm-sub .ssm-chip.on{background:var(--acc);}' +
      '.ssm-sortrow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:.78rem;color:var(--txt-m);}' +
      '.ssm-sortrow select{font:600 .78rem var(--fh);color:var(--txt);border:1.5px solid var(--brd);border-radius:8px;padding:4px 8px;background:var(--card);}' +
      '.ssm-more{display:block;width:calc(100% - 12px);margin:8px 6px 6px;padding:10px 12px;border:1.5px solid var(--acc);background:var(--b50);color:var(--acc);font:700 .84rem var(--fh);border-radius:10px;cursor:pointer;}' +
      '.ssm-more:hover{background:var(--acc);color:#fff;}' +
      '.ssm-pager{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px;padding:12px 6px 10px;}' +
      '.ssm-pg{min-width:34px;height:34px;padding:0 8px;border:1.5px solid var(--brd);background:var(--card);color:var(--txt-m);font:700 .8rem var(--fh);border-radius:8px;cursor:pointer;}' +
      '.ssm-pg:hover:not(:disabled){border-color:var(--acc);color:var(--acc);}' +
      '.ssm-pg.on{background:var(--acc);border-color:var(--acc);color:#fff;}' +
      '.ssm-pg:disabled{opacity:.4;cursor:default;}' +
      '.ssm-dots{color:var(--txt-s);padding:0 2px;}' +
      '.ssm-count{padding:8px 10px 0;font-size:.78rem;color:var(--txt-m);}' +
      '@media(min-width:601px){#site-search-modal.ssm-full{max-height:86vh;height:86vh;}#site-search-overlay{padding-top:6vh;}}';
    document.head.appendChild(st);
  }

  var modal, input, resultsEl, filtersEl, lastFocused;
  var state = { q: '', mode: 'preview', type: 'all', sec: '', sort: 'rel', page: 1 };
  var lastPosts = [], lastTools = [];

  function buildModal() {
    injectStyles();
    var overlay = document.createElement('div');
    overlay.id = 'site-search-overlay';
    overlay.innerHTML =
      '<div id="site-search-modal" role="dialog" aria-modal="true" aria-label="Buscar no site">' +
      '  <div class="ssm-topbar">' +
      '    <div class="ssm-topbar-brand"><img src="/icon-192.png" alt="" width="22" height="22"><span>Calcula Prazo</span></div>' +
      '    <button id="site-search-close-top" aria-label="Fechar busca">✕</button>' +
      '  </div>' +
      '  <div class="ssm-bar">' +
      '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '    <input id="site-search-input" type="text" placeholder="Buscar ferramentas e artigos..." autocomplete="off">' +
      '    <button id="site-search-close" aria-label="Fechar busca">✕</button>' +
      '  </div>' +
      '  <div id="site-search-filters"></div>' +
      '  <div id="site-search-results"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSearch();
    });
    document.getElementById('site-search-close').addEventListener('click', closeSearch);
    document.getElementById('site-search-close-top').addEventListener('click', closeSearch);
    input = document.getElementById('site-search-input');
    resultsEl = document.getElementById('site-search-results');
    filtersEl = document.getElementById('site-search-filters');
    input.addEventListener('input', function () {
      state.q = input.value; state.mode = 'preview'; state.page = 1;
      runSearch();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && norm(input.value.trim())) {
        e.preventDefault();
        showAll();
      }
    });
    // delegação de cliques (filtros, ordenação, paginação, "ver todos")
    overlay.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-ssm]') : null;
      if (!el) return;
      var act = el.getAttribute('data-ssm'), val = el.getAttribute('data-v');
      if (act === 'all') { showAll(); return; }
      if (act === 'type') { state.type = val; state.sec = ''; state.page = 1; }
      else if (act === 'sec') { state.sec = (state.sec === val) ? '' : val; state.page = 1; }
      else if (act === 'page') { state.page = parseInt(val, 10) || 1; }
      renderFull(true);
    });
    overlay.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'ssm-sort') { state.sort = e.target.value; state.page = 1; renderFull(true); }
    });
    modal = overlay;
  }

  function renderEmpty() {
    modal.querySelector('#site-search-modal').classList.remove('ssm-full');
    filtersEl.innerHTML = '';
    resultsEl.innerHTML = '<div class="ssm-hint">Digite para buscar entre as 18 ferramentas e os artigos do site.</div>';
  }

  // ── Busca: todos os termos precisam aparecer (título, resumo, categoria, tags) ──
  function tokens(qRaw) {
    return norm(qRaw.trim()).split(/\s+/).filter(Boolean);
  }
  function scoreItem(toks, fields) {
    var total = 0;
    for (var i = 0; i < toks.length; i++) {
      var best = 0;
      for (var j = 0; j < fields.length; j++) {
        var f = fields[j];
        if (f.t.indexOf(toks[i]) !== -1) {
          var s = f.w + (f.t.indexOf(toks[i]) === 0 ? 1 : 0);
          if (s > best) best = s;
        }
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  }
  function matchTools(toks) {
    var out = [];
    TOOLS.forEach(function (t) {
      var s = scoreItem(toks, [{ t: norm(t.name), w: 6 }, { t: norm(t.desc), w: 2 }]);
      if (s) out.push({ kind: 'tool', item: t, score: s });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  }
  function matchPosts(toks, posts) {
    var out = [];
    posts.forEach(function (p) {
      var s = scoreItem(toks, [
        { t: norm(p.title), w: 6 },
        { t: norm(p.category_label), w: 3 },
        { t: norm((p.tags || []).join(' ')), w: 3 },
        { t: norm(p.excerpt), w: 2 }
      ]);
      if (s) out.push({ kind: 'post', item: p, score: s, date: p.date || '' });
    });
    return out;
  }
  function byRelevance(a, b) { return (b.score - a.score) || (b.date || '').localeCompare(a.date || ''); }
  function byDate(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.score - a.score); }

  function itemHtml(r) {
    if (r.kind === 'tool') {
      var t = r.item;
      return '<a class="ssm-item" href="' + t.url + '"><span class="ssm-item-title">' + escapeHtml(t.name) + '</span><span class="ssm-item-desc">' + escapeHtml(t.desc) + '</span></a>';
    }
    var p = r.item;
    var url = '/blog/' + p.id + '.html';
    var meta = [p.category_label || '', formatDate(p.date)].filter(Boolean).join(' · ');
    return '<a class="ssm-item" href="' + url + '"><span class="ssm-item-title">' + escapeHtml(p.title) + '</span><span class="ssm-item-desc">' + escapeHtml(meta) + '</span></a>';
  }

  function runSearch() {
    var toks = tokens(state.q);
    if (!toks.length) { renderEmpty(); return; }
    resultsEl.innerHTML = '<div class="ssm-loading">Buscando...</div>';
    var myQ = state.q;
    getPosts().then(function (posts) {
      if (myQ !== state.q) return; // resposta antiga
      lastTools = matchTools(toks);
      lastPosts = matchPosts(toks, posts);
      if (state.mode === 'full') renderFull(false); else renderPreview();
    });
  }

  function renderPreview() {
    modal.querySelector('#site-search-modal').classList.remove('ssm-full');
    filtersEl.innerHTML = '';
    if (!lastTools.length && !lastPosts.length) {
      resultsEl.innerHTML = '<div class="ssm-hint">Nada encontrado para "' + escapeHtml(state.q) + '".</div>';
      return;
    }
    var tools = lastTools.slice(0, 6);
    var posts = lastPosts.slice().sort(byRelevance).slice(0, 6);
    var html = '';
    if (tools.length) {
      html += '<div class="ssm-group-label">Ferramentas</div>';
      tools.forEach(function (r) { html += itemHtml(r); });
    }
    if (posts.length) {
      html += '<div class="ssm-group-label">Artigos</div>';
      posts.forEach(function (r) { html += itemHtml(r); });
    }
    var total = lastTools.length + lastPosts.length;
    html += '<button type="button" class="ssm-more" data-ssm="all">Ver todos os resultados (' + total + ')</button>';
    resultsEl.innerHTML = html;
  }

  function showAll() {
    var toks = tokens(state.q);
    if (!toks.length) return;
    state.mode = 'full'; state.type = 'all'; state.sec = ''; state.sort = 'rel'; state.page = 1;
    if (!lastTools.length && !lastPosts.length) { runSearch(); return; }
    renderFull(true);
  }

  function chip(act, val, label, count, on) {
    return '<button type="button" class="ssm-chip' + (on ? ' on' : '') + '" data-ssm="' + act + '" data-v="' + val + '">' + label + (count != null ? '<small>' + count + '</small>' : '') + '</button>';
  }

  function pagerHtml(page, pages) {
    if (pages <= 1) return '';
    var nums = [], i;
    for (i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
      else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    var h = '<div class="ssm-pager" role="navigation" aria-label="Páginas de resultados">';
    h += '<button type="button" class="ssm-pg" data-ssm="page" data-v="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Página anterior">‹</button>';
    nums.forEach(function (n) {
      if (n === '…') h += '<span class="ssm-dots">…</span>';
      else h += '<button type="button" class="ssm-pg' + (n === page ? ' on' : '') + '" data-ssm="page" data-v="' + n + '"' + (n === page ? ' aria-current="page"' : '') + '>' + n + '</button>';
    });
    h += '<button type="button" class="ssm-pg" data-ssm="page" data-v="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="Próxima página">›</button>';
    return h + '</div>';
  }

  function renderFull(scrollTop) {
    modal.querySelector('#site-search-modal').classList.add('ssm-full');

    var nTools = lastTools.length, nPosts = lastPosts.length;
    var secCount = {};
    lastPosts.forEach(function (r) { var k = secOf(r.item); secCount[k] = (secCount[k] || 0) + 1; });

    // filtros
    var fh = '<div class="ssm-chips">' +
      chip('type', 'all', 'Tudo', nTools + nPosts, state.type === 'all') +
      chip('type', 'tools', 'Ferramentas', nTools, state.type === 'tools') +
      chip('type', 'content', 'Conteúdo', nPosts, state.type === 'content') +
      '</div>';
    if (state.type === 'content') {
      fh += '<div class="ssm-chips ssm-sub">';
      SECTIONS.forEach(function (s) {
        if (secCount[s.key]) fh += chip('sec', s.key, s.name, secCount[s.key], state.sec === s.key);
      });
      fh += '</div>';
    }
    fh += '<div class="ssm-sortrow"><span>Ordenar por</span><select id="ssm-sort" aria-label="Ordenar resultados">' +
      '<option value="rel"' + (state.sort === 'rel' ? ' selected' : '') + '>Mais relevantes</option>' +
      '<option value="date"' + (state.sort === 'date' ? ' selected' : '') + '>Mais recentes</option></select></div>';
    filtersEl.innerHTML = fh;

    // lista conforme filtros
    var cmp = state.sort === 'date' ? byDate : byRelevance;
    var tools = (state.type === 'all' || state.type === 'tools') ? lastTools.slice() : [];
    var posts = (state.type === 'all' || state.type === 'content') ? lastPosts.slice() : [];
    if (state.type === 'content' && state.sec) posts = posts.filter(function (r) { return secOf(r.item) === state.sec; });
    posts.sort(cmp);
    var list = tools.concat(posts);

    if (!list.length) {
      resultsEl.innerHTML = '<div class="ssm-hint">Nada encontrado para "' + escapeHtml(state.q) + '" com esses filtros.</div>';
      return;
    }
    var pages = Math.ceil(list.length / PAGE_SIZE);
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var from = (state.page - 1) * PAGE_SIZE;
    var slice = list.slice(from, from + PAGE_SIZE);

    var html = '<div class="ssm-count">' + list.length + (list.length === 1 ? ' resultado' : ' resultados') + (pages > 1 ? ' · página ' + state.page + ' de ' + pages : '') + '</div>';
    var lastKind = '';
    slice.forEach(function (r) {
      if (r.kind !== lastKind) {
        html += '<div class="ssm-group-label">' + (r.kind === 'tool' ? 'Ferramentas' : 'Artigos') + '</div>';
        lastKind = r.kind;
      }
      html += itemHtml(r);
    });
    html += pagerHtml(state.page, pages);
    resultsEl.innerHTML = html;
    if (scrollTop) resultsEl.scrollTop = 0;
  }

  function openSearch() {
    if (!modal) buildModal();
    lastFocused = document.activeElement;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    state = { q: '', mode: 'preview', type: 'all', sec: '', sort: 'rel', page: 1 };
    lastPosts = []; lastTools = [];
    renderEmpty();
    input.value = '';
    setTimeout(function () { input.focus(); }, 30);
  }

  function closeSearch() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  window.openSiteSearch = openSearch;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
      closeSearch();
      return;
    }
    if (e.key === '/' && (!modal || !modal.classList.contains('open'))) {
      var tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      var editable = document.activeElement && document.activeElement.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || editable) return;
      e.preventDefault();
      openSearch();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var btns = document.querySelectorAll('.hdr-search-btn, #hdr-search-btn-desktop');
    btns.forEach(function (b) { b.addEventListener('click', openSearch); });
  });
})();
