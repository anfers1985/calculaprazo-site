/* ══════════════════════════════════════════════════════════════
   Busca global do Calcula Prazo
   - Filtra, no navegador, a lista de ferramentas + os artigos de
     /data/posts.json (reaproveita window.__cpFetchPosts quando
     blog.min.js já a definiu, evitando uma 2ª busca do arquivo).
   - Abre pelo ícone de lupa do header (mobile e desktop) ou pelo
     atalho de teclado "/".
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

  var modal, input, resultsEl, lastFocused;

  function buildModal() {
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
    input.addEventListener('input', function () { runSearch(input.value); });
    modal = overlay;
  }

  function renderEmpty() {
    resultsEl.innerHTML = '<div class="ssm-hint">Digite para buscar entre as 18 ferramentas e os artigos do site.</div>';
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function runSearch(qRaw) {
    var q = norm(qRaw.trim());
    if (!q) { renderEmpty(); return; }

    var toolMatches = TOOLS.filter(function (t) {
      return norm(t.name).indexOf(q) !== -1 || norm(t.desc).indexOf(q) !== -1;
    }).slice(0, 6);

    resultsEl.innerHTML = '<div class="ssm-loading">Buscando...</div>';

    getPosts().then(function (posts) {
      var postMatches = posts.filter(function (p) {
        return norm(p.title).indexOf(q) !== -1 || norm(p.excerpt).indexOf(q) !== -1 || norm(p.category_label).indexOf(q) !== -1;
      }).slice(0, 6);

      if (!toolMatches.length && !postMatches.length) {
        resultsEl.innerHTML = '<div class="ssm-hint">Nada encontrado para "' + escapeHtml(qRaw) + '".</div>';
        return;
      }

      var html = '';
      if (toolMatches.length) {
        html += '<div class="ssm-group-label">Ferramentas</div>';
        toolMatches.forEach(function (t) {
          html += '<a class="ssm-item" href="' + t.url + '"><span class="ssm-item-title">' + escapeHtml(t.name) + '</span><span class="ssm-item-desc">' + escapeHtml(t.desc) + '</span></a>';
        });
      }
      if (postMatches.length) {
        html += '<div class="ssm-group-label">Artigos</div>';
        postMatches.forEach(function (p) {
          var url = '/blog/' + p.id + '.html';
          var meta = [p.category_label || '', formatDate(p.date)].filter(Boolean).join(' · ');
          html += '<a class="ssm-item" href="' + url + '"><span class="ssm-item-title">' + escapeHtml(p.title) + '</span><span class="ssm-item-desc">' + escapeHtml(meta) + '</span></a>';
        });
      }
      resultsEl.innerHTML = html;
    });
  }

  function openSearch() {
    if (!modal) buildModal();
    lastFocused = document.activeElement;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
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
