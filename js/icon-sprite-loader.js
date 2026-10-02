(function(){
  var ID='cp-icon-sprite';
  if(document.getElementById(ID))return;
  fetch('/assets/icons.svg?v=4').then(function(r){return r.ok?r.text():'';}).then(function(svg){
    if(!svg||document.getElementById(ID))return;
    var w=document.createElement('div');
    w.id=ID; w.setAttribute('aria-hidden','true');
    w.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
    w.innerHTML=svg;
    var b=document.body||document.documentElement;
    b.insertBefore(w,b.firstChild);
  }).catch(function(){});
})();
