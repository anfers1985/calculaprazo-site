/* Calcula Prazo — menu mobile das páginas que não carregam o styles.css (artigos, súmulas, institucionais).
   Mesmo comportamento da home: fundo escurecido atrás do menu (até 768px) e fechamento ao tocar fora do
   cabeçalho ou ao apertar Esc. Se a página não tiver o cabeçalho/menu, não faz nada. */
(function () {
  'use strict';

  function init() {
    var hdr = document.getElementById('hdr');
    var nav = document.querySelector('.hdr-nav');
    var burger = document.getElementById('hdr-burger');
    if (!hdr || !nav || !burger) return;

    if (!document.getElementById('cp-menu-style')) {
      var st = document.createElement('style');
      st.id = 'cp-menu-style';
      st.textContent =
        '@media (max-width: 768px){body:has(.hdr-nav.mob-open)::after{content:"";position:fixed;inset:0;' +
        'background:rgba(0,0,0,.45);z-index:898;}}';
      document.head.appendChild(st);
    }

    function closeMenu() {
      if (!nav.classList.contains('mob-open')) return;
      nav.classList.remove('mob-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }

    document.addEventListener('click', function (e) {
      if (nav.classList.contains('mob-open') && !(e.target.closest && e.target.closest('#hdr'))) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') closeMenu();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
