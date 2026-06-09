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
    var m = path.match(/^\/blog\/([^/?#]+?)(?:\.html)?(?:\/)?(?:[?#]|$)/);
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
      fetch(WORKER_URL + '/view/' + encodeURIComponent(slug), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      }).catch(function() {});
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

  /* ── Exibir contagem no artigo ───────────────────────────── */
  function renderViewCount(slug) {
    var el = document.getElementById('post-view-count');
    if (!el) return;
    getViews(slug, function(n) {
      if (n > 0) {
        el.textContent = n.toLocaleString('pt-BR') + (n === 1 ? ' leitura' : ' leituras');
        el.style.display = 'inline';
      }
    });
  }

  /* ── API pública ─────────────────────────────────────────── */
  window.CPViews = {
    trackView: trackView,
    getViews:  getViews,
    getTop:    getTop,
    render:    renderViewCount
  };

  /* ── Auto-track: roda imediatamente (sem esperar DOMContentLoaded) ── */
  var currentSlug = slugFromPath(window.location.pathname);
  if (currentSlug) {
    // Track imediato (o setTimeout interno já tem delay de 8s)
    trackView(currentSlug);

    // Renderizar contagem: aguardar DOM se necessário
    function doRender() { renderViewCount(currentSlug); }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doRender);
    } else {
      // DOM já disponível (script carregado com defer após parse)
      doRender();
    }
  }

})();
