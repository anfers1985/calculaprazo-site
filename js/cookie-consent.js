/* Calcula Prazo — banner de cookies para páginas sem o banner embutido (artigos, súmulas, /conteudo, institucionais).
   Mesma chave (cp_cookies) e mesmo Consent Mode v2 do app.js. Não faz nada se a página já tem o banner
   (#cookie-banner, home e calculadoras) ou se o visitante já escolheu. */
(function () {
  'use strict';
  if (document.getElementById('cookie-banner') || document.getElementById('cp-consent-bar')) return;

  var pref = null;
  try { pref = localStorage.getItem('cp_cookies'); } catch (e) { return; }
  if (pref) return;

  function build() {
    if (document.getElementById('cookie-banner') || document.getElementById('cp-consent-bar')) return;

    var st = document.createElement('style');
    st.id = 'cp-consent-style';
    st.textContent =
      '#cp-consent-bar{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:#1A1A2E;color:#fff;' +
      'padding:9px 16px calc(9px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;' +
      'justify-content:space-between;gap:12px;box-shadow:0 -2px 12px rgba(0,0,0,.2);flex-wrap:wrap;max-height:140px;overflow-y:auto;}' +
      '#cp-consent-bar p{font-size:.74rem;color:rgba(255,255,255,.8);line-height:1.4;margin:0;flex:1;min-width:160px;}' +
      '#cp-consent-bar p a{color:var(--acc-l,#93c5fd);text-decoration:underline;cursor:pointer;}' +
      '#cp-consent-bar .cpc-btns{display:flex;gap:6px;flex-shrink:0;}' +
      '#cp-consent-bar button{font-family:inherit;border-radius:var(--r,8px);font-size:.76rem;cursor:pointer;white-space:nowrap;}' +
      '#cp-consent-bar .cpc-ok{background:var(--acc,#2563eb);color:#fff;border:none;padding:7px 16px;font-weight:700;}' +
      '#cp-consent-bar .cpc-no{background:transparent;color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.2);padding:7px 14px;}' +
      '#cp-consent-bar .cpc-no:hover{color:#fff;border-color:rgba(255,255,255,.5);}' +
      '@media(max-width:480px){#cp-consent-bar{padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));gap:6px;}' +
      '#cp-consent-bar p{font-size:.7rem;min-width:0;flex-basis:100%;line-height:1.35;}' +
      '#cp-consent-bar .cpc-btns{width:100%;}' +
      '#cp-consent-bar button{flex:1;text-align:center;padding:8px 10px;}}';
    document.head.appendChild(st);

    var bar = document.createElement('div');
    bar.id = 'cp-consent-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Aviso de cookies');
    bar.innerHTML =
      '<p>Usamos cookies para melhorar sua experi\u00eancia e exibir an\u00fancios relevantes. ' +
      'Ao continuar, voc\u00ea concorda com nossa <a href="/privacidade">Pol\u00edtica de Privacidade</a> ' +
      'e <a href="/termos">Termos de Uso</a>.</p>' +
      '<div class="cpc-btns">' +
      '<button type="button" class="cpc-ok">Aceitar</button>' +
      '<button type="button" class="cpc-no">Recusar</button>' +
      '</div>';
    document.body.appendChild(bar);

    function choose(accept) {
      try { localStorage.setItem('cp_cookies', accept ? 'accepted' : 'declined'); } catch (e) {}
      if (typeof window.gtag === 'function') {
        var v = accept ? 'granted' : 'denied';
        window.gtag('consent', 'update', {
          analytics_storage: v, ad_storage: v, ad_user_data: v, ad_personalization: v
        });
      }
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    }
    bar.querySelector('.cpc-ok').addEventListener('click', function () { choose(true); });
    bar.querySelector('.cpc-no').addEventListener('click', function () { choose(false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
