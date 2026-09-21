(function(){
  if(document.getElementById('cp-icon-sprite'))return;
  fetch('/assets/icons.svg').then(function(r){return r.ok?r.text():'';}).then(function(svgText){
    if(!svgText || document.getElementById('cp-icon-sprite'))return;
    var wrap=document.createElement('div');
    wrap.id='cp-icon-sprite';
    wrap.style.display='none';
    wrap.setAttribute('aria-hidden','true');
    wrap.innerHTML=svgText;
    document.body.insertBefore(wrap, document.body.firstChild);
  }).catch(function(){});
})();
