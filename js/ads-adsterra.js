/* ════════════════════════════════════════════════════
   Calcula Prazo — Loader de anúncios Adsterra
   Uso: <div class="adst-slot" data-adst-key="KEY" data-adst-w="300" data-adst-h="250"
        style="width:300px;height:250px;max-width:100%;margin:0 auto;"></div>
   - Reserva o espaço via style inline (width/height) => sem CLS.
   - Carrega o anúncio só quando o slot está perto da viewport (lazy).
   - Cada anúncio roda isolado em /ads/adsterra-slot.html (mesma origem,
     mas fora do CSP restrito do site principal — ver _headers).
   ════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function loadSlot(el) {
    if (el.getAttribute('data-adst-loaded')) return;
    el.setAttribute('data-adst-loaded', '1');

    var key = el.getAttribute('data-adst-key');
    var w = parseInt(el.getAttribute('data-adst-w'), 10);
    var h = parseInt(el.getAttribute('data-adst-h'), 10);
    if (!key || !w || !h) return;

    var iframe = document.createElement('iframe');
    iframe.title = 'Publicidade';
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'width:' + w + 'px;height:' + h + 'px;max-width:100%;border:none;display:block;';
    iframe.src = '/ads/adsterra-slot.html?key=' + encodeURIComponent(key) + '&w=' + w + '&h=' + h;
    el.appendChild(iframe);
  }

  function init() {
    var slots = document.querySelectorAll('.adst-slot[data-adst-key]');
    if (!slots.length) return;

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            loadSlot(entry.target);
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '200px 0px' });
      slots.forEach(function (el) { io.observe(el); });
    } else {
      // Fallback sem IntersectionObserver: carrega tudo direto
      slots.forEach(loadSlot);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
