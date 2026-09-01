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

  /* ── Native Banner: altura dinâmica, isolado via /ads/adsterra-native-slot.html ── */
  function loadNativeSlot(el) {
    if (el.getAttribute('data-adst-loaded')) return;
    el.setAttribute('data-adst-loaded', '1');

    var iframe = document.createElement('iframe');
    iframe.title = 'Publicidade';
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'width:100%;height:0;border:none;display:block;';
    iframe.src = '/ads/adsterra-native-slot.html';
    el.appendChild(iframe);
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data || typeof ev.data.adsterraNativeHeight !== 'number') return;
    var frames = document.querySelectorAll('.adst-native-slot iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === ev.source) {
        frames[i].style.height = ev.data.adsterraNativeHeight + 'px';
        break;
      }
    }
  });

  function init() {
    var slots = document.querySelectorAll('.adst-slot[data-adst-key]');
    var nativeSlots = document.querySelectorAll('.adst-native-slot');

    if ('IntersectionObserver' in window) {
      if (slots.length) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              loadSlot(entry.target);
              io.unobserve(entry.target);
            }
          });
        }, { rootMargin: '200px 0px' });
        slots.forEach(function (el) { io.observe(el); });
      }
      if (nativeSlots.length) {
        var ioN = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              loadNativeSlot(entry.target);
              ioN.unobserve(entry.target);
            }
          });
        }, { rootMargin: '200px 0px' });
        nativeSlots.forEach(function (el) { ioN.observe(el); });
      }
    } else {
      // Fallback sem IntersectionObserver: carrega tudo direto
      slots.forEach(loadSlot);
      nativeSlots.forEach(loadNativeSlot);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
