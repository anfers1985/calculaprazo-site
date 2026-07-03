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
        if (r.ok) renderViewCount(slug);
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

  /* ── API pública ─────────────────────────────────────────── */
  window.CPViews = {
    trackView: trackView,
    trackCalc: trackCalc,
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
