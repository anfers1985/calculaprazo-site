
// ─── NAVIGATION ────────────────────────────────────
const NAV_MAP = {
  home:'home',prazos:'prazos',blog:'blog',calc:'calc',correcao:'correcao',juros:'juros',
  trabalhista:'trabalhista',salario:'salario',intermitente:'intermitente',prescricao:'prescricao',porcentagem:'porcentagem',
  moedas:'moedas',valid:'valid',qrcode:'qrcode',senhas:'senhas',
  extenso:'extenso',imc:'imc',datas:'datas',util:'util',gerador:'valid',
  horasextras:'horas-extras',segurodesemprego:'seguro-desemprego',rescisaodomestica:'rescisao-domestica'
};
const NAV_ACTIVE = {
  home:'home',prazos:'prazos',
  calc:'tools',correcao:'tools',juros:'tools',trabalhista:'tools',
  salario:'tools',intermitente:'tools',prescricao:'tools',porcentagem:'tools',moedas:'tools',
  valid:'tools',gerador:'tools',qrcode:'tools',senhas:'tools',
  extenso:'tools',imc:'tools',datas:'tools',util:'tools',
  blog:'conteudo'
};

function goTo(id) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  // URL gerenciada pelo window.goTo (pushState com slug limpo)
  const sec = document.getElementById('sec-' + (NAV_MAP[id] || id));
  if (sec) sec.classList.add('active');
  document.querySelectorAll('#hdr .hdr-nav>a, #hdr .nav-dropdown>a').forEach(a => a.classList.remove('on'));
  const activeNav = NAV_ACTIVE[id] || 'home';
  const navEl = document.getElementById('nav-' + activeNav);
  if (navEl) navEl.classList.add('on');
  window.scrollTo(0, 0);
}

document.getElementById('yr').textContent = new Date().getFullYear();

// Filter tools
function filterTools(cat, btn) {
  document.querySelectorAll('.ctab').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.tc[data-c]').forEach(c => {
    c.style.display = (cat === 'all' || c.dataset.c === cat) ? '' : 'none';
  });
}

// ─── PRAZOS DATA ──────────────────────────────────
const PRAZOS = {
  trabalho:[
    {nome:"Recurso Ordinário",dias:8,tipoDias:"uteis",lei:"Art. 895, CLT",cont:"Da publicação da decisão ou intimação",obs:"Prazo em dias úteis (Lei 13.467/2017). Conta-se da publicação no DEJT ou intimação pessoal."},
    {nome:"Recurso de Revista",dias:8,tipoDias:"uteis",lei:"Art. 896, CLT",cont:"Da publicação do acórdão do TRT",obs:"Cabível em casos restritos: violação de lei federal, divergência jurisprudencial ou ofensa à CF."},
    {nome:"Embargos de Declaração",dias:5,tipoDias:"uteis",lei:"Art. 897-A, CLT",cont:"Da publicação da decisão embargada",obs:"Interrompem o prazo recursal. Cabíveis por obscuridade, contradição ou omissão."},
    {nome:"Agravo de Instrumento",dias:8,tipoDias:"uteis",lei:"Art. 897, 'b', CLT",cont:"Da decisão denegatória do recurso",obs:"Usado para destrancar recurso não admitido na origem."},
    {nome:"Impugnação à Liquidação",dias:8,tipoDias:"uteis",lei:"Art. 884, CLT",cont:"Da citação para pagamento em execução",obs:"Apenas matéria de cálculo. Mérito transitado em julgado não pode ser rediscutido."},
    {nome:"Agravo Regimental (TST)",dias:8,tipoDias:"uteis",lei:"Art. 235, RITST",cont:"Da publicação da decisão monocrática",obs:"Visa submeter decisão monocrática do relator ao colegiado."},
    {nome:"Recurso de Embargos (SDI)",dias:8,tipoDias:"uteis",lei:"Art. 894, CLT",cont:"Da publicação do acórdão da Turma TST",obs:"Para uniformização de jurisprudência interna no TST, perante SDI-1 ou SDI-2."},
    {nome:"Ação Rescisória",dias:730,tipoDias:"corridos",lei:"Art. 975 CPC c/c Art. 836 CLT",cont:"Do trânsito em julgado da decisão",obs:"Prazo decadencial de 2 anos (730 dias corridos). Improrrogável."},
    {nome:"Depósito Recursal",dias:8,tipoDias:"uteis",lei:"Art. 899, CLT",cont:"Coincide com o prazo do recurso",obs:"Pressuposto de admissibilidade. Dispensado para Entes Públicos e beneficiários da JG."},
    {nome:"Contestação (Reclamação)",dias:5,tipoDias:"corridos",lei:"Art. 841, CLT",cont:"Intervalo mínimo entre a notificação e a audiência (não é prazo de protocolo)",obs:"Atenção: na CLT, a contestação é apresentada oralmente na própria audiência (Art. 847), não por protocolo em um prazo contado da notificação como no CPC. O Art. 841 exige apenas um intervalo mínimo de 5 dias entre a notificação e a data marcada para a audiência."},
  ],
  civil:[
    {nome:"Contestação",dias:15,tipoDias:"uteis",lei:"Art. 335, CPC",cont:"Da citação do réu",obs:"Fazenda Pública, MP e Defensoria têm 30 dias úteis (Arts. 183 e 186, CPC)."},
    {nome:"Apelação",dias:15,tipoDias:"uteis",lei:"Art. 1.003, §5º, CPC",cont:"Da intimação da sentença",obs:"Fazenda Pública e MP têm prazo em dobro (30 dias úteis)."},
    {nome:"Agravo de Instrumento",dias:15,tipoDias:"uteis",lei:"Art. 1.015, CPC",cont:"Da intimação da decisão interlocutória",obs:"Cabível nas hipóteses taxativas do Art. 1.015 do CPC."},
    {nome:"Embargos de Declaração",dias:5,tipoDias:"uteis",lei:"Art. 1.023, CPC",cont:"Da publicação da decisão",obs:"Interrompem o prazo recursal (Art. 1.026, CPC)."},
    {nome:"REsp / RE",dias:15,tipoDias:"uteis",lei:"Art. 1.003, §5º, CPC",cont:"Da publicação do acórdão",obs:"REsp ao STJ e RE ao STF. Exige prequestionamento da matéria."},
    {nome:"Mandado de Segurança",dias:120,tipoDias:"corridos",lei:"Art. 23, Lei 12.016/2009",cont:"Da ciência do ato coator",obs:"Prazo decadencial. Não se aplica a direitos de trato sucessivo."},
    {nome:"Impugnação ao Cumprimento",dias:15,tipoDias:"uteis",lei:"Art. 525, CPC",cont:"Da intimação do auto de penhora/avaliação",obs:"Sem efeito suspensivo automático. Matéria taxativa (Art. 525, §1º)."},
    {nome:"Réplica",dias:15,tipoDias:"uteis",lei:"Art. 351, CPC",cont:"Da intimação sobre a contestação",obs:"Obrigatória quando o réu alegar fato impeditivo, modificativo ou extintivo."},
    {nome:"Embargos à Execução (FP)",dias:30,tipoDias:"uteis",lei:"Art. 910, CPC",cont:"Da citação",obs:"Para execução contra a Fazenda Pública."},
    {nome:"Agravo em REsp/RE",dias:15,tipoDias:"uteis",lei:"Art. 1.042, CPC",cont:"Da intimação da decisão de inadmissão",obs:"Resposta do agravado também em 15 dias úteis (Art. 1.042, §3º)."},
  ],
  tributario:[
    {nome:"Impugnação (Auto Infração Federal)",dias:30,tipoDias:"corridos",lei:"Art. 15, Decreto 70.235/1972",cont:"Da ciência do auto de infração",obs:"Suspende a exigibilidade do crédito (Art. 151, III, CTN). Apresentada perante a DRJ."},
    {nome:"Recurso ao CARF",dias:30,tipoDias:"corridos",lei:"Art. 33, Decreto 70.235/1972",cont:"Da ciência da decisão da DRJ",obs:"Decisão não unânime pode gerar embargos de divergência."},
    {nome:"Defesa – ICMS Estadual",dias:30,tipoDias:"corridos",lei:"Varia por estado",cont:"Da ciência do auto de infração",obs:"⚠ Prazo varia por estado! Verifique sempre a legislação estadual específica antes de usar."},
    {nome:"Reclamação – Simples Nacional",dias:30,tipoDias:"corridos",lei:"Art. 109, Res. CGSN 140/2018",cont:"Da ciência do ato impugnado",obs:"Para débitos apurados no Simples Nacional."},
    {nome:"Prescrição Crédito Tributário",dias:1825,tipoDias:"corridos",lei:"Art. 174, CTN",cont:"Da constituição definitiva do crédito",obs:"O Fisco tem 5 anos para ajuizar Execução Fiscal. Após este prazo, o crédito está prescrito."},
    {nome:"Ação Anulatória de Débito Fiscal",dias:1825,tipoDias:"corridos",lei:"Art. 169 CTN c/c Decreto 20.910/1932",cont:"Da constituição definitiva do crédito",obs:"Prazo de 5 anos para o contribuinte discutir o débito judicialmente."},
    {nome:"PER/DCOMP – Compensação",dias:1825,tipoDias:"corridos",lei:"Art. 74, §5º, Lei 9.430/1996",cont:"Da entrega da declaração de compensação (ou do trânsito em julgado, se o crédito vier de decisão judicial)",obs:"Prazo prescricional de 5 anos para transmitir a PER/DCOMP. Se a compensação não for homologada, o contribuinte tem 30 dias (Art. 74, §7º) para pagar o débito indevidamente compensado."},
  ],
  rh:[
    {nome:"Aviso Prévio (mínimo)",dias:30,tipoDias:"corridos",lei:"Art. 487, CLT",cont:"Da comunicação da rescisão",obs:"Aumenta 3 dias por ano completo de serviço (Lei 12.506/2011), até 90 dias. Fórmula: 30 + (anos × 3)."},
    {nome:"Homologação Rescisão (Termo de Rescisão)",dias:10,tipoDias:"corridos",lei:"Art. 477, §6º, CLT",cont:"Do último dia trabalhado ou término do aviso prévio",obs:"Não pagamento gera multa de 1 salário mensal (Art. 477, §8º, CLT)."},
    {nome:"Comunicação de Férias",dias:30,tipoDias:"corridos",lei:"Art. 135, CLT",cont:"Antes do início das férias",obs:"Empregador deve notificar com 30 dias de antecedência. Pagamento: 2 dias antes do início."},
    {nome:"Pagamento das Férias",dias:2,tipoDias:"corridos",lei:"Art. 145, CLT",cont:"Antes do início das férias",obs:"Pagamento até 2 dias antes, incluindo o terço constitucional (1/3)."},
    {nome:"Entrega da CTPS",dias:5,tipoDias:"uteis",lei:"Art. 29, CLT",cont:"Da admissão do empregado",obs:"Empregador deve anotar e devolver a CTPS em até 5 dias úteis. Atraso gera indenização."},
    {nome:"FGTS – Depósito Mensal",dias:7,tipoDias:"corridos",lei:"Art. 15, Lei 8.036/1990",cont:"Até o dia 7 do mês seguinte",obs:"Alíquota de 8% sobre a remuneração (2% para aprendizes). Não recolhimento gera multa e juros."},
    {nome:"eSocial – Admissão",dias:1,tipoDias:"corridos",lei:"Resolução CCESOCIAL 001/2021",cont:"Antes do início das atividades",obs:"Evento S-2200 deve ser enviado até o dia anterior ao início. Para domésticos, até o dia da admissão."},
    {nome:"Período Aquisitivo (Férias)",dias:365,tipoDias:"corridos",lei:"Art. 130, CLT",cont:"Da data de admissão",obs:"Após 12 meses de contrato. O empregador tem mais 12 meses para conceder (período concessivo)."},
    {nome:"Depósito CCT/ACT no MTE",dias:8,tipoDias:"uteis",lei:"Art. 614, CLT",cont:"Da assinatura do instrumento coletivo",obs:"CCTs e ACTs devem ser depositados no MTE em até 8 dias da assinatura."},
  ]
};

const AREA_LABEL = {
  trabalho:"⚖️ Direito do Trabalho",
  civil:"📋 Direito Civil / CPC",
  tributario:"💰 Tributário / Contábil",
  rh:"👥 RH / CLT"
};

// Utilitários de data compartilhados por várias calculadoras
// (Prazos, Salário Intermitente, Prescrição, Datas, mini-calc da home)
function pd(s){if(!s)return null;const[y,m,d]=s.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw new Error('Data inexistente.');return dt;}
function fd(dt){return`${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;}
const DS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function dsem(dt){return DS[dt.getUTCDay()];}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}

// Calculator UI logic — protegido: só roda se o widget de prazos existir nesta página
(function(){
if(!document.getElementById('p-tipo-contagem')) return;

// Corrigido: renderPCards e o toggle das abas de área precisam estar DENTRO
// desta mesma IIFE, no mesmo escopo de openPModal (definida mais abaixo).
// Antes, renderPCards rodava fora da IIFE e chamava openPModal(), que só
// existe dentro dela — isso gerava "ReferenceError: openPModal is not
// defined" ao clicar em qualquer cartão de prazo, e o cartão não fazia nada.

// Render cards
function renderPCards(area){
  const grid = document.getElementById(`pcards-${area}`);
  if(!grid) return;
  grid.innerHTML = '';
  PRAZOS[area].forEach((p,i) => {
    const el = document.createElement('div');
    el.className = 'ppc';
    el.innerHTML = `<div class="ppc-badge"><span class="pn">${p.dias}</span><span>${p.tipoDias==='uteis'?'úteis':'corr.'}</span></div><div class="ppc-body"><div class="ppc-nome" title="${p.nome}">${p.nome}</div><div class="ppc-lei">${p.lei}</div></div>`;
    el.addEventListener('click', () => openPModal(area, i));
    grid.appendChild(el);
  });
}
['trabalho','civil','tributario','rh'].forEach(renderPCards);

// Area tabs — toggle (clique abre/fecha, nenhuma ativa por padrão)
document.querySelectorAll('.patab').forEach(tab => {
  tab.addEventListener('click', () => {
    const isActive = tab.classList.contains('active');
    document.querySelectorAll('.patab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.p-area-panel').forEach(p => p.classList.remove('active'));
    if (!isActive) {
      tab.classList.add('active');
      document.getElementById(`pp-${tab.dataset.area}`).classList.add('active');
    }
  });
});
const pTipoSel   = document.getElementById('p-tipo-contagem');
const pFimGrp    = document.getElementById('p-fim-grp');
const pDiasGrp   = document.getElementById('p-dias-grp');
const pRCorridos = document.getElementById('p-r-corridos');
const pRUteis    = document.getElementById('p-r-uteis');
const pUteisOpts = document.getElementById('p-uteis-opts');

function pUpdateLayout(){
  const isEntre = pTipoSel.value === 'dias_entre_datas';
  pFimGrp.style.display  = isEntre ? '' : 'none';
  pDiasGrp.style.display = isEntre ? 'none' : '';
  // sempre 2 colunas side-by-side
  document.getElementById('p-dates-row').style.gridTemplateColumns = '1fr 1fr';
}
pTipoSel.addEventListener('change', pUpdateLayout);
pUpdateLayout();
pRUteis.addEventListener('change',    () => { if(pRUteis.checked)   pUteisOpts.classList.add('show'); });
pRCorridos.addEventListener('change', () => { if(pRCorridos.checked) pUteisOpts.classList.remove('show'); });

// Date utils
function parseFer(str){if(!str||!str.trim())return[];return str.split(',').map(s=>{const p=s.trim().split('/');if(p.length!==3)return null;const[d,m,a]=p.map(Number);if(isNaN(d)||isNaN(m)||isNaN(a))return null;return new Date(Date.UTC(a,m-1,d));}).filter(Boolean);}
function isFer(dt,fl){return fl.some(f=>f.getTime()===dt.getTime());}
function isNU(dt,eS,eD,fl){const ds=dt.getUTCDay();return(eD&&ds===0)||(eS&&ds===6)||isFer(dt,fl);}
function corrEntre(a,b,iA,iB){let d=Math.round(Math.abs(b.getTime()-a.getTime())/86400000);if(iA&&iB)d+=1;else if(!iA&&!iB)d=Math.max(0,d-1);return Math.max(0,d);}
function uteisEntre(ini,fim,iI,iF,eS,eD,fl){let s=new Date(ini.getTime()),e=new Date(fim.getTime());if(s>e)[s,e]=[e,s];if(!iI)s=new Date(s.getTime()+864e5);if(!iF)e=new Date(e.getTime()-864e5);if(s>e)return{count:0,feriados:[]};let c=0,fer=[],cur=new Date(s.getTime());while(cur<=e){const ds=cur.getUTCDay();if(!((eD&&ds===0)||(eS&&ds===6))){if(isFer(cur,fl))fer.push(fd(cur));else c++;}cur=new Date(cur.getTime()+864e5);}return{count:c,feriados:fer};}
function somarU(ref,n,t,eS,eD,fl,iR){if(t==='corridos'){const o=iR?Math.max(0,n-1):n;return new Date(ref.getTime()+o*864e5);}let c=0,cur=new Date(ref.getTime());if(iR&&!isNU(cur,eS,eD,fl))c=1;if(c>=n)return cur;while(c<n){cur=new Date(cur.getTime()+864e5);if(!isNU(cur,eS,eD,fl))c++;}return cur;}
function subU(ref,n,t,eS,eD,fl,iR){if(t==='corridos'){const o=iR?Math.max(0,n-1):n;return new Date(ref.getTime()-o*864e5);}let c=0,cur=new Date(ref.getTime());if(iR&&!isNU(cur,eS,eD,fl))c=1;if(c>=n)return cur;while(c<n){cur=new Date(cur.getTime()-864e5);if(!isNU(cur,eS,eD,fl))c++;}return cur;}

// Calcular
document.getElementById('p-btn-calc').addEventListener('click', function(){ }); document.getElementById('p-btn-calc').addEventListener('click', () => {
  const resDiv = document.getElementById('p-resultado');
  const resFer = document.getElementById('p-res-feriados');
  resDiv.classList.remove('show','err');
  resFer.classList.remove('show');
  try {
    const ini  = pd(document.getElementById('p-ini').value);
    if(!ini) throw new Error('Data inicial é obrigatória.');
    const tipo     = pTipoSel.value;
    const tipoDias = document.querySelector("input[name='p-tipo-dias']:checked").value;
    const eS = document.getElementById('p-sab').checked;
    const eD = document.getElementById('p-dom').checked;
    const fl = parseFer(document.getElementById('p-fer').value);
    const iI = document.getElementById('p-incl-ini').checked;
    const iF = document.getElementById('p-incl-fim').checked;
    let txt='', resumo='', ferTxt='';

    if(tipo === 'dias_entre_datas'){
      const fim = pd(document.getElementById('p-fim').value);
      if(!fim) throw new Error('Data final é obrigatória.');
      const isReg = ini > fim;
      const [a,b] = isReg ? [fim,ini] : [ini,fim];
      if(tipoDias === 'corridos'){
        txt    = `${isReg?'−':''}${corrEntre(a,b,iI,iF)} dias corridos`;
        resumo = `De ${fd(ini)} (${dsem(ini)}) a ${fd(fim)} (${dsem(fim)}).`;
      } else {
        const {count,feriados} = uteisEntre(a,b,iI,iF,eS,eD,fl);
        txt    = `${isReg?'−':''}${count} dias úteis`;
        resumo = `De ${fd(ini)} a ${fd(fim)}.`;
        if(feriados.length) ferTxt = `🗓 ${feriados.length} feriado(s) descontado(s): ${feriados.join(', ')}`;
      }
    } else if(tipo === 'somar_dias'){
      const n = parseInt(document.getElementById('p-dias').value);
      if(isNaN(n)||n<0) throw new Error('Número de dias inválido.');
      const df = somarU(ini,n,tipoDias,eS,eD,fl,iI);
      txt    = `${fd(df)}  (${dsem(df)})`;
      resumo = `${n} dia(s) ${tipoDias==='uteis'?'úteis':'corridos'} a partir de ${fd(ini)}.`;
    } else {
      const n = parseInt(document.getElementById('p-dias').value);
      if(isNaN(n)||n<0) throw new Error('Número de dias inválido.');
      const df = subU(ini,n,tipoDias,eS,eD,fl,iI);
      txt    = `${fd(df)}  (${dsem(df)})`;
      resumo = `${n} dia(s) ${tipoDias==='uteis'?'úteis':'corridos'} antes de ${fd(ini)}.`;
    }
    document.getElementById('p-res-txt').textContent    = txt;
    document.getElementById('p-res-resumo').textContent = resumo;
    resDiv.classList.add('show');
    if(ferTxt){ resFer.textContent = ferTxt; resFer.classList.add('show'); }
    trackCalcUsage('prazos','cc-prazos');
  } catch(err){
    document.getElementById('p-res-txt').textContent    = 'Erro: '+err.message;
    document.getElementById('p-res-resumo').textContent = '';
    resDiv.classList.add('show','err');
  }
});

// Modal
let pCurPrazo = null;
function openPModal(area, idx){
  const p = PRAZOS[area][idx]; pCurPrazo = p;
  document.getElementById('pm-tag').textContent   = AREA_LABEL[area];
  document.getElementById('pm-title').textContent = p.nome;
  document.getElementById('pm-dias').innerHTML    = `${p.dias} <span>dia${p.dias!==1?'s':''}</span>`;
  document.getElementById('pm-tipo').textContent  = p.tipoDias==='uteis' ? '⚡ Dias úteis — excluem fins de semana e feriados informados' : '📅 Dias corridos — incluem fins de semana';
  document.getElementById('pm-lei').textContent   = p.lei;
  document.getElementById('pm-cont').textContent  = p.cont;
  const obsEl = document.getElementById('pm-obs');
  if(p.obs){ document.getElementById('pm-obs-txt').textContent=p.obs; obsEl.style.display='block'; }
  else obsEl.style.display='none';
  document.getElementById('p-modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closePModal(){
  document.getElementById('p-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  pCurPrazo = null;
}
document.getElementById('p-modal-close').addEventListener('click', closePModal);
document.getElementById('p-modal-overlay').addEventListener('click', e => { if(e.target===document.getElementById('p-modal-overlay')) closePModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape') closePModal(); });

document.getElementById('pm-btn').addEventListener('click', () => {
  if(!pCurPrazo) return;
  const p = pCurPrazo;
  pTipoSel.value = 'somar_dias'; pUpdateLayout();
  document.getElementById('p-dias').value = p.dias;
  if(p.tipoDias==='uteis'){
    pRUteis.checked=true; pUteisOpts.classList.add('show');
    document.getElementById('p-sab').checked=true;
    document.getElementById('p-dom').checked=true;
  } else {
    pRCorridos.checked=true; pUteisOpts.classList.remove('show');
  }
  const ini = document.getElementById('p-ini');
  if(!ini.value){ const h=new Date(); ini.value=`${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`; }
  closePModal();
  const card = document.getElementById('p-calc-card');
  card.scrollIntoView({behavior:'smooth', block:'center'});
  setTimeout(()=>{
    card.style.transition='box-shadow 0.3s';
    card.style.boxShadow='0 0 0 3px rgba(37,99,235,0.5), 0 8px 40px rgba(26,26,46,.13)';
    setTimeout(()=>{ card.style.boxShadow=''; },1200);
  },600);
});

})();

// ─── CORREÇÃO MONETÁRIA — dados via API Banco Central ──
// API pública do BCB: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados
// Códigos: IPCA=433, IGP-M=189, INPC=188, SELIC acumulada mês=4390
// Sem chave, sem custo, sempre atualizada pelo próprio Banco Central

let corrIdx = 'ipca';
function setCorrIdx(idx, btn) {
  corrIdx = idx;
  document.querySelectorAll('.idx-pill').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

// Mapa: índice → código da série BCB
const BCB_SERIES = {
  ipca:  433,
  igpm:  189,
  inpc:  188,
  selic: 4390,
};

// Taxas anuais de fallback (usadas quando API BCB não está disponível)
const TAXAS_FALLBACK = {
  ipca: {2015:10.67,2016:6.29,2017:2.95,2018:3.75,2019:4.31,2020:4.52,2021:10.06,2022:5.79,2023:4.62,2024:4.83,2025:5.53},
  igpm: {2015:10.54,2016:7.17,2017:-0.52,2018:7.54,2019:7.30,2020:23.14,2021:17.78,2022:5.45,2023:-3.18,2024:6.54,2025:6.12},
  inpc: {2015:11.28,2016:6.58,2017:2.07,2018:3.43,2019:4.48,2020:5.45,2021:10.16,2022:5.93,2023:3.71,2024:4.71,2025:5.40},
  selic:{2015:13.25,2016:13.65,2017:6.90,2018:6.50,2019:4.50,2020:2.00,2021:9.25,2022:13.75,2023:11.75,2024:10.50,2025:13.25},
};

const CORR_CACHE = {};

async function buscarIndicesBCB(serie, dataIni, dataFim) {
  const key = `${serie}_${dataIni}_${dataFim}`;
  if (CORR_CACHE[key]) return CORR_CACHE[key];
  const fmt = d => { const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; };
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${fmt(dataIni)}&dataFinal=${fmt(dataFim)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`BCB API erro ${resp.status}`);
  const dados = await resp.json();
  CORR_CACHE[key] = dados;
  return dados;
}

function calcCorrecaoFallback(val, iniStr, fimStr, idx) {
  // Cálculo por taxas anuais quando API indisponível
  const taxas = TAXAS_FALLBACK[idx] || TAXAS_FALLBACK.ipca;
  const anosConhecidos = Object.keys(taxas).map(Number);
  const ultimoAnoConhecido = Math.max(...anosConhecidos);
  const ini = new Date(iniStr + 'T12:00:00');
  const fim = new Date(fimStr + 'T12:00:00');
  let fator = 1;
  for (let y = ini.getFullYear(); y <= fim.getFullYear(); y++) {
    // Para anos ainda não cadastrados (ex.: ano corrente, que só fecha em janeiro seguinte),
    // usa a taxa do último ano fechado disponível como estimativa, em vez de um valor genérico fixo.
    const rate = (taxas[y] !== undefined ? taxas[y] : taxas[ultimoAnoConhecido]) / 100;
    let meses = 12;
    if (y === ini.getFullYear() && y === fim.getFullYear()) meses = Math.max(1, fim.getMonth() - ini.getMonth() + 1);
    else if (y === ini.getFullYear()) meses = 12 - ini.getMonth();
    else if (y === fim.getFullYear()) meses = fim.getMonth() + 1;
    fator *= Math.pow(1 + rate, meses / 12);
  }
  const fmt = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const atualizado = val * fator;
  document.getElementById('corr-res-val').textContent = fmt(atualizado);
  document.getElementById('corr-res-det').textContent =
    `Valor original: ${fmt(val)} · Correção: ${fmt(atualizado-val)} · Variação: ${((fator-1)*100).toFixed(2).replace('.',',')}% · Fator: ${fator.toFixed(6)} · Fonte: taxas anuais (estimativa — API BCB indisponível)`;
  document.getElementById('corr-res').classList.add('show');
  trackCalcUsage('correcao','cc-correcao');
}

async function calcCorrecao() {
  const valStr = document.getElementById('corr-val').value;
  const iniStr = document.getElementById('corr-ini').value;
  const fimStr = document.getElementById('corr-fim').value;
  const rb     = document.getElementById('corr-res');
  const btnCalc = document.querySelector('#sec-correcao .btn-p');

  rb.classList.remove('show', 'err');

  const val = parseVal(valStr);
  if (!val || isNaN(val) || !iniStr || !fimStr) {
    alert('Preencha valor, data base e data final.'); return;
  }
  if (iniStr >= fimStr) {
    alert('Data final deve ser após a data base.'); return;
  }

  // Feedback visual enquanto busca
  btnCalc.textContent = '⏳ Buscando dados...';
  btnCalc.disabled = true;

  try {
    const serie = BCB_SERIES[corrIdx];

    // Busca variações mensais do índice no período
    const dados = await buscarIndicesBCB(serie, iniStr, fimStr);

    if (!dados || dados.length === 0) {
      throw new Error('Nenhum dado retornado para o período informado.');
    }

    // Calcula fator acumulado multiplicando (1 + taxa/100) mês a mês
    let fator = 1;
    for (const item of dados) {
      const taxa = parseFloat(item.valor.replace(',', '.'));
      if (!isNaN(taxa)) fator *= (1 + taxa / 100);
    }

    const atualizado = val * fator;
    const correcao   = atualizado - val;
    const pct        = ((fator - 1) * 100).toFixed(2).replace('.', ',');

    const fmt = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

    // Pega o período real dos dados retornados
    const primData = dados[0].data;
    const ultData  = dados[dados.length - 1].data;

    document.getElementById('corr-res-val').textContent = fmt(atualizado);
    document.getElementById('corr-res-det').textContent =
      `Valor original: ${fmt(val)} · Correção: ${fmt(correcao)} · Variação: ${pct}% · `
      + `Fator: ${fator.toFixed(6)} · ${dados.length} meses (${primData} a ${ultData}) · `
      + `Fonte: Banco Central do Brasil`;

    rb.classList.add('show');
    showAdAfterResult('ad-correcao-after-result');
    showAdAfterResult('ad-correcao-result');trackCalcUsage('correcao','cc-correcao');
    document.getElementById('corr-fallback-note').style.display='none';

  } catch (err) {
    // Fallback: usar taxas anuais locais
    try {
      calcCorrecaoFallback(val, iniStr, fimStr, corrIdx);
      document.getElementById('corr-fallback-note').style.display='';
    } catch(e2) {
      document.getElementById('corr-res-val').textContent = 'Erro no cálculo.';
      document.getElementById('corr-res-det').textContent = err.message;
      rb.classList.add('show', 'err');
    }
  } finally {
    btnCalc.textContent = 'Atualizar Valor →';
    btnCalc.disabled = false;
  }
}

// ─── JUROS ─────────────────────────────────────────
let jTipo = 'simples', jPer = 'mensal';

// Instância global do gráfico de juros (para destruir antes de recriar)
// Lazy load do Chart.js — carregado apenas quando o usuário usa a calculadora de juros
let chartJsLoaded = false;
function loadChartJs(callback) {
  if (chartJsLoaded || typeof Chart !== 'undefined') { callback(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload = () => { chartJsLoaded = true; callback(); };
  document.head.appendChild(s);
}
let jChartInstance = null;

// ── Taxas de referência para o gráfico comparativo ────────────────────────
// Cache em localStorage com TTL de 24h; fallback para valores padrão
const J_RATES_KEY = 'cp_taxas_v1';
const J_RATES_TTL = 86400000; // 24h em ms

// Valores padrão (usados como fallback quando a API está indisponível)
const J_RATES_DEFAULT = {
  selic: 13.25,
  cdi:   13.15,
  poupanca: 7.43,
  updatedAt: null
};

/**
 * Busca a taxa SELIC atual na API pública do Banco Central do Brasil.
 * Série 432 = Meta SELIC (% a.a.). Armazena em localStorage por 24h.
 */
async function fetchTaxasRef() {
  try {
    const cached = JSON.parse(localStorage.getItem(J_RATES_KEY) || 'null');
    if (cached && cached.updatedAt && (Date.now() - cached.updatedAt) < J_RATES_TTL) {
      return cached;
    }
  } catch(e) {}

  try {
    const resp = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json');
    if (!resp.ok) throw new Error('BCB API erro');
    const dados = await resp.json();
    const selicAA = parseFloat(dados[0].valor.replace(',', '.'));
    if (isNaN(selicAA)) throw new Error('Valor inválido');
    const rates = {
      selic:    selicAA,
      cdi:      Math.max(0, selicAA - 0.10),
      poupanca: selicAA > 8.5 ? +(selicAA * 0.70).toFixed(4) : +(selicAA * 0.70 + 0.5).toFixed(4),
      updatedAt: Date.now()
    };
    localStorage.setItem(J_RATES_KEY, JSON.stringify(rates));
    return rates;
  } catch(e) {
    return J_RATES_DEFAULT;
  }
}

/**
 * Calcula o montante de um investimento com taxa anual convertida para o período.
 */
function calcMontanteRef(capital, taxaAA, n, per) {
  let taxaPer;
  if (per === 'mensal')      taxaPer = Math.pow(1 + taxaAA / 100, 1 / 12) - 1;
  else if (per === 'anual')  taxaPer = taxaAA / 100;
  else                       taxaPer = Math.pow(1 + taxaAA / 100, 1 / 252) - 1;
  return capital * Math.pow(1 + taxaPer, n);
}

/**
 * Calcula IR sobre rendimentos de renda fixa (tabela regressiva Lei 11.033/2004).
 * Até 180 dias → 22,5% | 181–360 → 20% | 361–720 → 17,5% | acima de 720 → 15%
 */
function calcIRRendaFixa(rendimento, n, per) {
  let dias;
  if (per === 'mensal')     dias = n * 30;
  else if (per === 'anual') dias = n * 365;
  else                      dias = n;

  let aliq, label;
  if      (dias <= 180)  { aliq = 22.5; label = 'até 180 dias'; }
  else if (dias <= 360)  { aliq = 20.0; label = '181 a 360 dias'; }
  else if (dias <= 720)  { aliq = 17.5; label = '361 a 720 dias'; }
  else                   { aliq = 15.0; label = 'acima de 720 dias'; }

  const ir      = rendimento * (aliq / 100);
  const liquido = rendimento - ir;
  return { aliq, ir, liquido, label, dias };
}

function jSetTipo(t, btn) {
  jTipo = t;
  document.querySelectorAll('#j-tipo-tabs .ptab').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  // Exibe campo de multa apenas no modo mora
  document.getElementById('j-multa-grp').style.display = (t === 'mora') ? '' : 'none';
}

function jSetPer(p, btn) {
  jPer = p;
  const lbl  = { mensal: 'Mensal', anual: 'Anual', diaria: 'Diária' };
  const ulbl = { mensal: '(meses)', anual: '(anos)', diaria: '(dias)' };
  document.getElementById('j-taxa-lbl').textContent = lbl[p];
  document.getElementById('j-per-lbl').textContent  = ulbl[p];
  ['jp-mes', 'jp-ano', 'jp-dia'].forEach(id => document.getElementById(id).className = 'btn btn-g');
  const map = { mensal: 'jp-mes', anual: 'jp-ano', diaria: 'jp-dia' };
  document.getElementById(map[p]).className = 'btn btn-p';
}

const fmtBRL = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

// ─── CONTADOR DE USO DAS CALCULADORAS ──────────────────────────
// Reaproveita o mesmo Worker/KV já usado para contar leituras de artigos
// (calculaprazo-views-api), mas com slugs próprios por ferramenta
// (prefixo "calc-"), sem qualquer alteração no back-end.
// Toda vez que um cálculo é concluído com sucesso, incrementa +1 e
// atualiza o contador visível ao lado do resultado.
function trackCalcUsage(toolSlug, displayElId){
  try{
    if(window.CPViews && typeof window.CPViews.trackCalc === 'function'){
      window.CPViews.trackCalc('calc-' + toolSlug, displayElId);
    }
  }catch(e){/* silencioso: contador nunca deve travar o cálculo */}
}
// parseVal: aceita formato BR (1.234,56), US (1234.56) e inteiros — resistente a type=number no mobile
function parseVal(s){
  if(s===null||s===undefined)return NaN;
  s=String(s).trim().replace(/\s/g,'');
  if(!s)return NaN;
  // Formato BR com ponto de milhar: 1.234,56 ou 1.234.567,89
  if(/^-?[\d]{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return parseFloat(s.replace(/\./g,'').replace(',','.'));
  // Formato com vírgula decimal: 1234,56
  if(/^-?\d+,\d{1,2}$/.test(s)) return parseFloat(s.replace(',','.'));
  // Formato US/padrão: 1234.56
  return parseFloat(s);
}
const fmtN   = n => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * Calculadora de Juros — versão corrigida e expandida.
 * Inclui: validações robustas, cálculo correto de simples/compostos,
 * IR (tabela regressiva), gráfico comparativo (API BCB), recomendações.
 */
async function calcJuros() {
  // 1. Leitura e validação dos campos
  const capStr   = document.getElementById('j-cap').value.trim();
  const taxaStr  = document.getElementById('j-taxa').value.trim();
  const perStr   = document.getElementById('j-per').value.trim();
  const multaStr = document.getElementById('j-multa').value.trim();
  const aporteStr = document.getElementById('j-aporte').value.trim();

  const C      = parseVal(capStr);
  const i      = parseVal(taxaStr);
  const n      = parseInt(perStr, 10);
  const multa  = parseVal(multaStr) || 0;
  const aporte = parseVal(aporteStr) || 0;

  if (!capStr || isNaN(C) || C <= 0) {
    alert('⚠️ Informe um Capital válido e positivo (ex: 1000).'); return;
  }
  if (!taxaStr || isNaN(i) || i <= 0) {
    alert('⚠️ Informe uma Taxa válida e positiva (ex: 1.5).'); return;
  }
  if (!perStr || isNaN(n) || n <= 0) {
    alert('⚠️ Informe um Período válido e positivo (ex: 12).'); return;
  }
  if (i > 100 && jPer === 'mensal') {
    if (!confirm('Taxa de ' + i + '% ao mês parece muito alta. Deseja continuar?')) return;
  }

  // 2. Cálculo principal
  const rate = i / 100;
  let M, J, rows = [];

  if (jTipo === 'simples') {
    // Juros Simples: M = C × (1 + i × n)
    if (aporte === 0) {
      J = C * rate * n;
      M = C + J;
      for (let k = 1; k <= Math.min(n, 60); k++) {
        rows.push([k, C, C * rate, C + C * rate * k]);
      }
    } else {
      // Com aportes mensais (cada aporte rende juros sobre o tempo restante)
      let saldo = C;
      J = 0;
      const totalInvestido = C + (aporte * n);
      for (let k = 1; k <= n; k++) {
        const jk = saldo * rate;
        J += jk;
        saldo += jk + aporte;
        if (k <= 60) rows.push([k, saldo - jk - aporte, jk, saldo]);
      }
      M = saldo;
    }
  } else if (jTipo === 'compostos') {
    // Juros Compostos: M = C × (1 + i)^n
    if (aporte === 0) {
      M = C * Math.pow(1 + rate, n);
      J = M - C;
      let saldo = C;
      for (let k = 1; k <= Math.min(n, 60); k++) {
        const jk = saldo * rate;
        saldo += jk;
        rows.push([k, saldo - jk, jk, saldo]);
      }
    } else {
      // Com aportes mensais (FV de anuidade com juros compostos)
      // Conversão de período: se jPer === 'anual', converter para meses
      let nMeses = n;
      let taxaMensal = rate;
      
      if (jPer === 'anual') {
        nMeses = n * 12; // Converter anos para meses
        taxaMensal = Math.pow(1 + rate, 1/12) - 1; // Taxa equivalente mensal
      } else if (jPer === 'diaria') {
        nMeses = n * 30; // Converter dias para meses (aproximado)
        taxaMensal = Math.pow(1 + rate, 30) - 1; // Taxa equivalente mensal
      }
      // Se jPer === 'mensal', nMeses = n e taxaMensal = rate (sem conversão)
      
      // Fórmula: FV = PV × (1 + i)^n + PMT × [((1 + i)^n - 1) / i]
      const fatorCapital = Math.pow(1 + taxaMensal, nMeses);
      const fatorAporte = (fatorCapital - 1) / taxaMensal;
      
      M = C * fatorCapital + aporte * fatorAporte;
      const totalInvestido = C + (aporte * nMeses);
      J = M - totalInvestido;
      
      // Tabela de evolução mês a mês
      let saldo = C;
      for (let k = 1; k <= Math.min(nMeses, 60); k++) {
        const saldoAnt = saldo;
        saldo = saldo * (1 + taxaMensal) + aporte;
        const jk = saldo - saldoAnt - aporte;
        rows.push([k, saldoAnt, jk, saldo]);
      }
    }
  } else {
    // Mora: juros simples + multa
    const mv = C * (multa / 100);
    J = C * rate * n;
    M = C + J + mv;
    rows = [[n, C, J, M]];
  }

  if (!isFinite(M) || !isFinite(J) || isNaN(M) || isNaN(J)) {
    alert('⚠️ Resultado inválido. Verifique os valores informados.'); return;
  }

  // 3. Exibe resultados principais
  const rendPct = C > 0 ? ((J / C) * 100).toFixed(2).replace('.', ',') : '0,00';
  document.getElementById('j-ri-grid').innerHTML =
    '<div class="ri"><div class="ri-lbl">Capital Inicial</div><div class="ri-val">' + fmtBRL(C) + '</div></div>' +
    '<div class="ri"><div class="ri-lbl">Juros Totais</div><div class="ri-val" style="color:var(--acc)">' + fmtBRL(J) + '</div></div>' +
    '<div class="ri span2"><div class="ri-lbl">Montante Final (Bruto)</div><div class="ri-val" style="font-size:1.3rem;">' + fmtBRL(M) + '</div></div>' +
    '<div class="ri"><div class="ri-lbl">Rendimento Total</div><div class="ri-val">' + rendPct + '%</div></div>';

  // 4. IR sobre rendimentos (apenas simples e compostos)
  const irBox = document.getElementById('j-ir-box');
  if (jTipo !== 'mora' && J > 0) {
    const ir = calcIRRendaFixa(J, n, jPer);
    const montanteLiq = M - ir.ir;
    document.getElementById('j-ir-grid').innerHTML =
      '<div class="ri"><div class="ri-lbl">Rendimento Bruto</div><div class="ri-val">' + fmtBRL(J) + '</div></div>' +
      '<div class="ri"><div class="ri-lbl">IR (' + ir.aliq + '%)</div><div class="ri-val" style="color:var(--err)">-' + fmtBRL(ir.ir) + '</div></div>' +
      '<div class="ri"><div class="ri-lbl">Rendimento Líquido</div><div class="ri-val" style="color:var(--ok)">' + fmtBRL(ir.liquido) + '</div></div>' +
      '<div class="ri"><div class="ri-lbl">Montante Líquido</div><div class="ri-val" style="color:var(--ok);font-weight:800;">' + fmtBRL(montanteLiq) + '</div></div>';
    document.getElementById('j-ir-aliq').textContent =
      'Alíquota de ' + ir.aliq + '% aplicada para ' + ir.label + ' (' + ir.dias + ' dias). ' +
      'Regra regressiva de IR para renda fixa (Lei 11.033/2004).';
    irBox.style.display = '';
  } else {
    irBox.style.display = 'none';
  }

  // 5. Tabela de evolução
  if (rows.length > 1) {
    document.getElementById('j-tbl').innerHTML =
      '<thead><tr><th>Período</th><th>Saldo Anterior</th><th>Juros do Período</th><th>Montante</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + r[0] + '</td><td>' + fmtBRL(r[1]) + '</td><td>' + fmtBRL(r[2]) + '</td><td>' + fmtBRL(r[3]) + '</td></tr>').join('') +
      '</tbody>';
    document.getElementById('j-tbl-wrap').style.display = 'block';
  } else {
    document.getElementById('j-tbl-wrap').style.display = 'none';
  }

  // Mostra o card de resultado
  document.getElementById('j-res-card').style.display = 'block';

  // 6. Gráfico comparativo (async, via API BCB)
  if (jTipo !== 'mora') {
    const rates = await fetchTaxasRef();
    const mSelic    = calcMontanteRef(C, rates.selic,    n, jPer);
    const mCdi      = calcMontanteRef(C, rates.cdi,      n, jPer);
    const mPoupanca = calcMontanteRef(C, rates.poupanca, n, jPer);

    loadChartJs(() => {
      if (jChartInstance) { jChartInstance.destroy(); jChartInstance = null; }

      const ctx = document.getElementById('j-chart').getContext('2d');
      jChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Seu Investimento', 'Poupança', 'SELIC', 'CDI'],
        datasets: [{
          label: 'Montante Final (R$)',
          data: [M, mPoupanca, mSelic, mCdi],
          backgroundColor: [
            'rgba(37,99,235,0.85)',
            'rgba(5,150,105,0.75)',
            'rgba(217,119,6,0.75)',
            'rgba(124,58,237,0.75)'
          ],
          borderColor: [
            'rgba(37,99,235,1)',
            'rgba(5,150,105,1)',
            'rgba(217,119,6,1)',
            'rgba(124,58,237,1)'
          ],
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + fmtBRL(ctx.parsed.y) } }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: { callback: v => fmtBRL(v), font: { size: 10 } }
          },
          x: { ticks: { font: { size: 11 } } }
        }
      }
    });

      const srcLabel = rates.updatedAt ? 'API Banco Central do Brasil' : 'valores de referência (offline)';
      document.getElementById('j-chart-info').textContent =
        'SELIC: ' + fmtN(rates.selic) + '% a.a. · CDI: ' + fmtN(rates.cdi) + '% a.a. · Poupança: ' + fmtN(rates.poupanca) + '% a.a. · Fonte: ' + srcLabel;
      document.getElementById('j-chart-box').style.display = '';
    }); // fim loadChartJs
  } else {
    document.getElementById('j-chart-box').style.display = 'none';
  }

  // 7. Anúncio + recomendações
  showAdAfterResult('ad-juros-after-result');
  showAdAfterResult('ad-juros-result');trackCalcUsage('juros','cc-juros');
  loadRecomendacoes('j-recomendacoes');

  document.getElementById('j-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Carrega recomendações de /data/recomendacoes.json e renderiza no elemento alvo.
 * Exibe apenas itens da categoria 'juros' ou 'geral'.
 */
async function loadRecomendacoes(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (el.dataset.loaded === '1') { el.style.display = ''; return; }

  try {
    const resp = await fetch('/data/recomendacoes.json');
    if (!resp.ok) return;
    const data = await resp.json();
    const items = (data.recomendacoes || []).filter(
      r => !r.categoria || r.categoria === 'juros' || r.categoria === 'geral'
    ).slice(0, 3);
    if (!items.length) return;

    el.innerHTML =
      '<div class="container" style="padding:0 0 16px;">' +
      '<div class="card" style="margin-top:0;">' +
      '<h3 style="font-size:.85rem;font-weight:700;margin-bottom:12px;">📌 Conteúdo Recomendado</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">' +
      items.map(r =>
        '<a href="' + (r.url || '#') + '" target="_blank" rel="noopener sponsored" ' +
        'style="display:block;padding:12px 14px;border:1.5px solid var(--brd);border-radius:var(--r);text-decoration:none;transition:all .15s;" ' +
        'onmouseover="this.style.borderColor=\'var(--acc)\';this.style.background=\'var(--b50)\'" ' +
        'onmouseout="this.style.borderColor=\'var(--brd)\';this.style.background=\'\'"> ' +
        '<div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--acc);margin-bottom:4px;">' + (r.badge || 'Parceiro') + '</div>' +
        '<div style="font-size:.84rem;font-weight:700;color:var(--txt);margin-bottom:4px;">' + r.titulo + '</div>' +
        '<div style="font-size:.76rem;color:var(--txt-m);line-height:1.45;">' + r.descricao + '</div>' +
        '</a>'
      ).join('') +
      '</div>' +
      '<p style="font-size:.68rem;color:var(--txt-s);margin-top:8px;">* Links de parceiros. Avalie as condições antes de contratar.</p>' +
      '</div></div>';
    el.dataset.loaded = '1';
    el.style.display = '';
  } catch(e) { /* silencioso */ }
}

// ─── SALÁRIO LÍQUIDO ───────────────────────────────
const INSS_FAIXAS=[[1518,7.5],[2793.88,9],[4190.83,12],[8157.41,14]];
// Tabela IRRF 2026 — tabela progressiva base (mesma de 2025)
// + Redutor Adicional Lei 15.270/2025 (vigente 01/01/2026)
// Redutor: até 5.000 → redutor = imposto integral (isenção total)
//          5.000,01–7.350 → redutor = 978,61 − (0,133145 × rendimento bruto)
const IRRF_FAIXAS=[[2428.80,0,0],[2826.65,7.5,182.16],[3751.05,15,394.16],[4664.68,22.5,675.49],[Infinity,27.5,908.73]];

function calcRedutorAdicional(bruto, irrfBase){
  // Redutor Adicional Lei 15.270/2025
  if(bruto<=5000) return irrfBase; // isenção total
  if(bruto<=7350){
    const redutor=978.61-(0.133145*bruto);
    return Math.min(Math.max(redutor,0),irrfBase);
  }
  return 0;
}
const DEP_IRRF=189.59;

function calcSalario(){
  const bruto=parseVal(document.getElementById('sal-bruto').value)||0;
  const dep=parseInt(document.getElementById('sal-dep').value)||0;
  const outros=parseVal(document.getElementById('sal-outros').value)||0;
  if(bruto<=0){alert('Informe o salário bruto.');return;}
  // INSS progressivo
  let inss=0,base=bruto,ant=0;
  for(const[lim,aliq] of INSS_FAIXAS){if(base<=0)break;const fatia=Math.min(base,lim-ant);inss+=fatia*(aliq/100);ant=lim;base-=fatia;}
  inss=Math.min(inss,bruto*0.14);
  // IRRF
  const baseIRRF=bruto-inss-(dep*DEP_IRRF);
  let irrf=0,aliqLabel='Isento';
  for(const[lim,aliq,dedu] of IRRF_FAIXAS){if(baseIRRF<=lim){irrf=Math.max(0,baseIRRF*(aliq/100)-dedu);aliqLabel=aliq===0?'Isento':`${aliq}%`;break;}}
  // Aplicar Redutor Adicional 2026 (Lei 15.270/2025) — usando salário bruto como parâmetro
  const redutor=calcRedutorAdicional(bruto,irrf);
  irrf=Math.max(0,irrf-redutor);
  if(irrf===0)aliqLabel='Isento (Lei 15.270/2025)';
  const liq=bruto-inss-irrf-outros;
  document.getElementById('sr-bruto').textContent=fmtBRL(bruto);
  document.getElementById('sr-inss').textContent=`-${fmtBRL(inss)}`;
  document.getElementById('sr-base').textContent=fmtBRL(Math.max(0,baseIRRF));
  document.getElementById('sr-irrf').textContent=`-${fmtBRL(irrf)}`;
  document.getElementById('sr-liq').textContent=fmtBRL(liq);
  document.getElementById('sr-aliq').innerHTML=`INSS: <strong>${fmtBRL(inss)}</strong> · IRRF: <strong>${fmtBRL(irrf)}</strong> (alíq. efetiva: ${aliqLabel}) · Dependentes: ${dep} · Dedução/dep: R$ ${DEP_IRRF.toFixed(2).replace('.',',')}`;
  showAdAfterResult('ad-salario-after-result');
  showAdAfterResult('ad-salario-result');document.getElementById('sal-res').style.display='block';trackCalcUsage('salario','cc-salario');
}

// ─── PORCENTAGEM ───────────────────────────────────
let pctM='pct-de';
function pctMode(btn){pctM=btn.dataset.m;document.querySelectorAll('#pct-mode-pills .pill').forEach(b=>b.classList.remove('on'));btn.classList.add('on');document.querySelectorAll('.pct-f').forEach(f=>f.style.display='none');document.getElementById('pct-'+pctM).style.display='';document.getElementById('pct-res').classList.remove('show','err');}
function calcPct(){
  const rb=document.getElementById('pct-res');rb.classList.remove('show','err');
  let v='',d='';
  try{
    if(pctM==='pct-de'){const p=parseFloat(document.getElementById('pct-a1').value),base=parseFloat(document.getElementById('pct-b1').value);if(isNaN(p)||isNaN(base))throw new Error('Preencha os campos.');v=fmtBRL(base*p/100);d=`${fmtN(p)}% de ${fmtBRL(base)} = ${fmtBRL(base*p/100)}`;}
    else if(pctM==='desconto'){const base=parseFloat(document.getElementById('pct-a2').value),p=parseFloat(document.getElementById('pct-b2').value);if(isNaN(base)||isNaN(p))throw new Error('Preencha.');const desc=base*p/100;v=fmtBRL(base-desc);d=`Desconto de ${fmtN(p)}% (${fmtBRL(desc)}) sobre ${fmtBRL(base)}`;}
    else if(pctM==='aumento'){const base=parseFloat(document.getElementById('pct-a3').value),p=parseFloat(document.getElementById('pct-b3').value);if(isNaN(base)||isNaN(p))throw new Error('Preencha.');const ac=base*p/100;v=fmtBRL(base+ac);d=`Aumento de ${fmtN(p)}% (${fmtBRL(ac)}) sobre ${fmtBRL(base)}`;}
    else if(pctM==='variacao'){const a=parseFloat(document.getElementById('pct-a4').value),b=parseFloat(document.getElementById('pct-b4').value);if(isNaN(a)||isNaN(b)||a===0)throw new Error('Preencha.');const pct=(b-a)/a*100;v=`${pct>=0?'+':''}${fmtN(pct)}%`;d=`De ${fmtBRL(a)} para ${fmtBRL(b)} = variação de ${fmtN(pct)}%`;}
    else{const x=parseFloat(document.getElementById('pct-a5').value),y=parseFloat(document.getElementById('pct-b5').value);if(isNaN(x)||isNaN(y)||y===0)throw new Error('Preencha.');v=`${fmtN(x/y*100)}%`;d=`${fmtBRL(x)} representa ${fmtN(x/y*100)}% de ${fmtBRL(y)}`;}
    document.getElementById('pct-res-val').textContent=v;document.getElementById('pct-res-det').textContent=d;rb.classList.add('show');showAdAfterResult('ad-porcentagem-result');trackCalcUsage('porcentagem','cc-porcentagem');
  }catch(e){document.getElementById('pct-res-val').textContent='Erro: '+e.message;rb.classList.add('show','err');}
}

// ─── MOEDAS ────────────────────────────────────────
// Taxas de fallback (usadas enquanto a API carrega ou em caso de erro)
let RATES={BRL:1,USD:0.188,EUR:0.174,GBP:0.149,ARS:192,JPY:29.1,CAD:0.261,CHF:0.168};
let RATES_UPDATED_AT=null;
const MOEDA_CACHE_KEY='cp_rates_v1';
const MOEDA_CACHE_TTL=3600000; // 1h em ms
const SYMS={BRL:'R$',USD:'US$',EUR:'€',GBP:'£',ARS:'ARS$',JPY:'¥',CAD:'CA$',CHF:'CHF'};

async function fetchRatesLive(){
  try{
    const cached=JSON.parse(localStorage.getItem(MOEDA_CACHE_KEY)||'null');
    if(cached&&cached.ts&&(Date.now()-cached.ts)<MOEDA_CACHE_TTL){
      RATES=cached.rates;RATES_UPDATED_AT=new Date(cached.ts);return;
    }
  }catch(e){}
  try{
    const resp=await fetch('https://open.er-api.com/v6/latest/BRL');
    if(!resp.ok)throw new Error('API indisponível');
    const data=await resp.json();
    if(data.result!=='success')throw new Error('Resultado inválido');
    const r=data.rates;
    // Armazenamos relativo ao BRL (1 BRL = X moeda)
    RATES={BRL:1,USD:r.USD,EUR:r.EUR,GBP:r.GBP,ARS:r.ARS,JPY:r.JPY,CAD:r.CAD,CHF:r.CHF};
    RATES_UPDATED_AT=new Date();
    localStorage.setItem(MOEDA_CACHE_KEY,JSON.stringify({rates:RATES,ts:Date.now()}));
    calcMoeda(); // recalcula com taxas atualizadas
  }catch(e){
    // Mantém fallback silenciosamente
  }
}

function calcMoeda(){
  showAdAfterResult('ad-moedas-result');trackCalcUsage('moedas','cc-moedas');
  const v=parseFloat(document.getElementById('moeda-val-in').value)||0;
  const de=document.getElementById('moeda-de').value;
  const para=document.getElementById('moeda-para').value;
  const inBRL=v/RATES[de];
  const result=inBRL*RATES[para];
  document.getElementById('moeda-pfx-s').textContent=SYMS[de]||de;
  document.getElementById('moeda-res-val').textContent=`${SYMS[para]||para} ${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4}).format(result)}`;
  const updTxt=RATES_UPDATED_AT?` · Atualizado ${RATES_UPDATED_AT.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'';
  document.getElementById('moeda-res-det').textContent=`1 ${de} = ${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4}).format(RATES[para]/RATES[de])} ${para}${updTxt}`;
  document.getElementById('moeda-res').classList.add('show');
}

// ─── TRABALHISTA ───────────────────────────────────
// Atualiza opções de aviso prévio conforme tipo de rescisão
function tTipoChange(){
  const tipo = document.getElementById('t-tipo').value;
  const avisoWrap = document.getElementById('t-aviso-wrap');
  const avisoSel = document.getElementById('t-aviso');
  const descontoWrap = document.getElementById('t-aviso-desconto-wrap');

  // Com justa causa: sem aviso
  if(tipo === 'comjusta'){
    avisoWrap.style.display = 'none';
    return;
  }
  avisoWrap.style.display = '';

  if(tipo === 'pedido'){
    // Pedido de demissão: o empregado deve aviso à empresa
    avisoSel.style.display = 'none';
    descontoWrap.style.display = '';
  } else {
    // Sem justa causa ou acordo: empresa deve aviso ao empregado
    avisoSel.style.display = '';
    descontoWrap.style.display = 'none';
    // Resetar opções para sem justa causa
    avisoSel.innerHTML = tipo === 'acordo'
      ? '<option value="indenizado">Indenizado (50% — Art. 484-A CLT)</option><option value="trabalhado">Trabalhado</option><option value="dispensado">Dispensado</option>'
      : '<option value="indenizado">Indenizado pela empresa (pago no Termo de Rescisão)</option><option value="trabalhado">Trabalhado (pago no saldo de salário)</option><option value="dispensado">Dispensado / sem aviso</option>';
  }
}

function calcTrabalhista(){
  const sal    = parseVal(document.getElementById('t-sal').value)||0;
  const medias = parseVal(document.getElementById('t-medias').value)||0;
  const admStr = document.getElementById('t-adm').value;
  const demStr = document.getElementById('t-dem').value;
  const tipo   = document.getElementById('t-tipo').value;
  const ferVenc= parseInt(document.getElementById('t-fer-venc').value)||0;
  if(!sal||!admStr||!demStr){alert('Preencha salário, admissão e demissão.');return;}

  const adm = new Date(admStr+'T12:00:00');
  const dem = new Date(demStr+'T12:00:00');

  const mesesTotal       = (dem.getFullYear()-adm.getFullYear())*12 + (dem.getMonth()-adm.getMonth());
  const anos             = Math.floor(mesesTotal/12);
  const mesesPeriodoAtual= mesesTotal % 12;
  const diasUltimoMes   = dem.getDate();

  // Base (salário + médias habituais — Súm. 264 TST)
  const base = sal + medias;

  // ── Aviso prévio ──────────────────────────────────────
  const diasAviso = Math.min(90, 30 + anos*3); // Lei 12.506/2011

  // Lê opção de aviso conforme tipo
  let avisoIndenizado = 0;   // valor pago no TRCT
  let diasAvTrabalhado = 0;  // dias que entram no saldo de salário
  let descontoAviso = 0;     // desconto no TRCT (pedido demissão sem cumprir)

  if(tipo === 'comjusta'){
    // Sem aviso
  } else if(tipo === 'pedido'){
    const opt = document.getElementById('t-aviso-pedido').value;
    if(opt === 'nao_cumpriu'){
      // Empresa desconta 30 dias do TRCT
      descontoAviso = base * (30/30);
    } else if(opt === 'cumpriu'){
      // Empregado trabalhou — dias pagos no saldo de salário
      diasAvTrabalhado = 30;
    }
    // se dispensado: nenhum efeito financeiro
  } else {
    // semjusta ou acordo
    const opt = document.getElementById('t-aviso').value;
    const fatorAviso = tipo === 'acordo' ? 0.5 : 1; // acordo = 50% do aviso
    if(opt === 'indenizado'){
      avisoIndenizado = base * (diasAviso/30) * fatorAviso;
    } else if(opt === 'trabalhado'){
      diasAvTrabalhado = diasAviso;
    }
    // dispensado: nenhum efeito
  }

  // ── Saldo de salário ──────────────────────────────────
  // Apenas os dias trabalhados ATÉ a data de demissão (não inclui dias do aviso).
  // Se o aviso for trabalhado, ele é pago na folha normal do(s) mês(es) do aviso,
  // não entra no saldo rescisório.
  const diasSaldo = diasUltimoMes;
  const saldoSal  = base / 30 * diasSaldo;

  // Aviso trabalhado: valor informativo (pago na folha, não no Termo de Rescisão)
  const avisoTrabVal = diasAvTrabalhado > 0 ? base * (diasAvTrabalhado / 30) : 0;

  // ── Férias vencidas ───────────────────────────────────
  const ferVencVal = ferVenc > 0 ? base * ferVenc * (4/3) : 0;

  // ── Férias proporcionais ──────────────────────────────
  const avosAquis   = mesesPeriodoAtual + (diasUltimoMes >= 15 ? 1 : 0);
  const avosFerProp = Math.min(11, avosAquis);
  const ferPropVal  = (tipo !== 'comjusta' && avosFerProp > 0)
    ? (base / 12 * avosFerProp) * (4/3) : 0;

  // ── 13º proporcional ─────────────────────────────────
  // Conta a partir de 1º de janeiro do ano da demissão, OU da data de admissão,
  // o que for posterior (caso admissão e demissão sejam no mesmo ano civil).
  const mesInicio13 = (adm.getFullYear() === dem.getFullYear()) ? adm.getMonth() : 0;
  const avos13  = (dem.getMonth() - mesInicio13) + (diasUltimoMes >= 15 ? 1 : 0);
  const decTerc = (tipo !== 'comjusta' && avos13 > 0) ? base / 12 * avos13 : 0;

  // ── Multa FGTS (Multa é verba rescisória — paga no TRCT) ─
  const fgtsBase  = base * 0.08 * Math.max(1, mesesTotal);
  const multaFGTS = tipo==='semjusta' ? fgtsBase*0.4 : tipo==='acordo' ? fgtsBase*0.2 : 0;

  // ── Monta itens do TRCT (sem FGTS estimado) ──────────
  const itensTRCT = [
    {n:`Saldo de Salário (${diasSaldo} dias)`, v: saldoSal},
    {n:`Férias Vencidas + 1/3 (${ferVenc} período${ferVenc!==1?'s':''})`, v: ferVencVal},
    {n:`Férias Proporcionais + 1/3 (${avosFerProp}/12 avos)`, v: ferPropVal},
    {n:`13º Proporcional (${avos13}/12 avos)`, v: decTerc},
    {n:`Aviso Prévio Indenizado (${diasAviso} dias${tipo==='acordo'?' — 50%':''})`, v: avisoIndenizado},
    {n:`Multa FGTS (${tipo==='semjusta'?'40%':'20%'})`, v: multaFGTS},
    {n:`(-) Desconto aviso prévio não cumprido (30 dias)`, v: descontoAviso > 0 ? -descontoAviso : 0},
  ].filter(i=>i.v!==0);

  const totalTRCT = itensTRCT.reduce((a,i)=>a+i.v, 0);



  // ── Monta itens FGTS (conta vinculada CEF) ───────────
  const itensFGTS = [
    {n:'FGTS — Saldo estimado (8% × salário × meses)', v: fgtsBase},
    {n:`Multa FGTS ${tipo==='semjusta'?'(40%)':tipo==='acordo'?'(20%)':''}`, v: multaFGTS, obs: true},
  ].filter(i=>i.v>0);
  // Nota: multa FGTS aparece no TRCT como verba e aqui como referência
  // A multa é calculada sobre o saldo FGTS mas PAGA pelo empregador via TRCT

  // ── Renderiza ─────────────────────────────────────────
  const grid = document.getElementById('t-grid');
  grid.innerHTML = itensTRCT.map(i=>{
    const cor = i.v < 0 ? 'color:var(--err)' : '';
    return `<div class="ri"><div class="ri-lbl">${i.n}</div><div class="ri-val" style="${cor}">${fmtBRL(i.v)}</div></div>`;
  }).join('')
  + `<div class="ri span2" style="background:var(--b100);border-color:var(--b200);">
       <div class="ri-lbl">TOTAL LÍQUIDO — TERMO DE RESCISÃO (estimado)</div>
       <div class="ri-val">${fmtBRL(totalTRCT)}</div>
     </div>`;

  // FGTS section
  const fgtsGrid = document.getElementById('t-fgts-grid');
  fgtsGrid.innerHTML = `<div class="ri"><div class="ri-lbl">FGTS — Saldo acumulado estimado</div><div class="ri-val">${fmtBRL(fgtsBase)}</div></div>`
    + (multaFGTS > 0 ? `<div class="ri"><div class="ri-lbl">Multa FGTS ${tipo==='semjusta'?'(40%)':'(20%)'} — paga pelo empregador</div><div class="ri-val">${fmtBRL(multaFGTS)}</div></div>` : '')
    + `<div class="ri span2" style="background:var(--b100);border-color:var(--b200);">
         <div class="ri-lbl">TOTAL FGTS A SACAR (estimado)</div>
         <div class="ri-val">${fmtBRL(fgtsBase + multaFGTS)}</div>
       </div>
`;

  // ── Cálculo de INSS e IRRF sobre verbas tributáveis ─────────────
  // Regras de incidência (CLT + RIR/1999 + Instrução Normativa RFB):
  // INSS: incide sobre SALDO DE SALÁRIO + AVISO PRÉVIO INDENIZADO + 13º PROP.
  //       Não incide sobre: férias (já tem regime próprio), multa FGTS.
  // IRRF: incide sobre SALDO + AVISO INDENIZADO + FÉRIAS (venc+prop+1/3) + 13º PROP.
  //       Não incide: multa FGTS, rescisão por acordo parcialmente.

  const dep = parseInt(document.getElementById('t-dep').value) || 0;

  // Base INSS = saldo de salário + 13º proporcional + aviso indenizado
  const baseINSS_rescis = saldoSal + decTerc + avisoIndenizado;

  // Calcula INSS progressivo sobre a base rescisória
  let inssRescis = 0, baseRestINSS = baseINSS_rescis, antINSS = 0;
  for (const [lim, aliq] of INSS_FAIXAS) {
    if (baseRestINSS <= 0) break;
    const fatia = Math.min(baseRestINSS, lim - antINSS);
    inssRescis += fatia * (aliq / 100);
    antINSS = lim;
    baseRestINSS -= fatia;
  }
  inssRescis = Math.min(inssRescis, baseINSS_rescis * 0.14);

  // Base IRRF = saldo + aviso indenizado + férias (venc+prop) + 13º − INSS − dependentes
  // Férias: tributadas pela tabela IRRF (art. 43, Lei 4.506/64)
  const baseIRRF_rescis = Math.max(0,
    saldoSal + avisoIndenizado + ferVencVal + ferPropVal + decTerc
    - inssRescis
    - (dep * DEP_IRRF)
  );

  // Calcula IRRF progressivo
  let irrfRescis = 0, aliqIRRF = 'Isento';
  for (const [lim, aliq, dedu] of IRRF_FAIXAS) {
    if (baseIRRF_rescis <= lim) {
      irrfRescis = Math.max(0, baseIRRF_rescis * (aliq / 100) - dedu);
      aliqIRRF = aliq === 0 ? 'Isento' : aliq + '%';
      break;
    }
  }
  // Redutor Lei 15.270/2025 (base: saldo + aviso + 13º — sem férias que têm regime distinto)
  const baseRedut = saldoSal + avisoIndenizado + decTerc;
  const redutorRescis = calcRedutorAdicional(baseRedut, irrfRescis);
  irrfRescis = Math.max(0, irrfRescis - redutorRescis);
  if (irrfRescis === 0) aliqIRRF = 'Isento (Lei 15.270/2025)';

  const totalDescontos = inssRescis + irrfRescis;
  const totalLiquidoEmpregado = totalTRCT - totalDescontos;

  // Renderiza seção de descontos
  const descSection = document.getElementById('t-descontos-section');
  const descGrid = document.getElementById('t-descontos-grid');

  if (totalDescontos > 0) {
    const itensDesc = [
      {n: `INSS sobre verbas tributáveis (saldo + 13º + aviso)`, v: -inssRescis},
      {n: `IRRF — alíquota efetiva ${aliqIRRF} (base: ${fmtBRL(baseIRRF_rescis)})`, v: -irrfRescis},
      {n: `TOTAL LÍQUIDO AO EMPREGADO (estimado)`, v: totalLiquidoEmpregado, total: true},
    ].filter(i => i.v !== 0);

    descGrid.innerHTML = itensDesc.map(i => {
      const cor = i.v < 0 ? 'color:var(--err)' : '';
      const bg  = i.total ? 'background:var(--b100);border-color:var(--b200);' : '';
      return `<div class="ri span2" style="${bg}"><div class="ri-lbl">${i.n}</div><div class="ri-val" style="${cor}">${fmtBRL(i.v)}</div></div>`;
    }).join('');

    document.getElementById('t-descontos-nota').innerHTML =
      `⚠️ <strong>Nota:</strong> O INSS incide sobre saldo de salário, 13º proporcional e aviso prévio indenizado. ` +
      `O IRRF incide sobre saldo, aviso indenizado, férias (vencidas e proporcionais + 1/3) e 13º proporcional, descontado o INSS e a dedução por dependentes (R$ ${DEP_IRRF.toFixed(2).replace('.',',')} × ${dep}). ` +
      `Multa do FGTS e indenizações não sofrem incidência. Valores estimados — confirme com o departamento de RH ou contador responsável.`;

    descSection.style.display = 'block';
  } else {
    descSection.style.display = 'none';
  }

  showAdAfterResult('ad-trabalhista-after-result');
  showAdAfterResult('ad-trabalhista-result');trackCalcUsage('trabalhista','cc-trabalhista');
  document.getElementById('t-res').style.display='block';
  document.getElementById('t-res').scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ─── SALÁRIO INTERMITENTE (CLT art. 443 §3º / 452-A) ─────────────
// Fórmula validada pelo STF (ADIs 5826/5829/6154, dez/2024): a cada período de
// prestação de serviço, o empregado recebe de imediato: I) remuneração; II) férias
// proporcionais + 1/3; III) 13º proporcional; IV) DSR; V) adicionais legais.
function irrfCalc(base){
  // Aplica a tabela progressiva de IRRF (mesma tabela usada em calcSalario) a uma base já líquida de INSS/dependentes
  for(const[lim,aliq,dedu] of IRRF_FAIXAS){
    if(base<=lim) return Math.max(0, base*(aliq/100)-dedu);
  }
  return 0;
}
function inssCalc(base){
  let inss=0, ant=0, b=base;
  for(const[lim,aliq] of INSS_FAIXAS){
    if(b<=0) break;
    const fatia=Math.min(b, lim-ant);
    inss += fatia*(aliq/100);
    ant = lim; b -= fatia;
  }
  return inss;
}
function calcIntermitente(){
  const rb = document.getElementById('int-res');
  try{
    const valorHora = parseFloat(document.getElementById('int-hora').value.replace(',','.'))||0;
    const horas = parseFloat(document.getElementById('int-horas').value.replace(',','.'))||0;
    const dep = parseInt(document.getElementById('int-dep').value)||0;
    const outros = parseFloat((document.getElementById('int-outros').value||'0').replace(',','.'))||0;
    const ini = pd(document.getElementById('int-ini').value);
    const fim = pd(document.getElementById('int-fim').value);
    if(valorHora<=0 || horas<=0) throw new Error('Informe o salário-hora e as horas trabalhadas.');
    if(!ini || !fim || fim<ini) throw new Error('Informe um período de apuração válido (data início ≤ data fim).');

    // Conta domingos, feriados nacionais e dias úteis no período de apuração
    const anos = new Set([ini.getUTCFullYear(), fim.getUTCFullYear()]);
    let feriados = [];
    anos.forEach(a => { feriados = feriados.concat(getFeriadosNacionais(a)); });
    const feriadosTime = new Set(feriados.map(f=>f.getTime()));
    let diasTotais=0, domingos=0, diasFeriados=0;
    for(let cur=new Date(ini.getTime()); cur<=fim; cur=new Date(cur.getTime()+864e5)){
      diasTotais++;
      const wd = cur.getUTCDay();
      if(wd===0) domingos++;
      else if(feriadosTime.has(cur.getTime())) diasFeriados++;
    }
    const diasRepouso = domingos + diasFeriados;
    const diasUteis = Math.max(1, diasTotais - diasRepouso);

    // 1) Remuneração pelas horas trabalhadas
    const remuneracao = valorHora * horas;

    // 2) DSR sobre remuneração variável (Lei 605/49, art. 7º, por analogia)
    const dsr = (remuneracao / diasUteis) * diasRepouso;

    const baseMes = remuneracao + dsr; // base "salarial" do período (sem 13º)

    // 3) Férias proporcionais + 1/3 (1/12 avos por período, pagamento imediato — CLT art. 452-A §6º)
    const ferias = baseMes / 12;
    const tercoFerias = ferias / 3;

    // 4) 13º proporcional (1/12 avos, tributação exclusiva na fonte)
    const decimoTerceiro = baseMes / 12;

    // 5) FGTS 8% sobre todas as verbas de natureza salarial do período
    const baseFGTS = baseMes + ferias + tercoFerias + decimoTerceiro;
    const fgts = baseFGTS * 0.08;

    // 6) INSS e IRRF — verbas mensais (remuneração+DSR+férias+1/3) tributadas juntas;
    //    13º tem tabela própria e tributação exclusiva na fonte (não se soma à base mensal)
    const baseMensalTrib = baseMes + ferias + tercoFerias;
    const inssMensal = inssCalc(baseMensalTrib);
    const baseIRRFMensal = Math.max(0, baseMensalTrib - inssMensal - dep*DEP_IRRF);
    const irrfMensal = irrfCalc(baseIRRFMensal);

    const inss13 = inssCalc(decimoTerceiro);
    const baseIRRF13 = Math.max(0, decimoTerceiro - inss13 - dep*DEP_IRRF);
    const irrf13 = irrfCalc(baseIRRF13);

    const totalBruto = baseMensalTrib + decimoTerceiro;
    const totalDescontos = inssMensal + irrfMensal + inss13 + irrf13 + outros;
    const liquido = totalBruto - totalDescontos;

    document.getElementById('ir-periodo').textContent = `${fd(ini)} a ${fd(fim)} (${diasTotais} dias corridos · ${diasUteis} dias úteis · ${diasRepouso} domingos/feriados)`;
    document.getElementById('ir-rem').textContent = fmtBRL(remuneracao);
    document.getElementById('ir-dsr').textContent = fmtBRL(dsr);
    document.getElementById('ir-ferias').textContent = fmtBRL(ferias);
    document.getElementById('ir-terco').textContent = fmtBRL(tercoFerias);
    document.getElementById('ir-13').textContent = fmtBRL(decimoTerceiro);
    document.getElementById('ir-fgts').textContent = fmtBRL(fgts);
    document.getElementById('ir-inss').textContent = fmtBRL(inssMensal+inss13);
    document.getElementById('ir-irrf').textContent = fmtBRL(irrfMensal+irrf13);
    document.getElementById('ir-bruto').textContent = fmtBRL(totalBruto);
    document.getElementById('ir-liquido').textContent = fmtBRL(liquido);
    document.getElementById('ir-nota').innerHTML =
      `FGTS (${fmtBRL(fgts)}) é depositado pelo empregador na conta vinculada — não é descontado do trabalhador. ` +
      `13º proporcional tem INSS (${fmtBRL(inss13)}) e IRRF (${fmtBRL(irrf13)}) próprios, com tributação exclusiva na fonte. ` +
      `Dependentes considerados: ${dep} (dedução de ${fmtBRL(DEP_IRRF)} cada).`;

    rb.style.display='block';
    showAdAfterResult('ad-intermitente-result');trackCalcUsage('intermitente','cc-intermitente');
    rb.scrollIntoView({behavior:'smooth', block:'nearest'});
  }catch(err){
    rb.style.display='block';
    document.getElementById('ir-periodo').textContent='';
    document.getElementById('ir-nota').innerHTML = `<span style="color:var(--err);font-weight:600;">${err.message}</span>`;
    ['ir-rem','ir-dsr','ir-ferias','ir-terco','ir-13','ir-fgts','ir-inss','ir-irrf','ir-bruto','ir-liquido'].forEach(id=>{document.getElementById(id).textContent='—';});
  }
}

// ─── HORAS EXTRAS ────────────────────────────────────
function calcHorasExtras(){
  const rb = document.getElementById('he-res'); rb.classList.remove('show','err');
  try{
    const sal      = parseFloat(document.getElementById('he-sal').value);
    const divisor  = parseFloat(document.getElementById('he-div').value) || 220;
    const horasDU  = parseFloat(document.getElementById('he-horas-du').value) || 0;
    const pctDU    = parseFloat(document.getElementById('he-pct-du').value);
    const horasDSF = parseFloat(document.getElementById('he-horas-dsf').value) || 0;
    const pctDSF   = parseFloat(document.getElementById('he-pct-dsf').value);
    const habitual = document.getElementById('he-habitual').checked;
    const diasUteis   = parseFloat(document.getElementById('he-dias-uteis').value) || 0;
    const diasRepouso = parseFloat(document.getElementById('he-dias-repouso').value) || 0;

    if(isNaN(sal) || sal<=0) throw new Error('Informe o salário base.');
    if(horasDU<=0 && horasDSF<=0) throw new Error('Informe ao menos uma quantidade de horas extras.');

    const pDU  = isNaN(pctDU)  ? 50  : pctDU;
    const pDSF = isNaN(pctDSF) ? 100 : pctDSF;

    const valorHoraNormal = sal / divisor;
    const valorHoraDU  = valorHoraNormal * (1 + pDU/100);
    const valorHoraDSF = valorHoraNormal * (1 + pDSF/100);
    const totalDU  = valorHoraDU  * horasDU;
    const totalDSF = valorHoraDSF * horasDSF;
    const totalHE  = totalDU + totalDSF;

    let dsr = 0;
    if(habitual && diasUteis>0 && diasRepouso>0){
      dsr = (totalHE / diasUteis) * diasRepouso;
    }
    const totalGeral = totalHE + dsr;

    const v = fmtBRL(totalGeral);
    let d = `Hora normal: ${fmtBRL(valorHoraNormal)} · `;
    const partes = [];
    if(horasDU>0)  partes.push(`${fmtN(horasDU)}h em dia útil a ${fmtBRL(valorHoraDU)} (+${fmtN(pDU)}%) = ${fmtBRL(totalDU)}`);
    if(horasDSF>0) partes.push(`${fmtN(horasDSF)}h em domingo/feriado a ${fmtBRL(valorHoraDSF)} (+${fmtN(pDSF)}%) = ${fmtBRL(totalDSF)}`);
    d += partes.join(' · ');
    if(dsr>0) d += ` · Reflexo no DSR: ${fmtBRL(dsr)}`;
    else if(habitual) d += ' · Preencha dias úteis e dias de repouso do mês para calcular o reflexo no DSR.';

    document.getElementById('he-res-val').textContent = v;
    document.getElementById('he-res-det').textContent = d;
    rb.classList.add('show');
    showAdAfterResult('ad-horas-extras-result');
    trackCalcUsage('horas-extras','cc-horas-extras');
  }catch(e){
    document.getElementById('he-res-val').textContent = 'Erro: ' + e.message;
    rb.classList.add('show','err');
  }
}

// ─── SEGURO-DESEMPREGO (tabela 2026 — Decreto 12.797/2025 / Lei 7.998/1990) ──
function calcSeguroDesemprego(){
  const sal1 = parseVal(document.getElementById('sd-sal1').value);
  const sal2 = parseVal(document.getElementById('sd-sal2').value);
  const sal3 = parseVal(document.getElementById('sd-sal3').value);
  const meses = parseFloat(document.getElementById('sd-meses').value) || 0;
  const solicitacao = parseInt(document.getElementById('sd-solicitacao').value);
  const semJustaCausa = document.getElementById('sd-justa-causa').value === 'sim';

  if(!semJustaCausa){ alert('Dispensa sem justa causa é requisito para o benefício (Lei 7.998/1990).'); return; }
  if(isNaN(sal1) || isNaN(sal2) || isNaN(sal3)){ alert('Informe os 3 últimos salários.'); return; }
  if(meses<=0){ alert('Informe os meses trabalhados no período de referência.'); return; }

  const media = (sal1 + sal2 + sal3) / 3;
  const PISO = 1621.00, TETO = 2518.65, LIM1 = 2222.17, LIM2 = 3703.99, BASE2 = 1777.74;
  let parcela;
  if (media <= LIM1) parcela = media * 0.8;
  else if (media <= LIM2) parcela = BASE2 + (media - LIM1) * 0.5;
  else parcela = TETO;
  if (parcela < PISO) parcela = PISO;
  if (parcela > TETO) parcela = TETO;

  const minMeses = solicitacao === 1 ? 12 : solicitacao === 2 ? 9 : 6;
  if (meses < minMeses){ alert(`Com ${meses} meses trabalhados, o tempo mínimo exigido para a ${solicitacao}ª solicitação é de ${minMeses} meses — não há direito ao benefício neste caso.`); return; }

  const parcelas = meses >= 24 ? 5 : meses >= 12 ? 4 : 3;
  const total = parcela * parcelas;
  const faixaLabel = media <= LIM1 ? '80% da média salarial' : media <= LIM2 ? 'faixa intermediária (R$1.777,74 + 50% do excedente)' : 'teto (média acima de R$3.703,99)';

  const linhas = [
    {n:'Média salarial (últimos 3 meses)', v: fmtBRL(media)},
    {n:`Faixa aplicada`, v: faixaLabel},
    {n:'Valor de cada parcela', v: fmtBRL(parcela)},
    {n:`Número de parcelas (${solicitacao}ª solicitação, ${meses} meses trabalhados)`, v: parcelas + (parcelas===1?' parcela':' parcelas')},
  ];
  document.getElementById('sd-grid').innerHTML = linhas.map(l =>
    `<div class="ri"><div class="ri-lbl">${l.n}</div><div class="ri-val">${l.v}</div></div>`
  ).join('') + `<div class="ri span2" style="background:var(--b100);border-color:var(--b200);">
       <div class="ri-lbl">TOTAL ESTIMADO A RECEBER</div>
       <div class="ri-val">${fmtBRL(total)}</div>
     </div>`;

  document.getElementById('sd-res').style.display = 'block';
  showAdAfterResult('ad-seguro-desemprego-result');
  trackCalcUsage('seguro-desemprego','cc-seguro-desemprego');
  document.getElementById('sd-res').scrollIntoView({behavior:'smooth', block:'nearest'});
}

// ─── RESCISÃO EMPREGADA DOMÉSTICA (LC 150/2015) ──────
function calcRescisaoDomestica(){
  const sal    = parseVal(document.getElementById('d-sal').value);
  const admStr = document.getElementById('d-adm').value;
  const demStr = document.getElementById('d-dem').value;
  const tipo   = document.getElementById('d-tipo').value;
  const ferVenc= parseInt(document.getElementById('d-fer-venc').value) || 0;

  if(isNaN(sal) || sal<=0 || !admStr || !demStr){ alert('Preencha salário, admissão e demissão.'); return; }

  const adm = new Date(admStr+'T12:00:00');
  const dem = new Date(demStr+'T12:00:00');
  if(dem < adm){ alert('A data de demissão não pode ser anterior à admissão.'); return; }

  const mesesTotal        = (dem.getFullYear()-adm.getFullYear())*12 + (dem.getMonth()-adm.getMonth());
  const anos               = Math.floor(mesesTotal/12);
  const mesesPeriodoAtual  = mesesTotal % 12;
  const diasUltimoMes      = dem.getDate();
  const mesesTrabalhados   = mesesTotal + (diasUltimoMes >= 15 ? 1 : 0);

  const diasAviso = Math.min(90, 30 + anos*3);
  let avisoVal = 0, descontoAviso = 0;
  if(tipo === 'semjusta'){ avisoVal = sal * (diasAviso/30); }
  else if(tipo === 'pedido'){ descontoAviso = sal; }

  const saldoSal = sal / 30 * diasUltimoMes;
  const ferVencVal = ferVenc > 0 ? sal * ferVenc * (4/3) : 0;
  const avosAquis   = mesesPeriodoAtual + (diasUltimoMes >= 15 ? 1 : 0);
  const avosFerProp = Math.min(11, avosAquis);
  const ferPropVal  = (tipo !== 'comjusta' && avosFerProp > 0) ? (sal / 12 * avosFerProp) * (4/3) : 0;

  const mesInicio13 = (adm.getFullYear() === dem.getFullYear()) ? adm.getMonth() : 0;
  const avos13 = Math.min(12, Math.max(0, (dem.getMonth() - mesInicio13) + (diasUltimoMes >= 15 ? 1 : 0)));
  const decTerc = (tipo !== 'comjusta' && avos13 > 0) ? sal / 12 * avos13 : 0;

  const reservaAcumulada = sal * 0.032 * Math.max(1, mesesTrabalhados);
  const indenizacaoFgts = (tipo === 'semjusta') ? reservaAcumulada : 0;

  const total = saldoSal + ferVencVal + ferPropVal + decTerc + avisoVal + indenizacaoFgts - descontoAviso;

  const linhas = [
    {n:`Saldo de Salário (${diasUltimoMes} dias)`, v: saldoSal},
  ];
  if(ferVencVal>0) linhas.push({n:`Férias Vencidas + 1/3 (${ferVenc} período${ferVenc!==1?'s':''})`, v: ferVencVal});
  linhas.push({n:`Férias Proporcionais + 1/3 (${avosFerProp}/12 avos)`, v: ferPropVal});
  linhas.push({n:`13º Proporcional (${avos13}/12 avos)`, v: decTerc});
  if(avisoVal>0) linhas.push({n:`Aviso Prévio Indenizado (${diasAviso} dias)`, v: avisoVal});
  if(descontoAviso>0) linhas.push({n:'(-) Desconto aviso prévio não cumprido', v: -descontoAviso});
  if(indenizacaoFgts>0) linhas.push({n:'Indenização FGTS 3,2% (acumulado, estimativa)', v: indenizacaoFgts});

  const grid = document.getElementById('d-grid');
  grid.innerHTML = linhas.filter(l=>l.v!==0).map(l => {
    const cor = l.v<0 ? 'color:var(--err)' : '';
    return `<div class="ri"><div class="ri-lbl">${l.n}</div><div class="ri-val" style="${cor}">${fmtBRL(l.v)}</div></div>`;
  }).join('') + `<div class="ri span2" style="background:var(--b100);border-color:var(--b200);">
       <div class="ri-lbl">TOTAL ESTIMADO</div>
       <div class="ri-val">${fmtBRL(total)}</div>
     </div>`;

  if(tipo!=='semjusta' && indenizacaoFgts===0){
    grid.innerHTML += `<div class="ri span2" style="font-size:.75rem;color:var(--txt-s);background:none;border:none;box-shadow:none;padding-top:0;">ℹ️ Sem indenização FGTS de 3,2% neste tipo de rescisão — o saldo acumulado retorna ao empregador.</div>`;
  }

  document.getElementById('d-res').style.display = 'block';
  showAdAfterResult('ad-rescisao-domestica-result');
  trackCalcUsage('rescisao-domestica','cc-rescisao-domestica');
  document.getElementById('d-res').scrollIntoView({behavior:'smooth', block:'nearest'});
}


// ─── PRESCRIÇÃO (trabalhista / cível / tributária) ─────────────
// Regras gerais — sempre informativas; suspensão/interrupção depende do caso concreto.
const PRESC_TIPOS = {
  trabalhista: [
    {id:'bienal', label:'Prescrição bienal (2 anos) — reclamação trabalhista', anos:2,
     dataLabel:'Data do término do contrato de trabalho',
     obs:'Art. 7º, XXIX da CF/88 c/c art. 11 da CLT: o prazo para ajuizar reclamação trabalhista é de 2 anos após a extinção do contrato de trabalho. Dentro da ação, só podem ser cobrados créditos dos últimos 5 anos anteriores ao ajuizamento (prescrição quinquenal). Para menores de 18 anos, o prazo não corre (art. 440 CLT).'},
    {id:'fgts', label:'FGTS não depositado (5 anos) — Tema 608 STF', anos:5,
     dataLabel:'Data da competência do depósito não realizado',
     obs:'Desde a fixação do Tema 608 pelo STF, a prescrição para reclamar diferenças de FGTS é quinquenal (5 anos), contados da lesão ao direito (mês da competência não recolhida), respeitado o prazo bienal após o fim do contrato.'},
  ],
  civil: [
    {id:'geral', label:'Prazo geral (10 anos) — art. 205 CC', anos:10,
     dataLabel:'Data em que o direito poderia ser exercido',
     obs:'Regra geral do Código Civil: na ausência de prazo específico previsto em lei, aplica-se o prazo de 10 anos (art. 205, CC).'},
    {id:'reparacao', label:'Reparação civil / indenização (3 anos) — art. 206 §3º V CC', anos:3,
     dataLabel:'Data do dano ou do ato ilícito',
     obs:'Pretensão de reparação civil (indenização por dano material ou moral) prescreve em 3 anos, contados da data do ato ilícito ou, em certos casos, da ciência inequívoca do dano (art. 206, §3º, V, CC).'},
    {id:'titulos', label:'Dívida líquida em instrumento (5 anos) — art. 206 §5º I CC', anos:5,
     dataLabel:'Data de vencimento do título/instrumento',
     obs:'Pretensão de cobrança de dívidas líquidas constantes de instrumento público ou particular prescreve em 5 anos (art. 206, §5º, I, CC).'},
    {id:'alugueis', label:'Cobrança de aluguéis (3 anos) — art. 206 §3º I CC', anos:3,
     dataLabel:'Data de vencimento do aluguel',
     obs:'Pretensão do locador para cobrança de aluguéis (pagamentos periódicos) prescreve em 3 anos (art. 206, §3º, I, CC).'},
  ],
  tributario: [
    {id:'cobranca', label:'Cobrança de crédito tributário (5 anos) — art. 174 CTN', anos:5,
     dataLabel:'Data da constituição definitiva do crédito',
     obs:'A ação de cobrança do crédito tributário já constituído (após o lançamento definitivo) prescreve em 5 anos, contados da constituição definitiva (art. 174, CTN).'},
    {id:'decadencia', label:'Decadência para lançamento (5 anos) — art. 150 §4º / 173 CTN', anos:5,
     dataLabel:'Data do fato gerador',
     obs:'O Fisco tem 5 anos para constituir (lançar) o crédito tributário, contados, em regra, do fato gerador (art. 150, §4º, CTN, tributos sujeitos a lançamento por homologação) ou do primeiro dia do exercício seguinte (art. 173, I, CTN, nos demais casos). Trata-se tecnicamente de decadência, não de prescrição.'},
  ],
};
function prescAreaChange(){
  const area = document.getElementById('presc-area').value;
  const sel = document.getElementById('presc-tipo');
  sel.innerHTML = PRESC_TIPOS[area].map(t=>`<option value="${t.id}">${t.label}</option>`).join('');
  updatePrescDataLabel();
}
function updatePrescDataLabel(){
  const area = document.getElementById('presc-area').value;
  const tipoId = document.getElementById('presc-tipo').value;
  const t = PRESC_TIPOS[area].find(x=>x.id===tipoId) || PRESC_TIPOS[area][0];
  document.getElementById('presc-data-lbl').textContent = t ? t.dataLabel : 'Data do fato gerador';
}
function calcPrescricao(){
  const rb = document.getElementById('presc-res');
  try{
    const area = document.getElementById('presc-area').value;
    const tipoId = document.getElementById('presc-tipo').value;
    const t = PRESC_TIPOS[area].find(x=>x.id===tipoId);
    if(!t) throw new Error('Selecione o tipo de prazo.');
    const dataStr = document.getElementById('presc-data').value;
    const data = pd(dataStr);
    if(!data) throw new Error('Informe a data de referência.');
    const limite = new Date(Date.UTC(data.getUTCFullYear()+t.anos, data.getUTCMonth(), data.getUTCDate()));
    const hoje = new Date(); const hojeUTC = new Date(Date.UTC(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()));
    const diasRestantes = Math.round((limite.getTime()-hojeUTC.getTime())/864e5);

    document.getElementById('presc-r-prazo').textContent = `${t.label} (${t.anos} ${t.anos===1?'ano':'anos'})`;
    document.getElementById('presc-r-limite').textContent = fd(limite);
    if(diasRestantes < 0){
      document.getElementById('presc-r-status').innerHTML = `<span style="color:var(--err);">Prazo esgotado</span>`;
      document.getElementById('presc-r-status').style.color = 'var(--err)';
    } else {
      document.getElementById('presc-r-status').textContent = `Em curso — faltam ${diasRestantes} dias`;
      document.getElementById('presc-r-status').style.color = 'var(--ok)';
    }
    document.getElementById('presc-r-obs').innerHTML =
      t.obs + ' <strong>Este resultado é uma estimativa geral</strong> — causas de suspensão ou interrupção da prescrição (ex.: ajuizamento de ação, protesto, reconhecimento da dívida, menoridade) podem alterar o prazo-limite real. Consulte um advogado para o seu caso específico.';

    rb.style.display='block';
    showAdAfterResult('ad-prescricao-result');trackCalcUsage('prescricao','cc-prescricao');
    rb.scrollIntoView({behavior:'smooth', block:'nearest'});
  }catch(err){
    rb.style.display='block';
    document.getElementById('presc-r-prazo').textContent='—';
    document.getElementById('presc-r-limite').textContent='—';
    document.getElementById('presc-r-status').textContent='';
    document.getElementById('presc-r-obs').innerHTML = `<span style="color:var(--err);font-weight:600;">${err.message}</span>`;
  }
}

// ─── DATAS ─────────────────────────────────────────
let dM='diff';
function dMode(btn){dM=btn.dataset.dm;document.querySelectorAll('#d-mode-pills .pill').forEach(b=>b.classList.remove('on'));btn.classList.add('on');['diff','add','sub','diaSem'].forEach(m=>document.getElementById('d-'+m).style.display=m===dM?'':'none');}
function calcDatas(){
  const rb=document.getElementById('d-res');rb.classList.remove('show','err');
  try{
    let v='',d='';
    if(dM==='diff'){const a=pd(document.getElementById('d-a1').value),b=pd(document.getElementById('d-b1').value);if(!a||!b)throw new Error('Preencha as datas.');const dias=Math.round(Math.abs(b.getTime()-a.getTime())/864e5);v=`${dias} dias`;d=`De ${fd(a)} (${cap(dsem(a))}) a ${fd(b)} (${cap(dsem(b))}). ${Math.floor(dias/365)} anos, ${Math.floor((dias%365)/30)} meses e ${dias%30} dias aprox.`;}
    else if(dM==='add'){const a=pd(document.getElementById('d-a2').value);const n=parseInt(document.getElementById('d-b2').value)||0;if(!a)throw new Error('Preencha a data.');const r=new Date(a.getTime()+n*864e5);v=fd(r);d=`${cap(dsem(r))} · ${n} dias somados a ${fd(a)}`;}
    else if(dM==='sub'){const a=pd(document.getElementById('d-a3').value);const n=parseInt(document.getElementById('d-b3').value)||0;if(!a)throw new Error('Preencha a data.');const r=new Date(a.getTime()-n*864e5);v=fd(r);d=`${cap(dsem(r))} · ${n} dias subtraídos de ${fd(a)}`;}
    else{const a=pd(document.getElementById('d-a4').value);if(!a)throw new Error('Preencha a data.');v=cap(dsem(a));d=`${fd(a)}`;}
    document.getElementById('d-res-val').textContent=v;document.getElementById('d-res-det').textContent=d;rb.classList.add('show');showAdAfterResult('ad-datas-result');trackCalcUsage('datas','cc-datas');
  }catch(e){document.getElementById('d-res-val').textContent='Erro: '+e.message;rb.classList.add('show','err');}
}

// ─── VALIDADORES ───────────────────────────────────
function cleanN(s){return s.replace(/\D/g,'');}
function validCPF(){
  const inp=document.getElementById('cpf-in');
  const n=cleanN(inp.value);
  const vr=document.getElementById('cpf-vr');
  if(n.length<11){inp.className='';vr.classList.remove('show');return;}
  const res=_validCPF(n);
  inp.className=res.ok?'ok':'fail';
  document.getElementById('cpf-vr-t').textContent=res.ok?'✅ CPF Válido':'❌ CPF Inválido';
  document.getElementById('cpf-vr-fmt').textContent=res.fmt||'—';
  document.getElementById('cpf-vr-dv').textContent=res.dv||'—';
  document.getElementById('cpf-vr-msg').textContent=res.msg;
  vr.className='vr show '+(res.ok?'ok':'fail');
  if(n.length===11) trackCalcUsage('valid','cc-valid');
}
function _validCPF(n){
  if(n.length!==11)return{ok:false,msg:'CPF deve ter 11 dígitos.'};
  if(/^(\d)\1{10}$/.test(n))return{ok:false,msg:'Todos os dígitos são iguais.'};
  let s=0;for(let i=0;i<9;i++)s+=parseInt(n[i])*(10-i);let d1=11-(s%11);if(d1>=10)d1=0;
  s=0;for(let i=0;i<10;i++)s+=parseInt(n[i])*(11-i);let d2=11-(s%11);if(d2>=10)d2=0;
  const ok=d1===parseInt(n[9])&&d2===parseInt(n[10]);
  return{ok,fmt:n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'),dv:`${n[9]}${n[10]}`,msg:ok?'Estrutura matemática válida.':'Dígito verificador inválido.'};
}
function validCNPJ(){
  const inp=document.getElementById('cnpj-in');
  const n=cleanN(inp.value);
  const vr=document.getElementById('cnpj-vr');
  if(n.length<14){inp.className='';vr.classList.remove('show');return;}
  const res=_validCNPJ(n);
  inp.className=res.ok?'ok':'fail';
  document.getElementById('cnpj-vr-t').textContent=res.ok?'✅ CNPJ Válido':'❌ CNPJ Inválido';
  document.getElementById('cnpj-vr-fmt').textContent=res.fmt||'—';
  document.getElementById('cnpj-vr-dv').textContent=res.dv||'—';
  document.getElementById('cnpj-vr-msg').textContent=res.msg;
  vr.className='vr show '+(res.ok?'ok':'fail');
  if(n.length===14) trackCalcUsage('valid','cc-valid');
}
function _validCNPJ(n){
  if(n.length!==14)return{ok:false,msg:'CNPJ deve ter 14 dígitos.'};
  if(/^(\d)\1{13}$/.test(n))return{ok:false,msg:'Todos os dígitos são iguais.'};
  const cd=(num,len)=>{let s=0,p=len-7;for(let i=len;i>=1;i--){s+=parseInt(num[len-i])*p--;if(p<2)p=9;}const r=s%11;return r<2?0:11-r;};
  const d1=cd(n,12),d2=cd(n,13);const ok=d1===parseInt(n[12])&&d2===parseInt(n[13]);
  return{ok,fmt:n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'),dv:`${n[12]}${n[13]}`,msg:ok?'Estrutura matemática válida.':'Dígito verificador inválido.'};
}
function fmtCPF(){const i=document.getElementById('cpf-in');const n=cleanN(i.value);if(n.length===11)i.value=n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');}
function fmtCNPJ(){const i=document.getElementById('cnpj-in');const n=cleanN(i.value);if(n.length===14)i.value=n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');}
function clearV(inId,vrId){document.getElementById(inId).value='';document.getElementById(inId).className='';document.getElementById(vrId).classList.remove('show');}

function gerarCPF(){
  const d=Array.from({length:9},()=>Math.floor(Math.random()*10));
  const cd=(arr,len)=>{let s=0,p=len+1;for(let i=0;i<len;i++)s+=arr[i]*p--;let r=11-(s%11);return r>=10?0:r;};
  d.push(cd(d,9));d.push(cd(d,10));
  const s=d.join('').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
  const el=document.getElementById('v-gerador-res');el.style.display='block';el.textContent='CPF: '+s;
}
function gerarCNPJ(){
  const d=[...Array.from({length:8},()=>Math.floor(Math.random()*10)),0,0,0,1];
  const cd=(arr,len)=>{let s=0,p=len-7;for(let i=len;i>=1;i--){s+=arr[len-i]*p--;if(p<2)p=9;}const r=s%11;return r<2?0:11-r;};
  d.push(cd(d,12));d.push(cd(d,13));
  const s=d.join('').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
  const el=document.getElementById('v-gerador-res');el.style.display='block';el.textContent='CNPJ: '+s;
}

// ─── QR CODE ───────────────────────────────────────
let qrT='link',qrContent='';
function qrType(btn){qrT=btn.dataset.qt;document.querySelectorAll('.qrtt').forEach(b=>b.classList.remove('on'));btn.classList.add('on');document.querySelectorAll('.qr-f').forEach(f=>f.classList.remove('on'));document.getElementById('qf-'+qrT).classList.add('on');}
function crc16(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?(c<<1)^0x1021:(c<<1);}return c&0xFFFF;}
function buildQRContent(){
  switch(qrT){
    case'link':return document.getElementById('qf-link-v').value.trim()||'';
    case'texto':return document.getElementById('qf-texto-v').value.trim()||'';
    case'email':{const a=document.getElementById('qf-email-v').value.trim();if(!a)return'';const s=document.getElementById('qf-email-s').value.trim();const b=document.getElementById('qf-email-b').value.trim();let r=`mailto:${a}`;const p=[];if(s)p.push(`subject=${encodeURIComponent(s)}`);if(b)p.push(`body=${encodeURIComponent(b)}`);if(p.length)r+='?'+p.join('&');return r;}
    case'tel':{const t=cleanN(document.getElementById('qf-tel-v').value);return t?`tel:+${t}`:'';}
    case'pix':{const k=document.getElementById('qf-pix-k').value.trim();if(!k)return'';const n=(document.getElementById('qf-pix-n').value.trim()||'Favorecido').substring(0,25).toUpperCase();const v=parseFloat(document.getElementById('qf-pix-v').value)||0;const c=(document.getElementById('qf-pix-c').value.trim()||'CIDADE').substring(0,15).toUpperCase();const kf=`0014BR.GOV.BCB.PIX01${k.length.toString().padStart(2,'0')}${k}`;const mf=`26${kf.length.toString().padStart(2,'0')}${kf}`;const vf=v>0?`54${v.toFixed(2).length.toString().padStart(2,'0')}${v.toFixed(2)}`:'';let p=`000201${mf}5204000053039865802BR59${n.length.toString().padStart(2,'0')}${n}60${c.length.toString().padStart(2,'0')}${c}${vf}6304`;return p+crc16(p+'6304').toString(16).toUpperCase().padStart(4,'0');}
    case'wifi':{const s=document.getElementById('qf-wifi-s').value.trim();if(!s)return'';const p=document.getElementById('qf-wifi-p').value;const t=document.getElementById('qf-wifi-t').value;return `WIFI:T:${t};S:${s};P:${p};;`;}
    default:return'';
  }
}
function genQR(){
  const content=buildQRContent();if(!content){alert('Preencha os dados.');return;}
  qrContent=content;
  const sz=parseInt(document.getElementById('qr-sz').value);
  const disp=document.getElementById('qr-display');disp.innerHTML='';
  new QRCode(disp,{text:content,width:sz,height:sz,correctLevel:QRCode.CorrectLevel.H});
  showAdAfterResult('ad-qrcode-result');document.getElementById('qr-actions').style.display='flex';
  trackCalcUsage('qrcode','cc-qrcode');
}
function dlQR(){const c=document.querySelector('#qr-display canvas');if(!c)return;const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='calculaprazo-qrcode.png';a.click();}
function cpQR(){if(!qrContent)return;navigator.clipboard.writeText(qrContent).catch(()=>alert('Não foi possível copiar automaticamente.'));}

// ─── SENHAS ────────────────────────────────────────
function buildCS(){
  let cs='';
  if(document.getElementById('pw-up').checked)cs+='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if(document.getElementById('pw-lo').checked)cs+='abcdefghijklmnopqrstuvwxyz';
  if(document.getElementById('pw-nu').checked)cs+='0123456789';
  if(document.getElementById('pw-sy').checked)cs+='!@#$%^&*()-_=+[]{}|;:,.<>?';
  if(document.getElementById('pw-am').checked)cs=cs.replace(/[0OlI1]/g,'');
  return cs||'abcdefghijklmnopqrstuvwxyz';
}
function _genPWCore(){
  const len=parseInt(document.getElementById('pw-len').value);
  const cs=buildCS();
  const arr=new Uint32Array(len);crypto.getRandomValues(arr);
  const pw=Array.from(arr,x=>cs[x%cs.length]).join('');
  document.getElementById('pw-val').textContent=pw;
  let sc=0;if(len>=8)sc++;if(len>=12)sc++;if(len>=16)sc++;if(/[A-Z]/.test(pw))sc++;if(/[a-z]/.test(pw))sc++;if(/[0-9]/.test(pw))sc++;if(/[^A-Za-z0-9]/.test(pw))sc++;
  const cfg=sc<=2?{p:20,c:'#DC2626',l:'Fraca'}:sc<=4?{p:50,c:'#D97706',l:'Moderada'}:sc<=5?{p:75,c:'#2563EB',l:'Forte'}:{p:100,c:'#059669',l:'Muito Forte'};
  document.getElementById('str-f').style.width=cfg.p+'%';document.getElementById('str-f').style.background=cfg.c;
  document.getElementById('str-l').textContent='Força: '+cfg.l;document.getElementById('str-l').style.color=cfg.c;
}
function genPW(){ _genPWCore(); }
function cpPW(){const pw=document.getElementById('pw-val').textContent;if(pw==='Clique em Gerar →')return;navigator.clipboard.writeText(pw).then(()=>{const b=document.getElementById('pw-copy-btn');b.textContent='✅';setTimeout(()=>b.textContent='📋',1400);}).catch(()=>{});}
// Corrigido: _genPWCore() NÃO deve rodar automaticamente ao carregar o script.
// Antes, chamada sem guarda, quebrava com erro fatal em QUALQUER página que não
// tivesse o campo #pw-len (ou seja, todas as páginas exceto /gerador-de-senhas),
// interrompendo a execução de TODO o restante do app.js nessas páginas (o que
// impedia o preenchimento automático de datas, o conversor de moedas, o
// dropdown de ferramentas, o banner de cookies, etc. de funcionar).
if (document.getElementById('pw-len')) { _genPWCore(); }

// ─── NÚMERO POR EXTENSO ────────────────────────────
let extMode='num';
function extSetMode(m,btn){
  extMode=m;
  document.querySelectorAll('#ext-mode .ptab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('ext-lbl').textContent=m==='num'?'Número':'Valor em Reais (R$)';
  // Atualizar placeholder conforme o modo
  const inp=document.getElementById('ext-val');
  inp.placeholder=m==='num'?'Ex: 1234567':'Ex: 1.234,56 ou 1234.56';
  // Recalcular com o novo modo se já houver valor digitado
  const val=inp.value.trim();
  if(val!=='') calcExtenso();
  else document.getElementById('ext-res').classList.remove('show');
}

const UNID=['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const DEZ=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const CENT=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function ext100(n){if(n===0)return'';if(n===100)return'cem';let s='';if(n>=100){s=CENT[Math.floor(n/100)];n%=100;if(n>0)s+=' e ';}if(n>=20){s+=DEZ[Math.floor(n/10)];if(n%10>0)s+=' e '+UNID[n%10];}else if(n>0)s+=UNID[n];return s;}
function numExt(n){
  if(n===0)return'zero';
  let neg=n<0;n=Math.abs(Math.round(n));
  const tri=Math.floor(n/1e12);n%=1e12;
  const bi=Math.floor(n/1e9);n%=1e9;
  const mi=Math.floor(n/1e6);n%=1e6;
  const mi2=Math.floor(n/1000);n%=1000;
  const resto=n;
  let partes=[];
  if(tri>0)partes.push({t:tri===1?'um trilhão':ext100(tri)+' trilhões',grandeza:true,raw:tri});
  if(bi>0) partes.push({t:bi===1?'um bilhão':ext100(bi)+' bilhões',grandeza:true,raw:bi});
  if(mi>0) partes.push({t:mi===1?'um milhão':ext100(mi)+' milhões',grandeza:true,raw:mi});
  if(mi2>0)partes.push({t:mi2===1?'mil':ext100(mi2)+' mil',grandeza:true,raw:mi2,isMil:true});
  if(resto>0)partes.push({t:ext100(resto),grandeza:false,raw:resto});
  let s='';
  for(let i=0;i<partes.length;i++){
    if(i===0){s=partes[i].t;continue;}
    const p=partes[i],ehUltimo=i===partes.length-1;
    const usaE=ehUltimo&&((!p.grandeza&&(p.raw<100||p.raw%100===0))||(p.isMil&&p.raw===1)||(p.grandeza&&!p.isMil&&p.raw<100));
    s+=(usaE?' e ':', ')+p.t;
  }
  if(neg)s='menos '+s;return s;
}
function calcExtenso(){
  // Aceita formato BR (1.234,56) e US (1234.56)
  let raw=document.getElementById('ext-val').value.trim();
  // Detectar formato BR: tem ponto de milhar E vírgula decimal
  if(/^-?[\d.]+,\d{1,2}$/.test(raw.replace(/\s/g,''))) {
    raw = raw.replace(/\./g,'').replace(',','.');  // 1.234,56 → 1234.56
  } else {
    raw = raw.replace(',','.');  // 1234,56 → 1234.56
  }
  const v=parseFloat(raw);
  const res=document.getElementById('ext-res');
  if(raw===''||isNaN(v)){res.classList.remove('show');return;}
  let txt;
  if(extMode==='brl'){
    const neg=v<0,abs=Math.abs(v);
    const reais=Math.floor(abs);
    const cents=Math.round((abs-reais)*100);
    let partes=[];
    if(reais>0){
      const s=numExt(reais);
      // 'de reais' após múltiplos exatos de milhão/bilhão/trilhão
      const ehExato=(reais>=1e6&&reais%1e6===0)||(reais>=1e9&&reais%1e9===0)||(reais>=1e12&&reais%1e12===0);
      partes.push(s+(ehExato?' de reais':reais===1?' real':' reais'));
    }
    if(cents>0) partes.push(numExt(cents)+(cents===1?' centavo':' centavos'));
    if(!partes.length) partes.push('zero reais');
    txt=(neg?'menos ':'')+partes.join(' e ');
    txt=txt.charAt(0).toUpperCase()+txt.slice(1);
  } else {
    txt=numExt(Math.round(v));
    txt=txt.charAt(0).toUpperCase()+txt.slice(1);
  }
  document.getElementById('ext-res-val').textContent=txt;
  res.classList.add('show');
  showAdAfterResult('ad-extenso-result');trackCalcUsage('extenso','cc-extenso');
}
function cpExt(){const t=document.getElementById('ext-res-val').textContent;if(t)navigator.clipboard.writeText(t).catch(()=>{});}

// ─── IMC ───────────────────────────────────────────
function calcIMC(){
  const p=parseFloat(document.getElementById('imc-peso').value)||0;
  const h=parseFloat(document.getElementById('imc-alt').value)||0;
  if(p<=0||h<=0){alert('Preencha peso e altura.');return;}
  const hm=h/100;const imc=p/(hm*hm);
  let cls,cor,msg;
  if(imc<18.5){cls='Abaixo do peso';cor='#3B82F6';msg='Seu IMC indica peso abaixo do ideal. Consulte um nutricionista para orientações sobre alimentação e saúde.';}
  else if(imc<25){cls='Peso normal ✓';cor='var(--ok)';msg='Parabéns! Seu IMC está na faixa considerada saudável pela OMS. Continue mantendo hábitos equilibrados.';}
  else if(imc<30){cls='Sobrepeso';cor='var(--warn)';msg='Seu IMC indica sobrepeso. Pequenas mudanças na alimentação e atividade física podem trazer grandes benefícios.';}
  else if(imc<35){cls='Obesidade Grau I';cor='var(--err)';msg='Obesidade Grau I. Recomenda-se acompanhamento médico e nutricional para avaliação e orientação.';}
  else if(imc<40){cls='Obesidade Grau II';cor='var(--err)';msg='Obesidade Grau II. Procure acompanhamento médico especializado.';}
  else{cls='Obesidade Grau III';cor='var(--err)';msg='Obesidade Grau III (mórbida). Recomenda-se acompanhamento médico urgente.';}
  const idealMin=(18.5*hm*hm),idealMax=(24.9*hm*hm);
  document.getElementById('imc-val').textContent=imc.toFixed(1).replace('.',',');
  document.getElementById('imc-val').style.color=cor;
  document.getElementById('imc-class').textContent=cls;document.getElementById('imc-class').style.color=cor;
  document.getElementById('imc-ideal').textContent=`${fmtN(idealMin)}kg – ${fmtN(idealMax)}kg`;
  // Ponteiro: IMC 15=0%, 40=100%
  const pct=Math.min(100,Math.max(0,(imc-15)/25*100));
  document.getElementById('imc-ptr').style.left=pct+'%';
  const msgEl=document.getElementById('imc-msg');msgEl.textContent=msg;msgEl.style.background=imc<25?'rgba(5,150,105,.07)':'rgba(220,38,38,.06)';msgEl.style.color=cor;msgEl.style.border=`1.5px solid ${imc<25?'rgba(5,150,105,.2)':'rgba(220,38,38,.15)'}`;msgEl.style.borderRadius='var(--r)';
  showAdAfterResult('ad-imc-after-result');
  showAdAfterResult('ad-imc-result');document.getElementById('imc-res').style.display='block';trackCalcUsage('imc','cc-imc');
}

// ─── HERO MINI CALC ───────────────────────────────
let hTipo='uteis';
function hSetTipo(t,btn){hTipo=t;document.querySelectorAll('#h-t-u,#h-t-c').forEach(b=>b.classList.remove('on'));btn.classList.add('on');}

// Feriados nacionais fixos (MM-DD) e móveis via Páscoa
function getFeriadosNacionais(ano){
  // Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a=ano%19,b=Math.floor(ano/100),c=ano%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mes=Math.floor((h+l-7*m+114)/31),dia=(h+l-7*m+114)%31+1;
  const pascoa=new Date(Date.UTC(ano,mes-1,dia));
  const add=(base,dias)=>new Date(base.getTime()+dias*864e5);
  const fer=[
    // Fixos
    new Date(Date.UTC(ano,0,1)),   // 01/01 Ano Novo
    new Date(Date.UTC(ano,3,21)),  // 21/04 Tiradentes
    new Date(Date.UTC(ano,4,1)),   // 01/05 Trabalho
    new Date(Date.UTC(ano,8,7)),   // 07/09 Independência
    new Date(Date.UTC(ano,9,12)),  // 12/10 N.Sra.Aparecida
    new Date(Date.UTC(ano,10,2)),  // 02/11 Finados
    new Date(Date.UTC(ano,10,15)), // 15/11 Proclamação República
    new Date(Date.UTC(ano,10,20)), // 20/11 Dia Nac. de Zumbi e da Consciência Negra (Lei 14.759/2023, a partir de 2024)
    new Date(Date.UTC(ano,11,25)), // 25/12 Natal
    // Móveis (relativos à Páscoa)
    add(pascoa,-48), // Carnaval (2ª)
    add(pascoa,-47), // Carnaval (3ª)
    add(pascoa,-2),  // Sexta-feira Santa
    pascoa,          // Páscoa
    add(pascoa,60),  // Corpus Christi
  ];
  return fer;
}

function calcHero(){
  const ini=pd(document.getElementById('h-ini').value);
  const n=parseInt(document.getElementById('h-dias').value)||0;
  const res=document.getElementById('h-res');
  if(!ini||n<0){res.style.display='none';alert('Preencha a data inicial e o número de dias.');return;}
  let df;
  if(hTipo==='corridos'){
    df=new Date(ini.getTime()+n*864e5);
  } else {
    // Dias úteis: exclui sábados, domingos e feriados nacionais
    let ferCache={};
    const isFerNac=(dt)=>{
      const y=dt.getUTCFullYear();
      if(!ferCache[y])ferCache[y]=getFeriadosNacionais(y);
      return ferCache[y].some(f=>f.getTime()===dt.getTime());
    };
    let c=0,cur=new Date(ini.getTime());
    while(c<n){
      cur=new Date(cur.getTime()+864e5);
      const d=cur.getUTCDay();
      if(d!==0&&d!==6&&!isFerNac(cur))c++;
    }
    // Se o vencimento cair em dia não-útil, avança para o próximo
    while(true){const d=cur.getUTCDay();if(d===0||d===6||isFerNac(cur)){cur=new Date(cur.getTime()+864e5);}else break;}
    df=cur;
  }
  document.getElementById('h-res-val').textContent=fd(df)+'  ('+cap(dsem(df))+')';
  document.getElementById('h-res-det').textContent=n+' dia(s) '+(hTipo==='uteis'?'úteis (feriados nacionais descontados)':'corridos')+' a partir de '+fd(ini);
  res.style.display='block';
}

// NEWSLETTER: a função newsletterSubscribe() e a URL da Edge Function vivem
// só em blog.js — toda página que carrega app.min.js também carrega
// blog.min.js, então duplicar aqui causava "Identifier already declared"
// (SyntaxError que travava o blog.min.js inteiro, inclusive o carregamento
// dos posts na home). Se um dia existir página que carregue só app.min.js
// sem blog.min.js, mova a função de volta pra cá.

// Gera um link com os valores atuais dos campos como query string e copia pra
// área de transferência. `extra` é um objeto opcional pra incluir estado que não
// vive num <input> comum (ex: o índice de correção selecionado por pill/botão).
function shareCalcResult(fieldIds, extra, btnEl) {
  const params = new URLSearchParams();
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value) params.set(id, el.value);
  });
  if (extra) Object.keys(extra).forEach(k => { if (extra[k]) params.set(k, extra[k]); });
  const url = location.origin + location.pathname + (params.toString() ? '?' + params.toString() : '');
  const feedback = (ok) => {
    if (!btnEl) return;
    const original = btnEl.dataset.origLabel || btnEl.textContent;
    btnEl.dataset.origLabel = original;
    btnEl.textContent = ok ? '✓ Link copiado!' : 'Não foi possível copiar';
    setTimeout(() => { btnEl.textContent = original; }, 2200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => feedback(true)).catch(() => feedback(false));
  } else {
    feedback(false);
  }
  return url;
}

// Lê os campos presentes na URL (se houver) e preenche o formulário da
// calculadora correspondente, disparando o cálculo automaticamente.
function loadCalcFromURL(fieldIds, triggerFn, onExtra) {
  const params = new URLSearchParams(location.search);
  let has = false;
  fieldIds.forEach(id => {
    if (params.has(id)) {
      const el = document.getElementById(id);
      if (el) { el.value = params.get(id); has = true; }
    }
  });
  if (onExtra) has = onExtra(params) || has;
  if (has && typeof triggerFn === 'function') {
    // pequeno delay pra garantir que os listeners/estados iniciais da página já rodaram
    setTimeout(triggerFn, 60);
  }
  return has;
}

// Exportar o resultado atual em PDF — usa a caixa de impressão do navegador
// (o CSS @media print, em styles.css, esconde menu/anúncios/rodapé e formata
// só a calculadora + resultado, com o timbre do Calcula Prazo).
function exportarCalcPDF() {
  document.querySelectorAll('.print-date').forEach(el => {
    el.textContent = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  });
  window.print();
}

// ─── CORREÇÃO: init today ─────────────────────────
window.addEventListener('load',()=>{
  const t=new Date();
  const str=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  ['p-ini','h-ini','corr-fim','d-a1','d-a2','d-a3','d-a4'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=str;});
  const y5ago=new Date(t);y5ago.setFullYear(y5ago.getFullYear()-5);
  const str5=`${y5ago.getFullYear()}-${String(y5ago.getMonth()+1).padStart(2,'0')}-${String(y5ago.getDate()).padStart(2,'0')}`;
  const ci=document.getElementById('corr-ini');if(ci&&!ci.value)ci.value=str5;
  if(document.getElementById('moeda-val-in')){ calcMoeda(); fetchRatesLive(); }
});

// ─── RESTAURAR CÁLCULO COMPARTILHADO VIA URL (roda em qualquer página; só age
// se os campos da calculadora daquela página existirem no DOM) ───────────────
window.addEventListener('load', () => {
  loadCalcFromURL(['t-tipo','t-sal','t-adm','t-dem','t-aviso','t-aviso-pedido','t-fer-venc','t-medias','t-dep'], () => window.calcTrabalhista && calcTrabalhista());
  loadCalcFromURL(['sal-bruto','sal-dep','sal-outros'], () => window.calcSalario && calcSalario());
  loadCalcFromURL(['j-cap','j-taxa','j-per','j-aporte','j-multa'], () => window.calcJuros && calcJuros());
  loadCalcFromURL(['corr-val','corr-ini','corr-fim'], () => window.calcCorrecao && calcCorrecao(), (params) => {
    if (params.has('corr-idx')) {
      const idx = params.get('corr-idx');
      const btn = document.querySelector(`.idx-pill[data-idx="${idx}"]`);
      if (btn) { setCorrIdx(idx, btn); return true; }
    }
    return false;
  });
  loadCalcFromURL(['int-hora','int-horas','int-ini','int-fim','int-dep','int-outros'], () => window.calcIntermitente && calcIntermitente());
  loadCalcFromURL(['presc-tipo','presc-area','presc-data'], () => window.calcPrescricao && calcPrescricao());
  loadCalcFromURL(['p-ini','p-dias','p-fim','p-fer'], () => { const b = document.getElementById('p-btn-calc'); if (b) b.click(); });
  loadCalcFromURL(['pct-a1','pct-a2','pct-a3','pct-a4','pct-a5','pct-b1','pct-b2','pct-b3','pct-b4','pct-b5'], () => window.calcPct && calcPct());
  loadCalcFromURL(['d-a1','d-a2','d-a3','d-a4','d-b1','d-b2','d-b3'], () => window.calcDatas && calcDatas());
  loadCalcFromURL(['imc-peso','imc-alt'], () => window.calcIMC && calcIMC());
  loadCalcFromURL(['moeda-de','moeda-para','moeda-val-in'], () => window.calcMoeda && calcMoeda());
});


// FAQ accordion handled in dropdown listener above

// ─── DROPDOWN FERRAMENTAS (clique) ──────────────────
// Position dropdown menu under the Ferramentas button
function positionDropdown(){
  const btn = document.getElementById('nav-tools');
  const menu = document.getElementById('ferramentas-menu');
  if(!btn || !menu) return;
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
  menu.style.top = (r.bottom + 4) + 'px'; // sempre abaixo do botão
}

function toggleFerramentas(e){
  if(e){ e.stopPropagation(); e.preventDefault(); }
  const dd = document.getElementById('nav-dropdown-ferramentas');
  const btn = document.getElementById('nav-tools');
  const opening = !dd.classList.contains('open');
  document.querySelectorAll('.nav-dropdown').forEach(function(d){ d.classList.remove('open'); });
  document.querySelectorAll('#nav-tools,#nav-conteudo').forEach(function(b){ b.setAttribute('aria-expanded','false'); });
  if(opening){ dd.classList.add('open'); positionDropdown(); if(btn) btn.setAttribute('aria-expanded','true'); }
}

// navGoTo definida no bloco Blog Engine abaixo
// Fecha ao clicar fora
document.addEventListener('click', function(e){
  // Fecha dropdowns ao clicar fora — exceto ao clicar em seção expansível
  var isNavSec = e.target.closest('.nm-sec') || e.target.closest('.nm-sub-wrap');
  document.querySelectorAll('.nav-dropdown').forEach(function(d){
    if (!d.contains(e.target) && !isNavSec) d.classList.remove('open');
  });
  // FAQ accordion (event delegation)
  const q = e.target.closest('.faq-q');
  if(q){
    const item = q.parentElement;
    const isOpen = item.classList.contains('open');
    const list = item.closest('.faq-list');
    if(list) list.querySelectorAll('.faq-item.open').forEach(i=>i.classList.remove('open'));
    if(!isOpen) item.classList.add('open');
  }
});
// Fecha ao escolher opção (não fecha ao clicar em seção expansível nm-sec)
document.querySelectorAll('#nav-dropdown-ferramentas .nav-drop-menu a').forEach(a=>{
  a.addEventListener('click', ()=>{
    document.getElementById('nav-dropdown-ferramentas').classList.remove('open');
  });
});
document.querySelectorAll('#nav-dropdown-conteudo .nav-drop-menu a:not(.nm-sec)').forEach(a=>{
  a.addEventListener('click', ()=>{
    document.getElementById('nav-dropdown-conteudo').classList.remove('open');
    document.querySelectorAll('.nm-sub-wrap').forEach(w=>w.classList.remove('open'));
    document.querySelectorAll('.nm-arr').forEach(ar=>ar.classList.remove('open'));
  });
});

// ─── PRAZOS DE REFERÊNCIA — botão no nav ────────────
// ─── COOKIES ───────────────────────────────────────
function cookieChoice(accept){
  localStorage.setItem('cp_cookies', accept ? 'accepted' : 'declined');
  document.getElementById('cookie-banner').style.display='none';
  // Atualizar Google Consent Mode v2
  if(typeof gtag === 'function'){
    gtag('consent', 'update', {
      'analytics_storage': accept ? 'granted' : 'denied',
      'ad_storage': accept ? 'granted' : 'denied',
      'ad_user_data': accept ? 'granted' : 'denied',
      'ad_personalization': accept ? 'granted' : 'denied'
    });
  }
}
function setCookiePref(accept){
  try { localStorage.setItem('cp_cookies', accept ? 'accepted' : 'declined'); } catch(e){}
  const banner = document.getElementById('cookie-banner');
  if(banner) banner.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function(){
  try {
    const pref = localStorage.getItem('cp_cookies');
    const banner = document.getElementById('cookie-banner');
    if(banner && !pref) banner.style.display = 'flex';
  } catch(e) {}
});

// ─── AD SLOTS: show after-result ads ───────────────────────────────────────
// (função definida mais abaixo, junto com o observer de #p-resultado)

// Show prazos after-result ad when result appears
(function(){
  const observer = new MutationObserver(()=>{
    const res = document.getElementById('p-resultado');
    const ad  = document.getElementById('ad-prazos-after-result');
    if(res && ad){
      if(res.classList.contains('show')) ad.style.display='block';
      else ad.style.display='none';
    }
  });
  document.addEventListener('DOMContentLoaded', ()=>{
    const res = document.getElementById('p-resultado');
    if(res) observer.observe(res, {attributes:true, attributeFilter:['class']});
  });
})();


// ── Show after-result ad containers ──────────────────────
function showAdAfterResult(id){
  const el = document.getElementById(id);
  if(el) el.style.display = 'flex';
}
// prazos: watch #p-resultado class
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const res = document.getElementById('p-resultado');
    if(!res) return;
    new MutationObserver(function(){
      const ad = document.getElementById('ad-prazos-after-result');
      if(ad) ad.style.display = res.classList.contains('show') ? 'flex' : 'none';
    }).observe(res, {attributes:true, attributeFilter:['class']});
  });
})();


// ═══════════════════════════════════════════════════════════
//  SEO — Hash routing + meta dinâmica
// ═══════════════════════════════════════════════════════════
const SEO = {
  prazos: {
    slug: 'calculadora-de-prazo-processual',
    title: 'Calculadora de Prazo Processual (Dias Úteis e Corridos) – Calcula Prazo',
    desc:  'Calcule prazos jurídicos em dias úteis e corridos. +30 prazos processuais pré-configurados: CLT, CPC, tributário e RH. Grátis, sem cadastro.',
    h1:    'Calculadora de Prazo Processual',
    kw:    'calculadora de prazo processual, calcular dias úteis, prazo judicial, prazo CPC, prazo CLT',
    schemaType: 'SoftwareApplication',
  },
  correcao: {
    slug: 'correcao-monetaria',
    title: 'Calculadora de Correção Monetária Online (IPCA, IGP-M, INPC, SELIC) – Calcula Prazo',
    desc:  'Atualize valores monetários pelos índices IPCA, IGP-M, INPC e SELIC. Cálculo de correção monetária simples, rápido e gratuito.',
    h1:    'Calculadora de Correção Monetária',
    kw:    'correção monetária, calculadora IPCA, atualizar valor monetário, correção monetária judicial',
    schemaType: 'SoftwareApplication',
  },
  juros: {
    slug: 'calculadora-de-juros',
    title: 'Calculadora de Juros Simples e Compostos Online – Calcula Prazo',
    desc:  'Calcule juros simples, juros compostos, juros de mora e montante final. Tabela de evolução mês a mês. Grátis e sem cadastro.',
    h1:    'Calculadora de Juros Simples e Compostos',
    kw:    'calculadora de juros, juros simples, juros compostos, calcular juros online, juros de mora',
    schemaType: 'SoftwareApplication',
  },
  trabalhista: {
    slug: 'calculadora-verbas-trabalhistas',
    title: 'Calculadora de Verbas Trabalhistas e Rescisórias (CLT) – Calcula Prazo',
    desc:  'Calcule verbas rescisórias: saldo de salário, férias proporcionais, 13º, FGTS, multa e aviso prévio conforme CLT. Gratuito.',
    h1:    'Calculadora de Verbas Trabalhistas',
    kw:    'calculadora trabalhista, verbas rescisórias, calcular rescisão CLT, férias proporcionais, FGTS multa',
    schemaType: 'SoftwareApplication',
  },
  salario: {
    slug: 'calculadora-salario-liquido',
    title: 'Calculadora de Salário Líquido 2026 (INSS + IRRF) – Calcula Prazo',
    desc:  'Calcule seu salário líquido com as tabelas INSS e IRRF atualizadas para 2026. Desconto automático de INSS, IR e dependentes.',
    h1:    'Calculadora de Salário Líquido 2026',
    kw:    'calculadora salário líquido, calcular salário líquido 2026, desconto INSS IRRF, tabela IRRF 2026',
    schemaType: 'SoftwareApplication',
  },
  porcentagem: {
    slug: 'calculadora-de-porcentagem',
    title: 'Calculadora de Porcentagem Online – Desconto, Aumento e Variação – Calcula Prazo',
    desc:  'Calcule porcentagem, desconto, aumento percentual e variação entre valores. 5 modos de cálculo. Rápido e gratuito.',
    h1:    'Calculadora de Porcentagem',
    kw:    'calculadora de porcentagem, calcular porcentagem, desconto percentual, aumento percentual',
    schemaType: 'SoftwareApplication',
  },
  moedas: {
    slug: 'conversor-de-moedas',
    title: 'Conversor de Moedas Online (BRL, USD, EUR, GBP e mais) – Calcula Prazo',
    desc:  'Converta entre Real, Dólar, Euro, Libra, Iene, Franco Suíço, Dólar Canadense e Dólar Australiano. Taxa de câmbio atualizada.',
    h1:    'Conversor de Moedas',
    kw:    'conversor de moedas, converter real para dólar, câmbio online, BRL USD EUR GBP',
    schemaType: 'SoftwareApplication',
  },
  datas: {
    slug: 'calculadora-de-datas',
    title: 'Calculadora de Datas Online – Diferença, Soma e Subtração de Dias – Calcula Prazo',
    desc:  'Calcule a diferença entre datas, some ou subtraia dias, descubra o dia da semana. Ferramenta rápida e gratuita.',
    h1:    'Calculadora de Datas',
    kw:    'calculadora de datas, calcular dias entre datas, diferença entre datas, quantos dias entre datas',
    schemaType: 'SoftwareApplication',
  },
  valid: {
    slug: 'validador-cpf-cnpj',
    title: 'Validador de CPF e CNPJ Online – Gratuito – Calcula Prazo',
    desc:  'Valide CPF e CNPJ instantaneamente. Verificação de dígitos, formatação automática e consulta simplificada. 100% grátis.',
    h1:    'Validador de CPF e CNPJ',
    kw:    'validar CPF, validar CNPJ, validador CPF online, verificar CPF, verificar CNPJ',
    schemaType: 'SoftwareApplication',
  },
  qrcode: {
    slug: 'gerador-de-qr-code',
    title: 'Gerador de QR Code Online – Crie e Baixe Grátis – Calcula Prazo',
    desc:  'Gere QR Codes para links, textos, emails, telefones e PIX. Ajuste o tamanho e baixe em PNG. 100% gratuito.',
    h1:    'Gerador de QR Code',
    kw:    'gerador de QR code, criar QR code online, QR code grátis, QR code PIX',
    schemaType: 'SoftwareApplication',
  },
  senhas: {
    slug: 'gerador-de-senhas',
    title: 'Gerador de Senhas Seguras Online – Calcula Prazo',
    desc:  'Crie senhas aleatórias e seguras com letras, números e símbolos. Personalize o comprimento e as regras. Grátis.',
    h1:    'Gerador de Senhas Seguras',
    kw:    'gerador de senhas, criar senha segura, senha aleatória, gerador de senha online',
    schemaType: 'SoftwareApplication',
  },
  extenso: {
    slug: 'numero-por-extenso',
    title: 'Número por Extenso Online (até Trilhões, em Reais) – Calcula Prazo',
    desc:  'Converta números e valores em reais para texto por extenso. Até trilhões. Útil para contratos, cheques e documentos.',
    h1:    'Número por Extenso',
    kw:    'número por extenso, valor por extenso, escrever número por extenso, reais por extenso',
    schemaType: 'SoftwareApplication',
  },
  imc: {
    slug: 'calculadora-imc',
    title: 'Calculadora de IMC Online – Índice de Massa Corporal (OMS) – Calcula Prazo',
    desc:  'Calcule seu IMC (Índice de Massa Corporal) conforme a tabela da OMS. Resultado imediato com classificação e recomendações.',
    h1:    'Calculadora de IMC',
    kw:    'calculadora de IMC, calcular IMC, índice de massa corporal, IMC normal, IMC obesidade',
    schemaType: 'SoftwareApplication',
  },
  intermitente: {
    slug: 'calculadora-salario-intermitente',
    title: 'Calculadora de Salário Intermitente (CLT) – Calcula Prazo',
    desc:  'Calcule a remuneração do trabalho intermitente: salário-hora × horas trabalhadas, DSR, férias + 1/3, 13º proporcional, FGTS, INSS e IRRF. Confira se o valor pago está correto.',
    h1:    'Calculadora de Salário Intermitente',
    kw:    'calculadora salário intermitente, trabalho intermitente clt, dsr intermitente, como calcular salário intermitente',
    schemaType: 'SoftwareApplication',
  },
  horasextras: {
    slug: 'calculadora-horas-extras',
    title: 'Calculadora de Horas Extras Online – Adicional 50% e 100%, DSR – Calcula Prazo',
    desc:  'Calcule o valor das horas extras com adicional de 50% (dia útil) e 100% (domingo/feriado), reflexo no DSR e total a receber. Grátis, conforme CLT.',
    h1:    'Calculadora de Horas Extras',
    kw:    'calculadora de horas extras, calcular hora extra, adicional hora extra 50, hora extra domingo feriado, dsr horas extras',
    schemaType: 'SoftwareApplication',
  },
  segurodesemprego: {
    slug: 'calculadora-seguro-desemprego',
    title: 'Calculadora de Seguro-Desemprego 2026 – Parcelas e Valor – Calcula Prazo',
    desc:  'Calcule o valor e o número de parcelas do seguro-desemprego 2026 com base na média salarial e no tempo trabalhado. Tabela oficial atualizada. Grátis.',
    h1:    'Calculadora de Seguro-Desemprego',
    kw:    'calculadora de seguro desemprego, seguro desemprego 2026, valor seguro desemprego, tabela seguro desemprego, quantas parcelas seguro desemprego',
    schemaType: 'SoftwareApplication',
  },
  rescisaodomestica: {
    slug: 'calculadora-rescisao-domestica',
    title: 'Calculadora de Rescisão de Empregada Doméstica (LC 150/2015) – Calcula Prazo',
    desc:  'Calcule a rescisão de empregada doméstica conforme a LC 150/2015: saldo de salário, férias, 13º e a indenização compensatória do FGTS (3,2%). Grátis.',
    h1:    'Calculadora de Rescisão de Empregada Doméstica',
    kw:    'calculadora rescisão empregada doméstica, LC 150/2015, fgts doméstica 3.2%, indenização compensatória doméstica, rescisão trabalho doméstico',
    schemaType: 'SoftwareApplication',
  },
  prescricao: {
    slug: 'calculadora-de-prescricao',
    title: 'Calculadora de Prescrição — Trabalhista, Cível e Tributária – Calcula Prazo',
    desc:  'Calcule o prazo prescricional trabalhista (bienal/quinquenal), cível (CC) e tributário (CTN). Informe a data do fato gerador e veja o prazo-limite.',
    h1:    'Calculadora de Prescrição',
    kw:    'calculadora de prescrição, prescrição trabalhista, prescrição bienal quinquenal, prescrição cível, prescrição tributária',
    schemaType: 'SoftwareApplication',
  },
  blog: {
    slug: 'conteudo',
    title: 'Conteúdo Jurídico e Trabalhista: Notícias, Jurisprudência e Orientações | Calcula Prazo',
    desc:  'Notícias, jurisprudência do TST e TRTs, legislação, eSocial, FGTS Digital e orientações práticas de RH e folha de pagamento.',
    h1:    'Conteúdo Jurídico e Trabalhista',
    kw:    'notícias trabalhistas, jurisprudência tst, legislação trabalhista, conteúdo jurídico',
    schemaType: 'CollectionPage',
  },
  home: {
    slug: '',
    title: 'Calcula Prazo — Calculadoras Jurídicas e Conteúdo Trabalhista',
    desc:  'Calculadoras de prazos processuais (CLT/CPC), verbas rescisórias, salário líquido (INSS/IRRF 2026) e correção monetária — além de acervo editorial sobre Direito do Trabalho. Para advogados, RH e contadores. Grátis, sem cadastro.',
    h1:    'Calculadoras Jurídicas e Conteúdo Trabalhista',
    kw:    'calculadora de prazos processuais CLT, verbas rescisórias, salário líquido INSS IRRF 2026, correção monetária IPCA SELIC, calculadora trabalhista grátis, prazo processual CPC TST',
    schemaType: null,
  },
};

// SEO FAQ data (usado no schema)
const SEO_FAQ = {
  prazos: [
    {q:"Como calcular prazo processual em dias úteis?", a:"Na calculadora, selecione 'Dias Úteis', informe a data inicial e o número de dias. O sistema exclui sábados e domingos automaticamente. Você também pode incluir feriados na contagem."},
    {q:"Qual a diferença entre dias úteis e dias corridos em prazos processuais?", a:"Dias corridos contam todos os dias do calendário, incluindo fins de semana. Dias úteis excluem sábados, domingos e feriados. O CPC/2015 determina que os prazos processuais são contados em dias úteis (art. 219)."},
    {q:"Como contar prazo judicial no CPC?", a:"No CPC/2015, prazos são contados em dias úteis (art. 219). A contagem inicia no primeiro dia útil após a publicação ou intimação, excluindo o dia do começo e incluindo o do vencimento."},
    {q:"Quais são os principais prazos do processo trabalhista (CLT)?", a:"Na CLT, os principais prazos são: Recurso Ordinário (8 dias úteis), Embargos de Declaração (5 dias úteis), Agravo de Instrumento (8 dias úteis) e Ação Rescisória (2 anos)."},
  ],
  correcao: [
    {q:"O que é correção monetária?", a:"Correção monetária é a atualização de um valor financeiro para compensar a perda do poder de compra causada pela inflação ao longo do tempo."},
    {q:"Qual índice usar para correção monetária judicial?", a:"Depende do contexto: IPCA-E para débitos trabalhistas, IPCA para débitos federais, TR ou INPC conforme determinação judicial. O SELIC é usado para atualização de débitos fiscais."},
    {q:"Como calcular correção monetária pelo IPCA?", a:"Divida o IPCA acumulado no período (ex: de jan/2020 a dez/2023) por 100, some 1, e multiplique pelo valor original. Nossa calculadora faz isso automaticamente."},
  ],
  juros: [
    {q:"Qual a diferença entre juros simples e compostos?", a:"Juros simples incidem sempre sobre o capital inicial. Juros compostos incidem sobre o montante (capital + juros acumulados), gerando crescimento exponencial — os famosos 'juros sobre juros'."},
    {q:"Como calcular juros de mora?", a:"Juros de mora são calculados à taxa de 1% ao mês (12% ao ano) para dívidas civis (CC art. 406 c/c CTN art. 161). Nossa calculadora permite simular qualquer taxa."},
  ],
  trabalhista: [
    {q:"O que são verbas rescisórias?", a:"Verbas rescisórias são os valores devidos ao empregado no encerramento do contrato de trabalho, como saldo de salário, férias proporcionais + 1/3, 13º proporcional, FGTS e, quando cabível, multa de 40% e aviso prévio."},
    {q:"Quais verbas são devidas na demissão sem justa causa?", a:"Saldo de salário, férias vencidas e proporcionais + 1/3, 13º proporcional, FGTS do período + multa de 40%, aviso prévio (indenizado ou trabalhado) e a guia para sacar o FGTS."},
    {q:"Como calcular férias proporcionais?", a:"Férias proporcionais = (salário base / 12) × número de meses no período aquisitivo atual + 1/3 constitucional. Conta-se +1 mês se o trabalhador atingir 15 ou mais dias no último mês."},
  ],
  salario: [
    {q:"Como é calculado o INSS 2026?", a:"O INSS 2026 usa alíquotas progressivas: 7,5% até R$1.518, 9% até R$2.793,88, 12% até R$4.190,83 e 14% até R$8.157,41. A contribuição é calculada de forma progressiva sobre cada faixa."},
    {q:"Como funciona a isenção do IRRF em 2026?", a:"Pela Lei 15.270/2025, em vigor desde jan/2026, rendimentos até R$5.000 são isentos do IRRF. Entre R$5.000,01 e R$7.350 há um redutor adicional. Acima disso aplicam-se as faixas progressivas normais."},
  ],
  imc: [
    {q:"O que é IMC?", a:"IMC (Índice de Massa Corporal) é uma medida que relaciona peso e altura para classificar o estado nutricional de um adulto, conforme critérios da OMS."},
    {q:"Qual é o IMC normal?", a:"Segundo a OMS: abaixo de 18,5 = abaixo do peso; 18,5–24,9 = normal; 25–29,9 = sobrepeso; 30–34,9 = obesidade grau I; 35–39,9 = obesidade grau II; acima de 40 = obesidade grau III."},
  ],
  intermitente: [
    {q:"Como funciona o pagamento no trabalho intermitente?", a:"No contrato intermitente (art. 443, §3º CLT), o empregado é convocado para prestar serviços por período determinado e recebe o valor da hora ou dia trabalhado, mais o DSR, 13º, férias + 1/3 e FGTS proporcionais, calculados ao final de cada período de prestação de serviço."},
    {q:"O trabalhador intermitente tem direito a DSR?", a:"Sim. O Descanso Semanal Remunerado é devido de forma proporcional aos dias trabalhados no período, calculado sobre a remuneração das convocações somada às demais parcelas."},
    {q:"Como calcular o INSS do trabalhador intermitente?", a:"O INSS incide sobre a remuneração de cada convocação/período, aplicando a tabela progressiva mensal do INSS, da mesma forma que para os demais empregados CLT."},
  ],
  prescricao: [
    {q:"Qual o prazo de prescrição trabalhista?", a:"Pelo art. 7º, XXIX da CF/88, o prazo é de 2 anos após o fim do contrato de trabalho (prescrição bienal) para reclamar créditos referentes aos últimos 5 anos (prescrição quinquenal)."},
    {q:"Qual o prazo de prescrição civil geral?", a:"O Código Civil prevê prazo geral de 10 anos (art. 205), com prazos especiais menores para hipóteses específicas listadas no art. 206, como 3 anos para reparação civil."},
    {q:"Qual o prazo de prescrição de crédito tributário?", a:"O art. 174 do CTN prevê 5 anos, contados da data da constituição definitiva do crédito tributário, para a Fazenda Pública promover a cobrança."},
  ],
};

// ── Hash routing ──────────────────────────────────────────

// ═══════════════════════════════════════════════════════════
//  ROUTING — URL path real + SEO dinâmico
//  Funciona com Cloudflare Pages _redirects (/* → /index.html)
// ═══════════════════════════════════════════════════════════

// Mapa slug → id interno
const SLUG_TO_ID = {};
const ID_TO_SLUG = {};
Object.entries(SEO).forEach(([id, data]) => {
  const slug = data.slug || '';
  if (slug) {
    SLUG_TO_ID['/' + slug] = id;   // /calculadora-de-prazo
    SLUG_TO_ID[slug]        = id;   // calculadora-de-prazo (fallback)
  }
  SLUG_TO_ID[id] = id; // id direto também funciona
  ID_TO_SLUG[id] = slug ? '/' + slug : '/';
});

// Resolve o ID a partir da URL atual
function resolveIdFromURL() {
  const hash = location.hash;
  if (hash && hash.length > 1) {
    const hslug = hash.slice(1); // ex: 'conteudo', 'correcao', 'calculadora-de-prazo-processual'
    // Verificar se é um ID direto do NAV_MAP
    if (NAV_MAP[hslug]) return NAV_MAP[hslug];
    // Verificar se é um slug do SLUG_TO_ID (ex: calculadora-de-prazo-processual → prazos)
    if (SLUG_TO_ID['/' + hslug]) return SLUG_TO_ID['/' + hslug];
    if (SLUG_TO_ID[hslug]) return SLUG_TO_ID[hslug];
    // Aliases especiais
    if (hslug === 'conteudo' || hslug === 'blog') return 'blog';
  }
  const path = location.pathname.replace(/\/$/, '') || '/';
  return SLUG_TO_ID[path] || SLUG_TO_ID[path.slice(1)] || 'prazos';
}

// Atualiza <title>, metas, canonical, OG e schema
function updateSEO(id) {
  if (!document.getElementById('page-title')) return; // página estática já tem o SEO correto embutido
  const s = SEO[id] || SEO.prazos;
  const slug  = s.slug || '';
  const url   = 'https://calculaprazo.com.br' + (slug ? '/' + slug : '/');

  // <title>
  document.title = s.title;
  document.getElementById('page-title').textContent = s.title;
  // meta description
  document.getElementById('meta-desc').setAttribute('content', s.desc);
  // canonical
  document.getElementById('canonical').setAttribute('href', url);
  // Open Graph
  document.getElementById('og-title').setAttribute('content', s.title);
  document.getElementById('og-desc').setAttribute('content',  s.desc);
  document.getElementById('og-url').setAttribute('content',   url);
  // Twitter Card
  document.getElementById('tw-title').setAttribute('content', s.title);
  document.getElementById('tw-desc').setAttribute('content',  s.desc);
  // Schema.org dinâmico
  updateSchema(id, s, url);
}

function updateSchema(id, s, url) {
  let el = document.getElementById('schema-tool');
  if (!el) {
    el = document.createElement('script');
    el.id   = 'schema-tool';
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  const app = {
    "@context": "https://schema.org",
    "@type":    "SoftwareApplication",
    "name":     s.h1,
    "url":      url,
    "applicationCategory": "UtilityApplication",
    "operatingSystem":     "Any",
    "inLanguage":          "pt-BR",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "BRL" },
    "description": s.desc,
  };
  const faqs = SEO_FAQ[id];
  if (faqs && faqs.length) {
    const faqSchema = {
      "@context":    "https://schema.org",
      "@type":       "FAQPage",
      "mainEntity":  faqs.map(f => ({
        "@type": "Question",
        "name":  f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a }
      }))
    };
    el.textContent = JSON.stringify([app, faqSchema]);
  } else {
    el.textContent = JSON.stringify(app);
  }
}

// ── goTo unificado — navegação + URL + SEO ───────────────
// Guarda a função original antes de redefinir
const _navOriginal = goTo;

// Redefine como propriedade global para garantir que TODOS os callers usem esta versão
window.goTo = function(id) {
  // 1. Troca a seção visível (sempre funciona, inclusive arquivo local)
  _navOriginal(id);
  // 2. Atualiza URL real (só em servidor; arquivo local não suporta pushState)
  try {
    const path = ID_TO_SLUG[id] || '/';
    if (location.protocol !== 'file:' && location.pathname !== path) {
      history.pushState({ id, scrollY: window.scrollY }, '', path);
    }
  } catch(e) { /* silencioso */ }
  // 3. Atualiza meta tags SEO
  updateSEO(id);
};

// ── Botão Voltar / Avançar do navegador ─────────────────
window.addEventListener('popstate', function(e) {
  const id = e.state && e.state.id ? e.state.id : resolveIdFromURL();
  _navOriginal(id);
  updateSEO(id);
  // Restaura posição de scroll salva no pushState
  const savedY = (e.state && e.state.scrollY != null) ? e.state.scrollY : 0;
  setTimeout(function() { window.scrollTo(0, savedY); }, 50);
});

// ── Inicialização — lê a URL ao carregar ────────────────
document.addEventListener('DOMContentLoaded', function() {
  var id = resolveIdFromURL();
  // Se há hash na URL (ex: /conteudo), usa o id resolvido mesmo na raiz
  if (id && id !== 'prazos') {
    _navOriginal(id);
    updateSEO(id);
  } else if (location.pathname === '/' || location.pathname === '' || !id) {
    _navOriginal('home');
    updateSEO('home');
  } else {
    _navOriginal(id);
    updateSEO(id);
  }
});
