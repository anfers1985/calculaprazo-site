
var BLOG_POSTS=[];var BLOG_CAT='';var BLOG_H_FILTER='';var BLOG_VIEW='grid';var blogPage=1;var BLOG_PER_PAGE=25;var BLOG_MAX_PAGES=10;
var BLOG_MODE='explore'; // 'explore' (cards de categoria) ou 'list' (resultados filtrados)

// ── Alternância Explorar ⇄ Resultados (página /conteudo) ──────
function showBlogResultsMode(){
  BLOG_MODE='list';
  var ex=document.getElementById('blog-explore');var re=document.getElementById('blog-results');
  if(ex)ex.style.display='none';
  if(re)re.style.display='block';
}
function exploreShowCategories(){
  BLOG_MODE='explore';
  BLOG_CAT='';BLOG_CUR_SEC='';blogPage=1;
  var se=document.getElementById('blog-search');if(se)se.value='';
  var de=document.getElementById('blog-date-filter');if(de)de.value='';
  var ex=document.getElementById('blog-explore');var re=document.getElementById('blog-results');
  if(re)re.style.display='none';
  if(ex)ex.style.display='block';
  var sec=document.getElementById('sec-blog');if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});
}
function exploreOpenSection(sec,btn){
  showBlogResultsMode();
  filterBlogSection(sec);
}
function exploreShowAll(){
  showBlogResultsMode();
  filterBlogCat('');
}
function handleBlogSearchInput(){
  var se=document.getElementById('blog-search');
  var val=se?se.value.trim():'';
  blogPage=1;
  if(val && BLOG_MODE==='explore'){
    showBlogResultsMode();
    BLOG_CAT='';BLOG_CUR_SEC='';
    var ch=document.getElementById('blog-cat-header');if(ch)ch.style.display='none';
    var sr=document.getElementById('blog-subsec-row');if(sr){sr.style.display='none';sr.innerHTML='';}
  }
  renderBlogSection();
}
function handleBlogDateFilterChange(){
  blogPage=1;
  if(BLOG_MODE==='explore'){exploreShowAll();return;}
  renderBlogSection();
}
function renderExploreCounts(){
  Object.keys(BLOG_SEC_MAP).forEach(function(sec){
    var el=document.getElementById('cec-count-'+sec);
    if(!el)return;
    var cats=BLOG_SEC_MAP[sec];
    var n=BLOG_POSTS.filter(function(p){return cats.indexOf(p.category)>=0;}).length;
    el.textContent=n+' artigo'+(n!==1?'s':'');
  });
}

// Posts embutidos como fallback — garante funcionamento mesmo se fetch falhar
// POSTS_FALLBACK movido para /data/posts-fallback.json
async function loadFallback(){
  try{
    var fb=await fetch('/data/posts-fallback.json');
    if(fb.ok){var d=await fb.json();return Array.isArray(d)&&d.length?d:[];}
  }catch(e){}
  return [];
}


async function loadBlogPosts(){
  try{
    var r=await fetch('/data/posts.json?v='+Date.now());
    if(r.ok){var d=await r.json();BLOG_POSTS=Array.isArray(d)&&d.length?d:await loadFallback();}
    else{throw new Error('status '+r.status);}
  }catch(e){
    BLOG_POSTS=await loadFallback();
  }
  renderHomeBlog();renderBlogSection();renderSidebarPosts();
  renderNhRecentes();renderNhTop10();renderExploreCounts();
  var _el=document.getElementById('nh-stat-artigos');
  if(_el && BLOG_POSTS.length>0) _el.textContent=BLOG_POSTS.length;
}

function formatPostDate(d){
  if(!d)return '';
  return new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'});
}

var BLOG_CAT_META={
  'jurisprudencia':   {icon:'⚖️', name:'Jurisprudência',    desc:'Decisões e entendimentos dos tribunais que impactam o Direito do Trabalho.'},
  'orgaos-publicos':  {icon:'🏛️', name:'Órgãos Públicos',   desc:'Normas, atos e posicionamentos do MTE, MPT e demais órgãos públicos.'},
  'legislacao-normas':{icon:'📋', name:'Legislação e Normas',desc:'CLT, eSocial, FGTS Digital, portarias e normas regulamentadoras.'},
  'rh-gestao':        {icon:'👥', name:'RH e Gestão',        desc:'Folha de pagamento, rescisão, jornada e rotinas do departamento pessoal.'},
  'processual':       {icon:'📄', name:'Processual',         desc:'Ações, prazos, petições e prática no processo do trabalho.'},
  'essenciais':       {icon:'⭐', name:'Essenciais',         desc:'Guias, modelos e checklists indispensáveis no dia a dia.'},
  'outros':           {icon:'🔧', name:'Outros',             desc:'Diversos temas relacionados ao Direito do Trabalho.'}
};

// ── MAPA seção → categorias ──────────────────────────────────
var BLOG_SEC_MAP={
  'jurisprudencia':    ['jurisprudencia-tst','jurisprudencia-trts','jurisprudencia-stj','jurisprudencia-stf','jurisprudencia-outros'],
  'orgaos-publicos':   ['noticias-mte-mpt','noticias-mte','noticias-mpt','orgaos-outros'],
  'legislacao-normas': ['legislacao-normas','legislacao-clt','legislacao-cf','esocial-fgts-digital','esocial','fgts-digital','legislacao-previdenciario','legislacao-sindical','sindical','legislacao-portarias','legislacao-nr','legislacao-outros'],
  'rh-gestao':         ['orientacoes-praticas','saude-seguranca','rh-folha','rh-jornada','rh-contrato','rh-salario','rh-rescisao','rh-beneficios','rh-ctps','rh-sindical','rh-fiscalizacao','rh-inss','rh-modelos','rh-outros'],
  'processual':        ['artigos','modelos','processual-peticoes','processual-pratica','processual-analises','processual-outros'],
  'essenciais':        ['essenciais-livros','essenciais-equipamentos','essenciais-cursos','essenciais-outros'],
  'outros':            ['geral']
};
var BLOG_SUBSEC_MAP={
  'jurisprudencia':    [['jurisprudencia-trts','TRT'],['jurisprudencia-tst','TST'],['jurisprudencia-stj','STJ'],['jurisprudencia-stf','STF'],['jurisprudencia','+ outros temas']],
  'orgaos-publicos':   [['noticias-mte','MTE'],['noticias-mpt','MPT'],['orgaos-outros','+ outros órgãos']],
  'legislacao-normas': [['legislacao-clt','CLT'],['legislacao-cf','Constituição Federal'],['esocial','eSocial'],['fgts-digital','FGTS'],['legislacao-previdenciario','Previdenciário'],['legislacao-sindical','Sindical'],['legislacao-portarias','Portarias'],['legislacao-nr','NR'],['legislacao-normas','+ outras Legislação']],
  'rh-gestao':         [['rh-folha','Folha de Pagamento'],['rh-jornada','Jornada de Trabalho'],['rh-contrato','Contrato de Trabalho'],['rh-salario','Salário'],['rh-rescisao','Rescisão Contratual'],['saude-seguranca','Saúde e Segurança'],['rh-beneficios','Benefícios'],['rh-ctps','CTPS'],['rh-sindical','Rel. Sindical'],['rh-fiscalizacao','Fiscalização'],['rh-inss','INSS'],['rh-modelos','Modelos'],['orientacoes-praticas','+ outros temas de RH']],
  'processual':        [['processual-peticoes','Petições e Peças'],['processual-pratica','Prática Advocatícia'],['modelos','Modelos'],['artigos','Artigos'],['processual-analises','Análises'],['processual-outros','+ outros temas']],
  'essenciais':        [['essenciais-livros','📚 Livros'],['essenciais-equipamentos','🖥️ Equipamentos'],['essenciais-cursos','🎓 Cursos'],['essenciais-outros','📦 Outros']]
};
var BLOG_CUR_SEC='';// seção activa

function BLOG_BLOG_SEC_MAP_CATS(sec){return BLOG_SEC_MAP[sec]||[];}

function filterBlogCat(cat,btn){
  showBlogResultsMode();
  BLOG_CAT=cat;BLOG_CUR_SEC='';blogPage=1;
  var ch=document.getElementById('blog-cat-header');if(ch){ch.style.display='none';}
  var sr=document.getElementById('blog-subsec-row');if(sr){sr.style.display='none';sr.innerHTML='';}
  renderBlogSection();
}

function filterBlogSection(sec,btn){
  showBlogResultsMode();
  BLOG_CUR_SEC=sec;
  BLOG_CAT='__sec__'+sec;// sentinela
  blogPage=1;
  // cabeçalho da categoria
  var meta=BLOG_CAT_META[sec];
  var ch=document.getElementById('blog-cat-header');
  if(ch&&meta){
    document.getElementById('blog-cat-header-crumb').textContent=meta.name;
    document.getElementById('blog-cat-header-icon').textContent=meta.icon;
    document.getElementById('blog-cat-header-title').textContent=meta.name;
    document.getElementById('blog-cat-header-desc').textContent=meta.desc;
    ch.style.display='block';
  }
  // montar chips de sub-seções (Todos + subtemas)
  var sr=document.getElementById('blog-subsec-row');
  if(sr){
    var html='<button class="ctab on" onclick="filterBlogSection(\''+sec+'\',this)">Todos</button>';
    (BLOG_SUBSEC_MAP[sec]||[]).forEach(function(sub){
      html+='<button class="ctab" onclick="filterBlogSub(\''+sub[0]+'\',\''+sec+'\',this)">'+sub[1]+'</button>';
    });
    sr.innerHTML=html;
    sr.style.display='flex';
  }
  renderBlogSection();
}


function toggleNavSec(id,e){
  if(e){e.stopPropagation();e.preventDefault();}
  var wrap=document.getElementById(id);
  if(!wrap)return;
  var open=wrap.classList.toggle('open');
  var arrId='nma-'+id.replace('nms-','');
  var arr=document.getElementById(arrId);
  if(arr){arr.classList.toggle('open',open);}
  // fechar as outras
  document.querySelectorAll('.nm-sub-wrap').forEach(function(w){
    if(w.id!==id){w.classList.remove('open');var a=document.getElementById('nma-'+w.id.replace('nms-',''));if(a)a.classList.remove('open');}
  });
  // garantir que o dropdown conteúdo permaneça aberto
  var dd=document.getElementById('nav-dropdown-conteudo');
  if(dd&&!dd.classList.contains('open')){dd.classList.add('open');positionDropdownConteudo();}
}
function filterBlogSub(cat,sec,btn){
  showBlogResultsMode();
  BLOG_CUR_SEC=sec;
  BLOG_CAT=cat;
  blogPage=1;
  document.querySelectorAll('#blog-subsec-row .ctab').forEach(function(b){b.classList.remove('on');});
  if(btn){btn.classList.add('on');}
  renderBlogSection();
}

function setBlogView(v){
  if(BLOG_MODE==='explore'){exploreShowAll();}
  BLOG_VIEW=v;
  var gb=document.getElementById('blog-view-grid');var lb=document.getElementById('blog-view-list');
  if(gb){gb.style.background=v==='grid'?'var(--acc)':'var(--card)';gb.style.color=v==='grid'?'#fff':'var(--txt)';}
  if(lb){lb.style.background=v==='list'?'var(--acc)':'var(--card)';lb.style.color=v==='list'?'#fff':'var(--txt)';}
  renderBlogSection();
}

function buildPostCard(p){
  var cl=p.category_label||p.category||'';
  var iu=p.image||'';
  var ih=iu
    ?'<div style="aspect-ratio:16/9;overflow:hidden;border-radius:10px 10px 0 0;margin:-1px -1px 0;"><img src="'+iu+'" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>'
    :'<div style="height:72px;background:linear-gradient(135deg,var(--b50),#fff);border-radius:10px 10px 0 0;margin:-1px -1px 0;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">&#x1F4F0;</div>';
  var cb=cl?'<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:.65rem;font-weight:700;background:var(--b50);color:var(--acc);border:1px solid var(--b100);margin-right:3px;">'+cl+'</span>':'';
  return '<a href="/blog/'+(p.id||p.slug||'')+'.html" style="display:block;text-decoration:none;background:var(--card);border:1.5px solid var(--brd);border-radius:12px;overflow:hidden;transition:all .2s;box-shadow:var(--sh);" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'var(--shl)\';this.style.borderColor=\'var(--b200)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'var(--sh)\';this.style.borderColor=\'var(--brd)\'">'
    +ih+'<div style="padding:14px;"><div style="margin-bottom:8px;">'+cb+'</div>'
    +'<div style="font-size:.88rem;font-weight:700;color:var(--txt);line-height:1.35;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'+(p.title||'')+'</div>'
    +'<div style="font-size:.76rem;color:var(--txt-m);line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">'+(p.excerpt||'')+'</div>'
    +'<div style="margin-top:10px;font-size:.75rem;color:var(--txt-s);">'+formatPostDate(p.date)+'</div></div></a>';
}

function buildPostListItem(p){
  var cl=p.category_label||p.category||'';
  var isMobile=window.innerWidth<600;
  if(isMobile){
    return '<a href="/blog/'+(p.id||p.slug||'')+'.html" style="display:block;text-decoration:none;padding:11px 0;border-bottom:1px solid var(--brd);">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">'
      +'<span style="font-size:.68rem;color:var(--txt-s);white-space:nowrap;">'+formatPostDate(p.date)+'</span>'
      +(cl?'<span style="font-size:.62rem;font-weight:700;color:var(--acc);background:var(--b50);border:1px solid var(--b100);border-radius:999px;padding:2px 7px;white-space:nowrap;">'+cl+'</span>':'')
      +'</div>'
      +'<span style="font-size:.88rem;font-weight:700;color:var(--txt);line-height:1.45;display:block;">'+(p.title||'')+'</span>'
      +'</a>';
  }
  return '<a href="/blog/'+(p.id||p.slug||'')+'.html" style="display:flex;align-items:flex-start;gap:12px;text-decoration:none;padding:12px 0;border-bottom:1px solid var(--brd);transition:background .15s;" onmouseover="this.style.background=\'var(--b50)\'" onmouseout="this.style.background=\'\'">'
    +'<span style="flex-shrink:0;font-size:.72rem;color:var(--txt-s);white-space:nowrap;min-width:84px;padding-top:2px;">'+formatPostDate(p.date)+'</span>'
    +(cl?'<span style="flex-shrink:0;font-size:.65rem;font-weight:700;color:var(--acc);background:var(--b50);border:1px solid var(--b100);border-radius:999px;padding:2px 8px;white-space:nowrap;">'+cl+'</span>':'')
    +'<span style="font-size:.86rem;font-weight:600;color:var(--txt);line-height:1.4;">'+(p.title||'')+'</span></a>';
}

function renderPagination(total,perPage,current){
  var pag=document.getElementById('blog-pagination');if(!pag)return;
  var pages=Math.min(Math.ceil(total/perPage),BLOG_MAX_PAGES);
  if(pages<=1){pag.innerHTML='';return;}
  var bs='padding:7px 14px;border:1.5px solid var(--brd);border-radius:999px;font-size:.82rem;cursor:pointer;font-family:var(--fh);transition:all .15s;margin:2px;';
  var html='';
  if(current>1)html+='<button style="'+bs+'background:var(--card);color:var(--txt);" onclick="goToBlogPage('+(current-1)+')">&#8592; Anterior</button>';
  for(var i=1;i<=pages;i++){
    html+='<button style="'+bs+(i===current?'background:var(--acc);color:#fff;border-color:var(--acc);font-weight:700;':'background:var(--card);color:var(--txt);')+'" onclick="goToBlogPage('+i+')">'+i+'</button>';
  }
  if(current<pages)html+='<button style="'+bs+'background:var(--card);color:var(--txt);" onclick="goToBlogPage('+(current+1)+')">Pr&#243;xima &#8594;</button>';
  pag.innerHTML=html;
}

function goToBlogPage(p){
  blogPage=p;renderBlogSection();
  var sec=document.getElementById('sec-blog');if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderBlogSection(){
  var grid=document.getElementById('blog-posts-grid');var empty=document.getElementById('blog-empty');var count=document.getElementById('blog-count');
  if(!grid)return;
  var se=document.getElementById('blog-search');var de=document.getElementById('blog-date-filter');
  var search=se?se.value.toLowerCase().trim():'';
  var dateDays=de?parseInt(de.value||'0'):0;
  var cutoff=dateDays>0?new Date(Date.now()-dateDays*86400000):null;
  var posts=BLOG_POSTS.filter(function(p){
    var secCats=BLOG_CUR_SEC?BLOG_BLOG_SEC_MAP_CATS(BLOG_CUR_SEC):null;
    var mc;
    if(!BLOG_CAT){mc=true;}
    else if(BLOG_CAT.indexOf('__sec__')===0){mc=secCats?secCats.indexOf(p.category)>=0:true;}
    else{mc=p.category===BLOG_CAT;}
    var mt=!search||(p.title||'').toLowerCase().indexOf(search)>=0||(p.excerpt||'').toLowerCase().indexOf(search)>=0;
    var md=!cutoff||new Date((p.date||'2000-01-01')+'T12:00:00')>=cutoff;
    return mc&&mt&&md;
  }).sort(function(a,b){return(b.date||'').localeCompare(a.date||'');});
  if(!posts.length){
    grid.innerHTML='';grid.style.display='block';
    if(empty)empty.style.display='block';if(count)count.textContent='';
    renderPagination(0,BLOG_PER_PAGE,1);return;
  }
  if(empty)empty.style.display='none';
  var total=posts.length;
  var maxPage=Math.min(Math.ceil(total/BLOG_PER_PAGE),BLOG_MAX_PAGES);
  if(blogPage>maxPage)blogPage=maxPage;if(blogPage<1)blogPage=1;
  var start=(blogPage-1)*BLOG_PER_PAGE;
  var pp=posts.slice(start,start+BLOG_PER_PAGE);
  if(count)count.textContent=total+' artigo'+(total!==1?'s':'')+' encontrado'+(total!==1?'s':'')+' \u2014 p\u00E1gina '+blogPage+' de '+maxPage;
  if(BLOG_VIEW==='list'){grid.style.display='block';grid.innerHTML=pp.map(buildPostListItem).join('');}
  else{grid.style.display='grid';grid.innerHTML=pp.map(buildPostCard).join('');}
  renderPagination(total,BLOG_PER_PAGE,blogPage);
}

function filterHomeBlog(tag){BLOG_H_FILTER=tag;renderHomeBlog();}

function renderHomeBlog(){
  var grid=document.getElementById('home-blog-grid');if(!grid)return;
  var posts=BLOG_POSTS.filter(function(p){return!BLOG_H_FILTER||p.category===BLOG_H_FILTER;})
    .sort(function(a,b){return(b.date||'').localeCompare(a.date||'');}).slice(0,15);
  if(!posts.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--txt-s);padding:40px 0;font-size:.88rem;">Nenhum artigo publicado ainda. Em breve!</div>';
    return;
  }
  grid.innerHTML=posts.map(buildPostCard).join('');
}

function renderSidebarPosts(){
  var list=document.getElementById('sidebar-posts-list');if(!list)return;
  var posts=BLOG_POSTS.slice().sort(function(a,b){return(b.date||'').localeCompare(a.date||'');}).slice(0,6);
  if(!posts.length)return;
  list.innerHTML=posts.map(function(p){
    var cl=p.category_label||'';
    var te=cl?'<span style="font-size:.62rem;font-weight:700;color:var(--acc);background:var(--b50);border:1px solid var(--b100);border-radius:999px;padding:1px 7px;margin-bottom:3px;display:inline-block;">'+cl+'</span>':'';
    return '<a href="/blog/'+(p.id||p.slug||'')+'.html" style="display:block;text-decoration:none;padding:8px 0;border-bottom:1px solid var(--brd);" onmouseover="this.style.opacity=\'.75\'" onmouseout="this.style.opacity=\'1\'">'
      +(te?'<div>'+te+'</div>':'')
      +'<div style="font-size:.82rem;font-weight:600;color:var(--txt);line-height:1.35;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'+(p.title||'')+'</div>'
      +'<div style="font-size:.7rem;color:var(--txt-s);margin-top:3px;">'+formatPostDate(p.date)+'</div></a>';
  }).join('');
}

// navGoTo('blog', sec, cat) — navega de verdade para /conteudo (URL real, sem hash),
// gravando o filtro de categoria desejado no sessionStorage para a página de
// destino aplicar automaticamente (lida em blog.js/conteudo via 'cp_nav_filter').
function navGoTo(id, sec, cat){
  if(id==='blog'){
    try{
      if(sec || cat) sessionStorage.setItem('cp_nav_filter', JSON.stringify({sec:sec||'', cat:cat||''}));
    }catch(e){}
    window.location.href = '/conteudo';
    return;
  }
  goTo(id);
  document.querySelectorAll('.nav-dropdown').forEach(function(d){d.classList.remove('open');});
}

function positionDropdownConteudo(){
  var btn=document.getElementById('nav-conteudo');var menu=document.getElementById('conteudo-menu');
  if(!btn||!menu)return;var r=btn.getBoundingClientRect();
  menu.style.left=Math.min(r.left,window.innerWidth-260)+'px';menu.style.top=(r.bottom+4)+'px';
}

function toggleConteudo(e){
  const btnConteudo = document.getElementById('nav-conteudo');
  if(e){e.stopPropagation();e.preventDefault();}
  var dd=document.getElementById('nav-dropdown-conteudo');
  var opening=!dd.classList.contains('open');
  document.querySelectorAll('.nav-dropdown').forEach(function(d){d.classList.remove('open'); document.querySelectorAll('#nav-tools,#nav-conteudo').forEach(function(b){ b.setAttribute('aria-expanded','false'); });});
  if(opening){dd.classList.add('open'); if(btnConteudo) btnConteudo.setAttribute('aria-expanded','true');positionDropdownConteudo();}else{document.querySelectorAll('.nm-sub-wrap').forEach(function(w){w.classList.remove('open');});document.querySelectorAll('.nm-arr').forEach(function(a){a.classList.remove('open');});}
}

function positionDropdownSociais(){
  var btn=document.getElementById('nav-sociais');var menu=document.getElementById('sociais-menu');
  if(!btn||!menu)return;var r=btn.getBoundingClientRect();
  menu.style.left=Math.min(r.left,window.innerWidth-200)+'px';menu.style.top=(r.bottom+4)+'px';
}
function toggleSociais(e){
  if(e){e.stopPropagation();e.preventDefault();}
  var dd=document.getElementById('nav-dropdown-sociais');
  var opening=!dd.classList.contains('open');
  document.querySelectorAll('.nav-dropdown').forEach(function(d){d.classList.remove('open');});
  if(opening){dd.classList.add('open');positionDropdownSociais();}
}

// ─── YOUTUBE LATEST VIDEOS ────────────────────────────────────
(function(){
  var _a=['AIzaSyBmm','kCO2cFjuEx','LmoH1xf5nU','-LCgGllzw8'];_a[2]=_a[2].replace('H1xf5nU','h1XF5Nu');
  var YT_API_KEY=_a.join('');
  var YT_CHANNEL_ID='@CalculaPrazo';

  // Fallback: carrega via RSS (sem API key, via allorigins proxy)
  function loadYouTubeViaRSS(grid){
    var rssUrl='https://www.youtube.com/feeds/videos.xml?channel_id=UCq_ZRZh3xI0LoiXzDmXSNsQ';
    var proxy='https://api.allorigins.win/get?url='+encodeURIComponent(rssUrl);
    fetch(proxy)
      .then(function(r){return r.json();})
      .then(function(j){
        var parser=new DOMParser();
        var doc=parser.parseFromString(j.contents,'text/xml');
        var entries=Array.from(doc.querySelectorAll('entry')).slice(0,4);
        if(!entries.length){grid.innerHTML='<p style="color:var(--txt-s);font-size:.85rem;">Nenhum vídeo encontrado.</p>';return;}
        grid.innerHTML=entries.map(function(e){
          var vid=e.querySelector('videoId')&&e.querySelector('videoId').textContent;
          var title=e.querySelector('title')&&e.querySelector('title').textContent;
          var published=e.querySelector('published')&&e.querySelector('published').textContent;
          if(!vid)return '';
          var thumbUrl='https://i.ytimg.com/vi/'+vid+'/hqdefault.jpg';
          var dateStr=published?new Date(published).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'}):'';
          return renderYTCard(vid,title,thumbUrl,dateStr);
        }).filter(Boolean).join('');
      })
      .catch(function(){
        // Fallback 2: corsproxy.io
        var proxy2='https://corsproxy.io/?'+encodeURIComponent(rssUrl);
        fetch(proxy2)
          .then(function(r){return r.text();})
          .then(function(t){
            var parser=new DOMParser();
            var doc=parser.parseFromString(t,'text/xml');
            var entries=Array.from(doc.querySelectorAll('entry')).slice(0,4);
            if(!entries.length){grid.innerHTML='<p style="color:var(--txt-s);font-size:.85rem;">Nenhum vídeo encontrado.</p>';return;}
            grid.innerHTML=entries.map(function(e){
              var vid=e.querySelector('videoId')&&e.querySelector('videoId').textContent;
              var title=e.querySelector('title')&&e.querySelector('title').textContent;
              var published=e.querySelector('published')&&e.querySelector('published').textContent;
              if(!vid)return '';
              var thumbUrl='https://i.ytimg.com/vi/'+vid+'/hqdefault.jpg';
              var dateStr=published?new Date(published).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'}):'';
              return renderYTCard(vid,title,thumbUrl,dateStr);
            }).filter(Boolean).join('');
          })
          .catch(function(){
            grid.innerHTML='<p style="color:var(--txt-s);font-size:.85rem;">Não foi possível carregar os vídeos. <a href="https://www.youtube.com/@CalculaPrazo" target="_blank" rel="noopener noreferrer" style="color:var(--acc);">Ver canal →</a></p>';
          });
      });
  }

  function renderYTCard(vid,title,thumbUrl,dateStr){
    return '<a href="https://www.youtube.com/watch?v='+vid+'" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;background:var(--card);border:1.5px solid var(--brd);border-radius:var(--rl);overflow:hidden;text-decoration:none;transition:all .2s;box-shadow:var(--sh);" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'var(--shl)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'var(--sh)\'" >'
      +'<div style="position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#111;flex-shrink:0;">'
      +'<img src="'+thumbUrl+'" alt="'+title+'" loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;">'
      +'</div>'
      +'<div style="padding:10px 12px 12px;flex:1;display:flex;flex-direction:column;">'
      +'<div class="nh-yt-title" style="font-size:.85rem;font-weight:700;color:var(--txt);line-height:1.4;flex:1;">'+title+'</div>'
      +(dateStr?'<div class="nh-yt-date" style="font-size:.72rem;color:var(--txt-s);margin-top:5px;">'+dateStr+'</div>':'')
      +'</div></a>';
  }

  function loadYouTubeVideos(){
    var grid=document.getElementById('yt-videos-grid');
    if(!grid)return;
    // Step 1: resolve handle → channelId (versão que funcionava)
    fetch('https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=CalculaPrazo&key='+YT_API_KEY)
      .then(function(r){return r.json();})
      .then(function(d){
        var cid=(d.items&&d.items[0])?d.items[0].id:null;
        if(!cid){loadYouTubeViaRSS(grid);return;}
        // Step 2: busca os 4 últimos vídeos via search.list
        return fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&channelId='+cid+'&maxResults=4&order=date&type=video&key='+YT_API_KEY);
      })
      .then(function(r){if(r)return r.json();})
      .then(function(d){
        if(!d||!d.items||!d.items.length){loadYouTubeViaRSS(grid);return;}
        grid.innerHTML=d.items.map(function(item){
          var vid=item.id.videoId;
          var sn=item.snippet;
          var thumb=sn.thumbnails&&(sn.thumbnails.medium||sn.thumbnails.high||sn.thumbnails.default);
          var thumbUrl=thumb?thumb.url:'';
          var dateStr=new Date(sn.publishedAt).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'});
          return renderYTCard(vid,sn.title,thumbUrl,dateStr);
        }).join('');
      })
      .catch(function(){
        loadYouTubeViaRSS(grid);
      });
  }

  function applyPendingNavFilter(){
    // Lê o filtro de categoria gravado pela navegação vinda de outra página
    // (home ou posts do blog) via navGoTo('blog', sec, cat) e aplica assim
    // que os posts terminarem de carregar.
    try{
      var raw = sessionStorage.getItem('cp_nav_filter');
      if(!raw) return;
      sessionStorage.removeItem('cp_nav_filter');
      var f = JSON.parse(raw);
      if(f.cat && f.sec){ filterBlogSub(f.cat, f.sec); }
      else if(f.sec){ filterBlogSection(f.sec); }
    }catch(ex){}
  }

  function bootAll(){
    loadBlogPosts().then(applyPendingNavFilter);
    loadYouTubeVideos();
    var hash=window.location.hash;
    if(hash==='#conteudo'||hash==='#blog'){
      navGoTo('blog');
    } else if(hash && hash.length > 1) {
      var hslug = hash.slice(1);
      var hid = (typeof SLUG_TO_ID !== 'undefined') ? (SLUG_TO_ID['/'+hslug] || SLUG_TO_ID[hslug] || hslug) : hslug;
      if(typeof goTo==='function') goTo(hid);
    }
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',bootAll);}else{bootAll();}
})();
window.addEventListener('hashchange', function() {
  var h = window.location.hash;
  if (h === '#conteudo' || h === '#blog') navGoTo('blog');
  // Ler filtro de navegação vindo dos artigos (via sessionStorage)
  try {
    var cpFilter = sessionStorage.getItem('cp_nav_filter');
    if (cpFilter) {
      sessionStorage.removeItem('cp_nav_filter');
      var f = JSON.parse(cpFilter);
      setTimeout(function(){
        navGoTo('blog');
        setTimeout(function(){
          if (f.cat && f.sec) { filterBlogSub(f.cat, f.sec); }
          else if (f.sec) { filterBlogSection(f.sec); }
        }, 80);
      }, 50);
    }
  } catch(ex) {}
});


/* ═══════════════════════════════════════════
   REDESIGN HOME — funções NH
   Adicionado antes de </main>
</body>
═══════════════════════════════════════════ */

// IDs do Top 10 — edite os slugs manualmente
var NH_TOP10_IDS = [
  'aviso-previo-proporcional-como-calcular',
  'calculadora-de-verbas-trabalhistas-rescisao-clt',
  'estabilidade-emprego-gestante-acidente-trabalho-cipa-stf-tst-normas-coletivas',
  'assedio-moral-no-trabalho-como-provar',
  'demissao-por-justa-causa-quantas-advertencias-e-suspensoes',
  'contrato-trabalho-intermitente-clt-reforma-trabalhista',
  'ferias-principais-direitos-prazos-e-duvidas-dos-trabalhadores',
  'beneficios-trabalhistas-empresa-e-obrigada',
  'calculadora-de-salario-liquido-inss-irrf-2026',
  'aposentadoria-por-pontos-inss-2026'
];

// Mapa emoji por categoria
var NH_CAT_EMOJI = {
  'trabalhista':'⚖️','jurisprudencia':'📋','legislacao':'📜',
  'rh':'👥','processual':'🗂️','orgaos':'🏛️','essenciais':'⭐','outros':'📄'
};

function nhFormatDate(d){
  if(!d) return '';
  try{
    var p=d.split('-');
    if(p.length<3) return d;
    return p[2]+'/'+p[1]+'/'+p[0];
  }catch(e){return d;}
}

function renderNhRecentes(){
  var list = document.getElementById('nh-recentes-list');
  if(!list) return;
  var posts = BLOG_POSTS.slice()
    .sort(function(a,b){return (b.date||'').localeCompare(a.date||'');})
    .slice(0,10);
  if(!posts.length){
    list.innerHTML='<p style="font-size:.85rem;color:var(--txt-s);padding:16px 0;">Nenhum artigo publicado ainda.</p>';
    return;
  }
  list.innerHTML = posts.map(function(p){
    var slug = p.id || p.slug || '';
    var cat  = p.category_label || p.category || '';
    var emoji= NH_CAT_EMOJI[p.category] || '📄';
    var exc  = p.excerpt || p.description || '';
    var imgUrl = p.image || '';
    var imgPart = imgUrl
      ? '<img src="'+imgUrl+'" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.style.background=\'var(--b50)\'">'
      : '<span class="nh-art-img-emoji">'+emoji+'</span>';
    return '<a class="nh-art-card" href="/blog/'+slug+'.html">'
      +'<div class="nh-art-img">'+imgPart+'</div>'
      +'<div class="nh-art-body">'
        +(cat?'<span class="nh-art-badge">'+cat+'</span>':'')
        +'<div class="nh-art-title">'+(p.title||'')+'</div>'
        +(exc?'<div class="nh-art-excerpt">'+exc+'</div>':'')
        +'<div class="nh-art-meta">'
          +'<span class="nh-art-date">'+nhFormatDate(p.date)+'</span>'
          +'<span class="nh-art-ler">Ler →</span>'
        +'</div>'
      +'</div>'
    +'</a>';
  }).join('');
}

function renderNhTop10(){
  var list = document.getElementById('nh-top10-list');
  if(!list) return;

  // Mapa slug → post
  var map = {};
  BLOG_POSTS.forEach(function(p){
    var s = p.id || p.slug || '';
    if(s) map[s] = p;
  });

  function buildItems(slugs) {
    // Primeiro filtra os slugs sem post correspondente, depois numera
    // a lista já filtrada — evita "buracos" tipo Top 10 começando em 3.
    var validPosts = slugs
      .map(function(slug){ return { slug: slug, post: map[slug] }; })
      .filter(function(entry){ return !!entry.post; });

    return validPosts.map(function(entry, i){
      var slug = entry.slug;
      var p = entry.post;
      var numCls = i < 3 ? 'top' : 'rest';
      var cat = p.category_label || p.category || '';
      var imgUrl = p.image || '';
      var thumbPart = imgUrl
        ? '<div class="nh-top10-thumb"><img src="'+imgUrl+'" alt="" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>'
        : '';
      return '<a class="nh-top10-item" href="/blog/'+slug+'.html">'
        +'<span class="nh-top10-num '+numCls+'">'+(i+1)+'</span>'
        +thumbPart
        +'<div class="nh-top10-info">'
          +'<div class="nh-top10-title">'+(p.title||slug)+'</div>'
          +(cat?'<div class="nh-top10-cat">'+cat+'</div>':'')
        +'</div>'
      +'</a>';
    });
  }

  // Completa a lista até 10 posts válidos usando os mais recentes,
  // caso alguns slugs (API ou fallback) não existam mais em BLOG_POSTS.
  function padToTen(slugs) {
    var valid = slugs.filter(function(s){ return !!map[s]; });
    if (valid.length >= 10) return valid.slice(0, 10);
    var recent = BLOG_POSTS.slice()
      .sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
    for (var i = 0; i < recent.length && valid.length < 10; i++) {
      var s = recent[i].id || recent[i].slug || '';
      if (s && valid.indexOf(s) === -1) valid.push(s);
    }
    return valid;
  }

  function renderSlugs(slugs) {
    var items = buildItems(padToTen(slugs));
    if(!items.length){
      list.innerHTML='<p style="font-size:.8rem;color:var(--txt-s);padding:8px 0;">Carregando...</p>';
      return;
    }
    list.innerHTML = items.join('');
  }

  // Tentar carregar do Worker KV (Top 10 real)
  var workerUrl = 'https://calculaprazo-views-api.andersonfernand3s.workers.dev';
  fetch(workerUrl + '/top/10')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){
      var apiSlugs = (d && d.top && d.top.length >= 5)
        ? d.top.map(function(item){ return item.slug || item; })
        : [];
      // Completa até 10 com o fallback, sem duplicar os que já vieram da API
      var slugs = apiSlugs.slice();
      for (var i = 0; i < NH_TOP10_IDS.length && slugs.length < 10; i++) {
        if (slugs.indexOf(NH_TOP10_IDS[i]) === -1) slugs.push(NH_TOP10_IDS[i]);
      }
      renderSlugs(slugs.length ? slugs : NH_TOP10_IDS);
    })
    .catch(function(){
      // Fallback para lista hardcoded se Worker indisponível
      renderSlugs(NH_TOP10_IDS);
    });
}

// NH chamado diretamente em loadBlogPosts
