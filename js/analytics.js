/**
 * analytics.js — Contador de visualizações via Cloudflare Workers KV
 * Calcula Prazo — calculaprazo.com.br
 */
(function() {
  'use strict';

  var WORKER_URL  = 'https://calculaprazo-views-api.andersonfernand3s.workers.dev';
  var TRACKED_KEY = 'cp_tracked_';
  var VIEW_DELAY  = 8000; // 8s antes de contar

  /* ── Extrair slug da URL ─────────────────────────────────── */
  function slugFromPath(path) {
    // Aceita: /blog/meu-artigo  /blog/meu-artigo.html  /blog/meu-artigo/
    var m = path.match(/^\/blog\/(.+?)(?:\.html)?(?:\/)?(?:[?#]|$)/);
    return m ? m[1] : null;
  }

  /* ── Registrar view (POST) ───────────────────────────────── */
  function trackView(slug) {
    if (!slug) return;
    try {
      if (sessionStorage.getItem(TRACKED_KEY + slug)) return;
      sessionStorage.setItem(TRACKED_KEY + slug, '1');
    } catch(e) {}

    setTimeout(function() {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var tid  = ctrl ? setTimeout(function() { ctrl.abort(); }, 5000) : null;
      fetch(WORKER_URL + '/view/' + encodeURIComponent(slug), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        mode:    'cors',
        signal:  ctrl ? ctrl.signal : undefined
      })
      .then(function(r) {
        if (tid) clearTimeout(tid);
        // contagem pública removida — a leitura continua sendo registrada no Worker
        // e fica visível só no painel /admin (Gerenciar Posts)
      })
      .catch(function(e) {
        if (tid) clearTimeout(tid);
        if (e && e.name !== 'AbortError') {
          console.warn('[CPViews] erro ao registrar view:', e.message);
        }
      });
    }, VIEW_DELAY);
  }

  /* ── Buscar views (GET) ──────────────────────────────────── */
  function getViews(slug, callback) {
    if (!slug) { callback(0); return; }
    fetch(WORKER_URL + '/view/' + encodeURIComponent(slug), { mode: 'cors' })
      .then(function(r) { return r.ok ? r.json() : { views: 0 }; })
      .then(function(d) { callback(d.views || 0); })
      .catch(function()  { callback(0); });
  }

  /* ── Buscar Top N ────────────────────────────────────────── */
  function getTop(limit, callback) {
    limit = limit || 10;
    fetch(WORKER_URL + '/top/' + limit, { mode: 'cors' })
      .then(function(r) { return r.ok ? r.json() : { top: [] }; })
      .then(function(d) { callback(d.top || []); })
      .catch(function()  { callback([]); });
  }

  /* ── Contagem de leituras NÃO é mais exibida no artigo ─────
     O número continua sendo gravado no Worker (POST /view/:slug) e pode ser
     consultado no admin. Mantida como função vazia só para compatibilidade
     com chamadas antigas (CPViews.render). */
  function renderViewCount() { /* intencionalmente vazio */ }

  /* ── Contador de uso de calculadoras (todo clique conta) ──── */
  /* Diferente de trackView: sem dedup por sessão e sem delay —
     cada cálculo concluído com sucesso soma +1 imediatamente,
     e o total é exibido publicamente ao lado do resultado. */
  function trackCalc(slug, displayElId) {
    if (!slug) return;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var tid  = ctrl ? setTimeout(function() { ctrl.abort(); }, 5000) : null;
    fetch(WORKER_URL + '/view/' + encodeURIComponent(slug), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      mode:    'cors',
      signal:  ctrl ? ctrl.signal : undefined
    })
    .then(function(r) {
      if (tid) clearTimeout(tid);
      return r.ok ? r.json() : null;
    })
    .then(function(d) {
      if (!d || !displayElId) return;
      var el = document.getElementById(displayElId);
      if (!el) return;
      var n = d.views || 0;
      el.textContent = '🧮 ' + n.toLocaleString('pt-BR') + (n === 1 ? ' pessoa já usou esta calculadora' : ' pessoas já usaram esta calculadora');
      el.style.display = 'flex';
    })
    .catch(function(e) {
      if (tid) clearTimeout(tid);
    });
  }

  /* ── Acessos às PÁGINAS de ferramentas/calculadoras ────────────
     Conta 1 acesso por aba/sessão para cada ferramenta (sessionStorage), depois de 3s
     na página, e fica visível só no admin ("Acessos às Ferramentas"). Vai para
     POST /pv/:slug (prefixo "p:" no KV), separado dos artigos (/view/) e dos
     cálculos concluídos (trackCalc). Para a ferramenta nova entrar na contagem,
     basta incluir o slug do diretório em TOOL_PAGES (e em TOOLS no admin, p/ nome). */
  var TOOL_PAGES = {
    'calculadora-de-prazo-processual':1, 'calculadora-de-datas':1, 'calculadora-de-prescricao':1,
    'calculadora-verbas-trabalhistas':1, 'calculadora-salario-liquido':1, 'calculadora-salario-intermitente':1,
    'calculadora-horas-extras':1, 'calculadora-seguro-desemprego':1, 'calculadora-rescisao-domestica':1,
    'calculadora-de-juros':1, 'calculadora-de-porcentagem':1, 'calculadora-imc':1,
    'correcao-monetaria':1, 'conversor-de-moedas':1, 'numero-por-extenso':1,
    'validador-cpf-cnpj':1, 'gerador-de-qr-code':1, 'gerador-de-senhas':1,
    'ferramentas':1
  };
  var PV_KEY   = 'cp_pv_';
  var PV_DELAY = 3000; // 3s na página antes de contar (filtra bots e aberturas acidentais)

  function toolSlugFromPath(path) {
    // /calculadora-de-datas  /calculadora-de-datas/  /calculadora-de-datas/index.html
    var m = (path || '').match(/^\/([a-z0-9-]+)(?:\/index\.html|\/)?$/);
    return (m && TOOL_PAGES[m[1]]) ? m[1] : null;
  }

  var pvPending = {};
  function trackPage(slug) {
    if (!slug) return;
    try { if (navigator.webdriver) return; } catch(e) {}
    if (pvPending[slug]) return;
    try { if (sessionStorage.getItem(PV_KEY + slug)) return; } catch(e) {}
    pvPending[slug] = true;

    setTimeout(function() {
      pvPending[slug] = false;
      // só conta se a pessoa ainda estiver nessa ferramenta depois do atraso
      // (na home/SPA, quem sai antes dos 3s não é contado e pode ser contado numa próxima visita)
      if (toolSlugFromPath(window.location.pathname) !== slug) return;
      try { sessionStorage.setItem(PV_KEY + slug, '1'); } catch(e) {}
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var tid  = ctrl ? setTimeout(function() { ctrl.abort(); }, 5000) : null;
      fetch(WORKER_URL + '/pv/' + encodeURIComponent(slug), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        mode:    'cors',
        keepalive: true,
        signal:  ctrl ? ctrl.signal : undefined
      })
      .then(function() { if (tid) clearTimeout(tid); })
      .catch(function(e) { if (tid) clearTimeout(tid); });
    }, PV_DELAY);
  }

  function onRoute() { trackPage(toolSlugFromPath(window.location.pathname)); }

  /* A home é uma SPA: abrir uma calculadora por ali troca a URL com pushState,
     sem recarregar a página. Observamos pushState/popstate para não perder esses acessos. */
  try {
    var _push = window.history.pushState;
    window.history.pushState = function() {
      var r = _push.apply(this, arguments);
      try { onRoute(); } catch(e) {}
      return r;
    };
    window.addEventListener('popstate', function() { try { onRoute(); } catch(e) {} });
  } catch(e) {}

  /* ── API pública ─────────────────────────────────────────── */
  window.CPViews = {
    trackView: trackView,
    trackCalc: trackCalc,
    trackPage: trackPage,
    getViews:  getViews,
    getTop:    getTop,
    render:    renderViewCount
  };

  /* ── Auto-track: roda imediatamente (sem esperar DOMContentLoaded) ── */
  var currentSlug = slugFromPath(window.location.pathname);
  if (currentSlug) {
    // Track imediato (o setTimeout interno já tem delay de 8s)
    trackView(currentSlug);
  }

  // Página de ferramenta aberta direto pela URL (o setTimeout interno já tem delay de 3s)
  onRoute();

})();
