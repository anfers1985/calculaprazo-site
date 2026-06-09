/**
 * analytics.js — Contador de visualizações via Cloudflare Workers KV
 * Calcula Prazo — calculaprazo.com.br
 */
(function() {
  'use strict';

  var WORKER_URL = 'https://calculaprazo-views-api.andersonfernand3s.workers.dev';
  var TRACKED_KEY = 'cp_tracked_';
  var VIEW_DELAY  = 8000; // 8s antes de contar (filtra bots e bounces rápidos)

  /* ── Registrar view ──────────────────────────────────────── */
  function trackView(slug) {
    if (!slug) return;
    // Evitar contar a mesma visita mais de uma vez por sessão
    try {
      if (sessionStorage.getItem(TRACKED_KEY + slug)) return;
      sessionStorage.setItem(TRACKED_KEY + slug, '1');
    } catch(e) {}

    setTimeout(function() {
      fetch(WORKER_URL + '/view/' + encodeURIComponent(slug), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(function() {}); // silencioso — não quebra o artigo
    }, VIEW_DELAY);
  }

  /* ── Buscar views de um slug ─────────────────────────────── */
  function getViews(slug, callback) {
    if (!slug) { callback(0); return; }
    fetch(WORKER_URL + '/view/' + encodeURIComponent(slug))
      .then(function(r) { return r.ok ? r.json() : { views: 0 }; })
      .then(function(d) { callback(d.views || 0); })
      .catch(function()  { callback(0); });
  }

  /* ── Buscar Top N slugs por views ───────────────────────── */
  function getTop(limit, callback) {
    limit = limit || 10;
    fetch(WORKER_URL + '/top/' + limit)
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

  /* ── Auto-track em posts do blog ─────────────────────────── */
  if (window.location.pathname.indexOf('/blog/') === 0) {
    var slug = window.location.pathname.replace('/blog/', '').replace('.html', '');
    if (slug) {
      trackView(slug);
      // Renderizar contagem após carregar
      document.addEventListener('DOMContentLoaded', function() {
        renderViewCount(slug);
      });
    }
  }

})();
