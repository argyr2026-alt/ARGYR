'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MEDIOS={efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta',billetera:'Billetera virtual'};
const CUENTA_DE={efectivo:'efectivo',transferencia:'banco',tarjeta:'banco',billetera:'billetera'};
const CUENTAS={efectivo:'Efectivo',banco:'Banco',billetera:'Billetera virtual'};
const ESTADOS={pendiente:'Pendiente',cobrada:'Cobrada',cancelada:'Cancelada',devuelta:'Devuelta'};
const DAY=86400000;
/* ---------- dinero: todo en centavos enteros ---------- */
const fmtN=c=>{const v=Math.abs(c)/100;const d=Number.isInteger(v)?0:2;return v.toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d})};
const m=c=>(c<0?'-':'')+'$ '+fmtN(c);
const mS=c=>(c>=0?'+':'-')+'$ '+fmtN(c);
function parseAR(s){s=String(s||'').replace(/[^\d.,-]/g,'');if(!s)return NaN;
  if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.')}
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)){s=s.replace(/\./g,'')}
  const n=parseFloat(s);return isFinite(n)?n:NaN}
const toC=n=>Math.round(n*100);
/* ---------- fechas ---------- */
const D0=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()};
const addD=(t,n)=>{const x=new Date(t);x.setDate(x.getDate()+n);return x.getTime()};
const wk0=t=>addD(D0(t),-((new Date(t).getDay()+6)%7));
const mo0=(t,k)=>{const x=new Date(t);return new Date(x.getFullYear(),x.getMonth()+(k||0),1).getTime()};
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const fDia=t=>cap(new Date(t).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}));
const fHora=t=>new Date(t).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false});
const fCorta=t=>new Date(t).toLocaleDateString('es-AR',{day:'numeric',month:'short'}).replace('.','');
const fFull=t=>fCorta(t)+' · '+fHora(t);
const pad2=n=>String(n).padStart(2,'0');
const toInput=t=>{const x=new Date(t);return x.getFullYear()+'-'+pad2(x.getMonth()+1)+'-'+pad2(x.getDate())+'T'+pad2(x.getHours())+':'+pad2(x.getMinutes())};
const toDateInput=t=>toInput(t).slice(0,10);
function rng(p,prev){const n=Date.now();
  if(p==='hoy'){const a=D0(n);return prev?[a-DAY,a]:[a,a+DAY]}
  if(p==='semana'){const a=wk0(n);return prev?[a-7*DAY,a]:[a,a+7*DAY]}
  if(p==='mes'){return prev?[mo0(n,-1),mo0(n)]:[mo0(n),mo0(n,1)]}
  return [0,Infinity]}
const PER={hoy:'Hoy',semana:'Esta semana',mes:'Este mes',todo:'Todo'};
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const sum=(a,f)=>a.reduce((x,y)=>x+f(y),0);
/* ---------- estado ---------- */
const S={ventas:[],gastos:[],transf:[],config:{},bitacora:[],ready:false,usingDb:false,tab:'inicio',
  f:{estado:'todas',per:'mes',q:'',medio:'',cat:'',desde:'',hasta:'',open:false},
  vmetric:'vendido',sp:'mes',evo:'ventas',span:'dias',sel:-1,dfilt:'todos',demoHidden:false,sheet:null};
try{S.demoHidden=localStorage.getItem('argyr:demoHidden')==='1'}catch(e){}
/* ---------- almacenamiento: db de la cuenta, o este navegador si no hay ---------- */
let DB=null;const LS='argyr:data:v1';
const COLS=['ventas','gastos','transf','meta','bitacora'];
const mem={ventas:{},gastos:{},transf:{},meta:{},bitacora:{}};const loaded={};
function loadLS(){try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(j)COLS.forEach(c=>{mem[c]=j[c]||{}})}catch(e){}}
function saveLS(){try{localStorage.setItem(LS,JSON.stringify(mem))}catch(e){}}
function setCol(col,rows){
  if(col==='ventas')S.ventas=rows;else if(col==='gastos')S.gastos=rows;else if(col==='transf')S.transf=rows;
  else if(col==='bitacora')S.bitacora=rows.sort((a,b)=>b.ts-a.ts).slice(0,60);
  else if(col==='meta'){S.config=rows.find(r=>r.id==='config')||{}}
  loaded[col]=true;if(COLS.every(c=>loaded[c]))S.ready=true;
  if(typeof onData==='function')onData()}
const rowsOf=c=>Object.entries(mem[c]).map(([id,v])=>Object.assign({id},v));
async function retry(fn){try{return await fn()}catch(e){
  if(e&&(e.code==='unavailable'||e.code==='resource_exhausted')){await new Promise(r=>setTimeout(r,600+Math.random()*600));return fn()}throw e}}
let SB=null,UID=null,USER_EMAIL='',AUTH={mode:'in'};
async function put(col,id,data){
  const clean=JSON.parse(JSON.stringify(data));delete clean.id;
  const r=await SB.from('registros').upsert({user_id:UID,col,id,data:clean,updated_at:new Date().toISOString()});
  if(r.error)throw r.error;
  mem[col][id]=clean;setCol(col,rowsOf(col))}
async function del(col,id){
  const r=await SB.from('registros').delete().eq('col',col).eq('id',id);
  if(r.error)throw r.error;
  delete mem[col][id];setCol(col,rowsOf(col))}
async function log(msg){try{await put('bitacora',newId(),{ts:Date.now(),msg})}catch(e){}}
function authView(msg,email){
  const inn=AUTH.mode==='in';
  $('#authbox').innerHTML='<div class="lock"><div class="brand" style="color:#fff;opacity:.8">ARGYR</div><h2>'+(inn?'Entrá a tu cuenta':'Creá tu cuenta')+'</h2><p role="alert">'+esc(msg||'')+'</p>'+
  '<div class="auth" style="display:flex;flex-direction:column"><input id="au-mail" type="email" autocomplete="email" placeholder="Correo electrónico" value="'+esc(email||'')+'"><input id="au-pass" type="password" autocomplete="'+(inn?'current-password':'new-password')+'" placeholder="Contraseña (mínimo 6 caracteres)"><button class="btn" data-a="auth-go">'+(inn?'Entrar':'Crear cuenta')+'</button></div>'+
  '<button class="cancel" data-a="auth-toggle">'+(inn?'No tengo cuenta':'Ya tengo cuenta')+'</button></div>'}
async function authGo(){
  const email=val('au-mail').trim(),password=val('au-pass');
  if(!email||password.length<6)return authView('Ingresá tu correo y una contraseña de al menos 6 caracteres.',email);
  try{
    if(AUTH.mode==='in'){const r=await SB.auth.signInWithPassword({email,password});if(r.error)return authView('Correo o contraseña incorrectos.',email);await entrar(r.data.session)}
    else{const r=await SB.auth.signUp({email,password});if(r.error)return authView(r.error.message,email);
      if(r.data.session)await entrar(r.data.session);else{AUTH.mode='in';authView('Te enviamos un correo para confirmar la cuenta. Después entrá acá.',email)}}
  }catch(e){authView('No se pudo conectar. Probá de nuevo.',email)}}
async function entrar(ses){
  UID=ses.user.id;USER_EMAIL=ses.user.email||'';$('#authbox').innerHTML='';S.usingDb=true;
  COLS.forEach(c=>{mem[c]={}});
  for(let from=0;;from+=1000){
    const r=await SB.from('registros').select('col,id,data').range(from,from+999);
    if(r.error){S.dbError='fetch';break}
    r.data.forEach(x=>{if(mem[x.col])mem[x.col][x.id]=x.data});
    if(r.data.length<1000)break}
  COLS.forEach(c=>setCol(c,rowsOf(c)));
  SB.channel('registros-'+UID).on('postgres_changes',{event:'*',schema:'public',table:'registros'},p=>{
    const r=(p.new&&p.new.col)?p.new:p.old;if(!r||!mem[r.col])return;
    if(p.eventType==='DELETE')delete mem[r.col][r.id];else mem[r.col][r.id]=p.new.data;
    setCol(r.col,rowsOf(r.col))}).subscribe()}
async function initStore(){
  const cfg=window.ARGYR_CONFIG||{};
  if(!cfg.url||!cfg.key||/TU-PROYECTO|TU_/.test(cfg.url+cfg.key)){
    $('#authbox').innerHTML='<div class="lock"><h2>Falta configurar Supabase</h2><p>Completá config.js con la URL y la clave anon de tu proyecto.</p></div>';return}
  let base=String(cfg.url).trim();try{base=new URL(base).origin}catch(e){}
  SB=window.supabase.createClient(base,String(cfg.key).trim());
  const r=await SB.auth.getSession();
  if(r.data&&r.data.session)await entrar(r.data.session);else authView('')}
/* ---------- cálculos ---------- */
const itemsOf=o=>(o.items&&o.items.length)?o.items:[{producto:o.producto,categoria:o.categoria||'',cantidad:o.cantidad,precio:o.precio,costo:o.costo||0}];
const itTotal=it=>Math.round(it.cantidad*it.precio);
const unidades=o=>sum(itemsOf(o),i=>i.cantidad);
const valida=o=>o.estado==='pendiente'||o.estado==='cobrada';
const cobrado=o=>valida(o)?sum(o.cobros||[],c=>c.monto):0;
const porCobrarDe=o=>valida(o)?Math.max(0,o.total-cobrado(o)):0;
/* datos de ejemplo: solo en memoria, nunca se guardan */
function makeDemo(){
  const now=Date.now();let n=0;const V=[];
  const mk=(dias,h,mi,cliente,producto,categoria,cant,precio,costo,medio,estado,parcial)=>{
    const ts=D0(addD(now,-dias))+h*3600000+mi*60000;if(ts>now&&dias===0)return;
    const total=toC(cant*precio);let cobros=[];
    if(estado==='cobrada')cobros=[{monto:total,medio,ts:ts+600000}];
    else if(parcial)cobros=[{monto:toC(parcial),medio:'transferencia',ts:ts+900000}];
    V.push({id:'demo'+(++n),demo:true,ts,cliente,producto,categoria,cantidad:cant,precio:toC(precio),costo:toC(costo),total,medio,estado,cobros,notas:'',hist:[]})};
  mk(0,9,30,'Martín Gómez','Remera estampada','Remeras',3,6000,2500,'transferencia','cobrada');
  mk(0,10,42,'Lucía Fernández','Buzo canguro','Abrigo',1,24500,12000,'efectivo','cobrada');
  mk(0,11,15,'Carla Ruiz','Campera rompeviento','Abrigo',1,48000,26000,'transferencia','pendiente',20000);
  mk(0,12,5,'Mostrador','Gorra','Accesorios',2,7500,3000,'efectivo','cobrada');
  mk(1,17,20,'Tomás Herrera','Mochila urbana','Accesorios',1,32000,17000,'billetera','cobrada');
  mk(1,11,0,'Lucía Fernández','Medias pack x3','Accesorios',4,4200,1800,'efectivo','cobrada');
  mk(1,15,40,'Paula Sosa','Remera estampada','Remeras',2,6000,2500,'transferencia','pendiente');
  mk(2,10,10,'Mostrador','Gorra','Accesorios',1,7500,3000,'efectivo','cobrada');
  mk(3,18,30,'Martín Gómez','Buzo canguro','Abrigo',2,24500,12000,'transferencia','cobrada');
  mk(4,13,0,'Carla Ruiz','Mochila urbana','Accesorios',1,32000,17000,'tarjeta','devuelta');
  mk(5,16,45,'Tomás Herrera','Remera estampada','Remeras',5,6000,2500,'efectivo','cobrada');
  mk(6,12,30,'Mostrador','Medias pack x3','Accesorios',3,4200,1800,'billetera','cobrada');
  mk(8,10,0,'Paula Sosa','Campera rompeviento','Abrigo',1,48000,26000,'transferencia','cobrada');
  mk(9,19,0,'Lucía Fernández','Gorra','Accesorios',1,7500,3000,'efectivo','cancelada');
  mk(12,11,30,'Mostrador','Buzo canguro','Abrigo',2,24500,12000,'tarjeta','cobrada');
  mk(35,15,0,'Tomás Herrera','Mochila urbana','Accesorios',2,32000,17000,'transferencia','cobrada');
  mk(38,12,0,'Mostrador','Remera estampada','Remeras',6,6000,2500,'efectivo','cobrada');
  const G=[],T=[];
  const g=(dias,h,tipo,concepto,monto,cuenta)=>G.push({id:'demog'+(G.length+1),demo:true,ts:D0(addD(now,-dias))+h*3600000,tipo,concepto,monto:toC(monto),cuenta,notas:''});
  g(0,8,'gasto','Bolsas y etiquetas',6500,'efectivo');g(1,9,'gasto','Flete de mercadería',18000,'banco');
  g(3,20,'retiro','Retiro personal',25000,'efectivo');g(10,10,'gasto','Alquiler del puesto',40000,'banco');
  T.push({id:'demot1',demo:true,ts:D0(addD(now,-2))+14*3600000,desde:'efectivo',hasta:'banco',monto:toC(30000),notas:''});
  return {ventas:V,gastos:G,transf:T,config:{saldos:{efectivo:toC(150000),banco:toC(80000),billetera:toC(10000)}}}}
let _demo=null;
function demoOn(){return S.ready&&!S.demoHidden&&!S.ventas.length&&!S.gastos.length&&!S.transf.length&&!Object.keys(S.config).length}
function D(){if(demoOn()){if(!_demo||_demo.day!==D0(Date.now())){_demo=makeDemo();_demo.day=D0(Date.now())}return Object.assign({demo:true},_demo)}
  return {demo:false,ventas:S.ventas,gastos:S.gastos,transf:S.transf,config:S.config}}
function saldos(d){const s={efectivo:0,banco:0,billetera:0};const ini=(d.config&&d.config.saldos)||{};for(const k in s)s[k]=ini[k]||0;
  d.ventas.forEach(o=>{if(!valida(o))return;(o.cobros||[]).forEach(c=>{s[CUENTA_DE[c.medio]||'efectivo']+=c.monto})});
  d.gastos.forEach(g=>{if(s[g.cuenta]!=null)s[g.cuenta]-=g.monto});
  d.transf.forEach(t=>{if(s[t.desde]!=null)s[t.desde]-=t.monto;if(s[t.hasta]!=null)s[t.hasta]+=t.monto});return s}
function movs(d){const a=[];
  d.ventas.forEach(o=>{if(!valida(o))return;(o.cobros||[]).forEach(c=>a.push({k:'cobro',ts:c.ts,monto:c.monto,cuenta:CUENTA_DE[c.medio]||'efectivo',medio:c.medio,t:o.producto,cli:o.cliente,ref:o.id}))});
  d.gastos.forEach(g=>a.push({k:g.tipo,ts:g.ts,monto:g.monto,cuenta:g.cuenta,t:g.concepto,ref:g.id}));
  d.transf.forEach(t=>a.push({k:'transf',ts:t.ts,monto:t.monto,desde:t.desde,hasta:t.hasta,t:CUENTAS[t.desde]+' → '+CUENTAS[t.hasta],ref:t.id}));
  return a.sort((x,y)=>y.ts-x.ts)}
function stats(d,r){const inR=t=>t>=r[0]&&t<r[1];
  const vs=d.ventas.filter(o=>valida(o)&&inR(o.ts));
  const vendido=sum(vs,o=>o.total),cob=sum(vs,cobrado),porCobrar=sum(vs,porCobrarDe);
  let costo=0,sinCosto=0;vs.forEach(o=>{let falta=false;itemsOf(o).forEach(it=>{if(it.costo>0)costo+=Math.round(it.costo*it.cantidad);else falta=true});if(falta)sinCosto++});
  const gastos=sum(d.gastos.filter(g=>g.tipo==='gasto'&&inR(g.ts)),g=>g.monto);
  const retiros=sum(d.gastos.filter(g=>g.tipo==='retiro'&&inR(g.ts)),g=>g.monto);
  return {vs,vendido,cob,porCobrar,ops:vs.length,ticket:vs.length?Math.round(vendido/vs.length):0,costo,sinCosto,gastos,retiros,ganancia:vendido-costo-gastos}}
function groupBy(vs,key){const mp=new Map();vs.forEach(o=>itemsOf(o).forEach(it=>{const raw=(it[key]||'').trim();if(!raw)return;const k=raw.toLowerCase();
  const e=mp.get(k)||{n:raw,total:0,u:0};e.total+=itTotal(it);e.u+=it.cantidad;mp.set(k,e)}));
  return [...mp.values()].sort((a,b)=>b.total-a.total)}

/* ---------- vistas ---------- */
const IC={home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 rec:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 wal:'<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
 cha:'<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',dn:'<path d="M12 5v14M6 13l6 6 6-6"/>',up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
 swap:'<path d="M7 7h12l-3-3M17 17H5l3 3"/>',flt:'<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
 back:'<path d="M15 5l-7 7 7 7"/>'};
const ico=(n,s)=>'<svg width="'+(s||22)+'" height="'+(s||22)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>';
const qty=n=>Number(n).toLocaleString('es-AR',{maximumFractionDigits:3});
const when=ts=>D0(ts)===D0(Date.now())?fHora(ts):fCorta(ts)+' '+fHora(ts);
const dayName=t=>{const x=D0(t),h=D0(Date.now());return x===h?'Hoy':x===h-DAY?'Ayer':fDia(t)};
function plural(n,a,b){return n+' '+(n===1?a:b)}
function renderNav(){
  const t=(k,i,l)=>'<button class="t" data-a="tab" data-v="'+k+'" '+(S.tab===k?'aria-current="page"':'')+'>'+ico(i)+'<span>'+l+'</span></button>';
  $('#nav').innerHTML='<div class="nav-in">'+t('inicio','home','Inicio')+t('ventas','rec','Ventas')+
   '<button class="plus" data-a="nueva" aria-label="Registrar venta">'+ico('plus',26)+'</button>'+t('dinero','wal','Dinero')+t('stats','cha','Estadísticas')+'</div>'}
function banners(d){let h='';
  if(d.demo)h+='<div class="banner"><span>Estás viendo datos de ejemplo. Desaparecen cuando registres tu primera venta.</span><button data-a="hidedemo">Ocultar</button></div>';
  if(!S.usingDb&&S.ready)h+='<div class="banner warn"><span>Sin conexión con tu cuenta: los datos se guardan solo en este navegador.</span></div>';
  if(S.dbError)h+='<div class="banner warn"><span>No se pudo sincronizar con tu cuenta. Revisá la conexión y recargá la página.</span></div>';
  return h}
function onData(){render();if(S.sheet&&S.sheet.type==='detalle')openSheet(S.sheet)}
function render(){
  const app=$('#app');renderNav();
  if(!S.ready){app.innerHTML='<div class="top"><div><div class="brand">ARGYR</div><h1>Mi actividad</h1></div></div><div class="hero"><div class="lbl">Cargando tus ventas…</div><div class="big num">$ —</div></div>';return}
  const ae=document.activeElement,fid=ae&&ae.id,ss=ae&&ae.selectionStart;
  const d=D();
  const v={inicio:vInicio,ventas:vVentas,dinero:vDinero,stats:vStats,ajustes:vAjustes}[S.tab](d);
  app.innerHTML=banners(d)+v;
  if(fid){const e=document.getElementById(fid);if(e&&e!==document.activeElement){e.focus();try{if(ss!=null)e.setSelectionRange(ss,ss)}catch(x){}}}}
function movRow(x){
  const hora=when(x.ts);let ic,cl,amt,sub;
  if(x.k==='cobro'){ic='dn';cl='in';amt='<span class="amt num pos">'+mS(x.monto)+'</span>';sub=CUENTAS[x.cuenta]+' · '+hora+(x.cli?' · '+esc(x.cli):'')}
  else if(x.k==='transf'){ic='swap';cl='mv';amt='<span class="amt num">'+m(x.monto)+'</span>';sub=hora+' · Entre cuentas'}
  else{ic='up';cl='out';amt='<span class="amt num neg">'+mS(-x.monto)+'</span>';sub=CUENTAS[x.cuenta]+' · '+hora+' · '+(x.k==='retiro'?'Retiro':'Gasto')}
  return '<button class="item" data-a="mov" data-k="'+x.k+'" data-id="'+esc(x.ref)+'"><span class="ava '+cl+'">'+ico(ic,20)+'</span><span class="mid"><div class="t">'+esc(x.t)+'</div><div class="d">'+sub+'</div></span><span class="r">'+amt+'</span></button>'}
function vInicio(d){
  const sal=saldos(d),disp=sum(Object.values(sal),x=>x),hoy=stats(d,rng('hoy'));
  const pend=d.ventas.filter(o=>valida(o)&&porCobrarDe(o)>0),pTot=sum(pend,porCobrarDe);
  const mv=movs(d).slice(0,6);
  return '<div class="top"><div><div class="brand">ARGYR</div><h1>Mi actividad</h1><div class="date">'+fDia(Date.now())+'</div></div><button class="icon-btn" data-a="tab" data-v="ajustes" aria-label="Ajustes">'+ico('gear')+'</button></div>'+
  '<section class="hero" aria-label="Dinero disponible"><div><div class="lbl">Dinero disponible</div><div class="big num">'+m(disp)+'</div><div class="sub">Saldo de tus cuentas registradas</div></div>'+
  '<div class="accts">'+Object.keys(CUENTAS).map(k=>'<div class="acct"><small>'+CUENTAS[k]+'</small><b class="num">'+m(sal[k])+'</b></div>').join('')+'</div></section>'+
  '<div class="row2"><button class="card tap" data-a="goventas" data-per="hoy"><div class="k">Ventas de hoy</div><div class="v num">'+m(hoy.vendido)+'</div><div class="s">'+plural(hoy.ops,'operación','operaciones')+'</div></button>'+
  '<button class="card tap" data-a="goventas" data-per="todo" data-estado="pendiente"><div class="k">Por cobrar</div><div class="v num">'+m(pTot)+'</div><div class="s">'+plural(pend.length,'operación','operaciones')+'</div></button></div>'+
  '<button class="card tap" style="margin-top:12px;display:flex;align-items:center;gap:14px" data-a="nueva"><span class="ava" style="width:46px;height:46px">'+ico('plus',24)+'</span><span><b style="font-family:var(--f-display);font-size:17px">Registrar venta</b><br><span class="s">Anotá una operación nueva</span></span></button>'+
  '<div class="sec"><h2>Últimos movimientos</h2>'+(mv.length?'<button data-a="tab" data-v="dinero">Ver todos</button>':'')+'</div>'+
  (mv.length?'<div class="list">'+mv.map(movRow).join('')+'</div>':'<div class="empty"><b>Todavía no hay movimientos</b>Cuando registres una venta cobrada o un gasto, aparece acá.</div>')}
function ventasBase(d){const f=S.f;let from=0,to=Infinity;
  if(f.desde||f.hasta){from=f.desde?new Date(f.desde+'T00:00').getTime():0;to=f.hasta?new Date(f.hasta+'T00:00').getTime()+DAY:Infinity}else{const r=rng(f.per);from=r[0];to=r[1]}
  const q=f.q.trim().toLowerCase();
  return d.ventas.filter(o=>o.ts>=from&&o.ts<to&&(!f.medio||o.medio===f.medio)&&(!f.cat||itemsOf(o).some(i=>(i.categoria||'')===f.cat))&&
    (!q||[o.cliente,o.notas].concat(itemsOf(o).map(i=>i.producto+' '+(i.categoria||''))).join(' ').toLowerCase().includes(q))).sort((a,b)=>b.ts-a.ts)}
function ventaRow(o){
  const par=o.estado==='pendiente'&&cobrado(o)>0;
  const tag=par?'<span class="tag parcial">Parcial</span>':'<span class="tag '+o.estado+'">'+ESTADOS[o.estado]+'</span>';
  const dead=!valida(o)?' style="text-decoration:line-through;opacity:.6"':'';
  return '<button class="item" data-a="venta" data-id="'+esc(o.id)+'"><span class="ava">'+esc((o.producto||'?').charAt(0).toUpperCase())+'</span><span class="mid"><div class="t">'+esc(o.producto)+'</div><div class="d">'+esc(o.cliente||'Mostrador')+' · '+(itemsOf(o).length>1?itemsOf(o).length+' productos · ':'')+qty(unidades(o))+' u. · '+MEDIOS[o.medio]+' · '+when(o.ts)+'</div></span>'+
  '<span class="r"><span class="amt num"'+dead+'>'+m(o.total)+'</span>'+tag+'</span></button>'}
function listaVentas(d){
  const base=ventasBase(d),f=S.f,L=f.estado==='todas'?base:base.filter(o=>o.estado===f.estado);
  if(!L.length)return '<div class="empty"><b>'+(d.ventas.length?'No hay ventas con esos filtros':'Todavía no registraste ventas')+'</b>'+(d.ventas.length?'Probá con otro período o limpiá los filtros.':'Tocá el botón + para anotar la primera.')+'</div>';
  let h='<div class="list">',cur=null;
  L.forEach(o=>{const dk=D0(o.ts);if(dk!==cur){cur=dk;const dia=L.filter(x=>D0(x.ts)===dk&&valida(x));
    h+='</div><div class="day"><b>'+esc(dayName(o.ts))+'</b><span class="num">'+m(sum(dia,x=>x.total))+' · '+plural(dia.length,'operación','operaciones')+'</span></div><div class="list">'}
    h+=ventaRow(o)});
  return h+'</div>'}
function vVentas(d){
  const f=S.f,base=ventasBase(d),vs=base.filter(valida);
  const val={vendido:sum(vs,o=>o.total),cobrado:sum(vs,cobrado),porcobrar:sum(vs,porCobrarDe)}[S.vmetric];
  const lab={vendido:'Total vendido',cobrado:'Total cobrado',porcobrar:'Por cobrar'}[S.vmetric];
  const cnt=e=>e==='todas'?base.length:base.filter(o=>o.estado===e).length;
  const cats=[...new Set(d.ventas.flatMap(o=>itemsOf(o).map(i=>i.categoria)).filter(Boolean))].sort();
  const custom=f.desde||f.hasta;
  const sel=(id,opts,cur,ph)=>'<select class="inp" id="'+id+'" data-in="'+id+'"><option value="">'+ph+'</option>'+opts.map(o=>'<option value="'+esc(o[0])+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
  const nF=(f.medio?1:0)+(f.cat?1:0)+(custom?1:0);
  return '<div class="top"><h1>Ventas</h1><button class="pill-btn" data-a="nueva">'+ico('plus',18)+' Venta</button></div>'+
  '<section class="hero"><div class="per" role="group" aria-label="Período">'+['hoy','semana','mes','todo'].map(p=>'<button data-a="per" data-v="'+p+'" aria-pressed="'+(!custom&&f.per===p)+'">'+(p==='semana'?'Semana':PER[p])+'</button>').join('')+'</div>'+
  '<div><div class="lbl">'+lab+(custom?' · rango elegido':'')+'</div><div class="big num">'+m(val)+'</div><div class="sub">'+plural(vs.length,'operación válida','operaciones válidas')+'</div></div>'+
  '<div class="seg" role="group" aria-label="Indicador">'+[['vendido','Vendido'],['cobrado','Cobrado'],['porcobrar','Por cobrar']].map(x=>'<button data-a="vmetric" data-v="'+x[0]+'" aria-pressed="'+(S.vmetric===x[0])+'">'+x[1]+'</button>').join('')+'</div></section>'+
  '<div class="chips" role="group" aria-label="Estado">'+['todas','cobrada','pendiente','cancelada','devuelta'].map(e=>'<button class="chip" data-a="estado" data-v="'+e+'" aria-pressed="'+(f.estado===e)+'">'+(e==='todas'?'Todas':ESTADOS[e])+' <i>'+cnt(e)+'</i></button>').join('')+'</div>'+
  '<div class="search"><input class="inp" id="q" data-in="q" type="search" placeholder="Buscar por producto o cliente" value="'+esc(f.q)+'" autocomplete="off"><button class="icon-btn" data-a="filtros" aria-label="Filtros" aria-expanded="'+f.open+'" style="'+(nF?'color:var(--accent)':'')+'">'+ico('flt',20)+'</button></div>'+
  (f.open?'<div class="card" style="margin-top:10px"><div class="form"><div class="two"><div class="field"><label for="fmedio">Medio de pago</label>'+sel('fmedio',Object.entries(MEDIOS),f.medio,'Todos')+'</div>'+
    '<div class="field"><label for="fcat">Categoría</label>'+sel('fcat',cats.map(c=>[c,c]),f.cat,'Todas')+'</div></div>'+
    '<div class="two"><div class="field"><label for="fdesde">Desde</label><input class="inp" type="date" id="fdesde" data-in="fdesde" value="'+esc(f.desde)+'"></div><div class="field"><label for="fhasta">Hasta</label><input class="inp" type="date" id="fhasta" data-in="fhasta" value="'+esc(f.hasta)+'"></div></div>'+
    '<div class="btns"><button class="btn ghost" data-a="exp-ventas-f">Exportar estas ventas (CSV)</button><button class="btn sec2" data-a="limpiar">Limpiar filtros</button></div></div></div>':'')+
  '<div id="lista" style="margin-top:6px">'+listaVentas(d)+'</div>'}
function vDinero(d){
  const sal=saldos(d),pend=d.ventas.filter(o=>valida(o)&&porCobrarDe(o)>0);
  const all=movs(d),fl=S.dfilt,L=all.filter(x=>fl==='todos'||(fl==='ingresos'&&x.k==='cobro')||(fl==='gastos'&&(x.k==='gasto'||x.k==='retiro'))||(fl==='transf'&&x.k==='transf'));
  let h='<div class="top"><h1>Dinero</h1></div><div class="list">'+Object.keys(CUENTAS).map(k=>'<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><div class="k">'+CUENTAS[k]+'</div><div class="v num" style="margin:2px 0 0">'+m(sal[k])+'</div></div><span class="ava mv">'+ico(k==='efectivo'?'wal':'rec',20)+'</span></div>').join('')+'</div>'+
  '<button class="card tap" style="margin-top:12px" data-a="goventas" data-per="todo" data-estado="pendiente"><div class="k">Pendiente de cobro</div><div class="v num">'+m(sum(pend,porCobrarDe))+'</div><div class="s">'+plural(pend.length,'operación','operaciones')+' · no está en tus saldos hasta que lo cobres</div></button>'+
  '<div class="btns" style="margin-top:12px"><button class="btn ghost" data-a="gasto" data-v="gasto">Gasto</button><button class="btn ghost" data-a="gasto" data-v="retiro">Retiro personal</button><button class="btn ghost" data-a="transf">Pasar entre cuentas</button></div>'+
  '<div class="sec"><h2>Movimientos</h2><button data-a="saldos">Saldos iniciales</button></div>'+
  '<div class="chips" style="margin-top:0">'+[['todos','Todos'],['ingresos','Ingresos'],['gastos','Gastos y retiros'],['transf','Entre cuentas']].map(x=>'<button class="chip" data-a="dfilt" data-v="'+x[0]+'" aria-pressed="'+(fl===x[0])+'">'+x[1]+'</button>').join('')+'</div>';
  if(!L.length)return h+'<div class="empty"><b>Sin movimientos</b>Acá vas a ver cobros, gastos y pasajes entre cuentas.</div>';
  let cur=null;h+='<div class="list">';
  L.forEach(x=>{const dk=D0(x.ts);if(dk!==cur){cur=dk;const dia=L.filter(y=>D0(y.ts)===dk&&y.k!=='transf');const net=sum(dia,y=>y.k==='cobro'?y.monto:-y.monto);
    h+='</div><div class="day"><b>'+esc(dayName(x.ts))+'</b><span class="num">'+(dia.length?'Neto '+mS(net):'')+'</span></div><div class="list">'}
    h+=movRow(x)});
  return h+'</div>'}
function deltaTag(now,prev,lab){
  if(!prev&&!now)return '<span class="delta eq">Sin datos '+lab+'</span>';
  if(!prev)return '<span class="delta up">Nuevo '+lab+'</span>';
  const p=Math.round((now-prev)/prev*100);
  return '<span class="delta '+(p>0?'up':p<0?'dn':'eq')+'">'+(p>0?'+':'')+p+'% '+lab+'</span>'}
function bars(rows,max,emptyMsg){
  if(!rows.length)return '<p class="hint">'+emptyMsg+'</p>';
  return '<div class="bars">'+rows.map(r=>'<div class="br"><span class="nm">'+esc(r.n)+'</span><b class="num">'+m(r.total)+'</b><div class="track"><div class="fill" style="width:'+Math.max(3,Math.round(r.total/max*100))+'%"></div></div></div>').join('')+'</div>'}
function buckets(d){
  const now=Date.now(),out=[];
  if(S.span==='dias'){for(let i=13;i>=0;i--){const a=D0(addD(now,-i));out.push({a,b:a+DAY,l:String(new Date(a).getDate()),full:cap(new Date(a).toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'}).replace(/\./g,''))})}}
  else{for(let i=5;i>=0;i--){const a=mo0(now,-i);out.push({a,b:mo0(now,-i+1),l:cap(new Date(a).toLocaleDateString('es-AR',{month:'short'}).replace('.','')),full:cap(new Date(a).toLocaleDateString('es-AR',{month:'long',year:'numeric'}))})}}
  out.forEach(x=>{const s=stats(d,[x.a,x.b]);x.v={ventas:s.vendido,gastos:s.gastos,ganancia:s.ganancia}[S.evo]});return out}
const compact=c=>{const v=Math.abs(c)/100,s=c<0?'-':'';return s+(v>=1e6?(v/1e6).toFixed(1).replace('.',',')+' M':v>=1000?Math.round(v/1000)+' mil':String(Math.round(v)))};
function chart(bk){
  const W=560,H=190,L=46,R=8,T=10,B=26,col={ventas:'var(--accent)',gastos:'var(--c-gasto)',ganancia:'var(--ok)'}[S.evo];
  const vals=bk.map(b=>b.v),mx=Math.max(0,...vals),mn=Math.min(0,...vals);
  const step=(()=>{const span=(mx-mn)||100;const raw=span/3;const p=Math.pow(10,Math.floor(Math.log10(raw)));const f=raw/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p})();
  const top=Math.ceil(mx/step)*step||step,bot=Math.floor(mn/step)*step,y=v=>T+(top-v)/(top-bot)*(H-T-B);
  let s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Gráfico de '+S.evo+'">';
  for(let g=bot;g<=top+1;g+=step){s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(g)+'" y2="'+y(g)+'" style="stroke:var(--line)" stroke-width="1"/><text x="'+(L-6)+'" y="'+(y(g)+4)+'" text-anchor="end" font-size="11" style="fill:var(--muted)">'+compact(g)+'</text>'}
  const cw=(W-L-R)/bk.length,bw=Math.min(22,cw*.62),sel=S.sel<0?bk.length-1:S.sel,z=y(0);
  bk.forEach((b,i)=>{const cx=L+cw*i+cw/2,yy=y(b.v),h=Math.max(Math.abs(yy-z),b.v?2:0),yt=b.v>=0?z-h:z;
    s+='<rect x="'+(cx-bw/2)+'" y="'+yt+'" width="'+bw+'" height="'+h+'" rx="3" style="fill:'+col+'" fill-opacity="'+(i===sel?1:.4)+'"/>';
    if(bk.length<=6||i%2===(bk.length-1)%2)s+='<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" style="fill:var(--muted)">'+b.l+'</text>';
    s+='<rect x="'+(cx-cw/2)+'" y="0" width="'+cw+'" height="'+H+'" fill="transparent" data-a="bar" data-i="'+i+'" style="cursor:pointer"/>'});
  return s+'</svg>'}
function vStats(d){
  const r=rng(S.sp),pr=rng(S.sp,true),s=stats(d,r),p=stats(d,pr),lab={hoy:'vs ayer',semana:'vs semana anterior',mes:'vs mes anterior'}[S.sp];
  const disp=sum(Object.values(saldos(d)),x=>x);
  const med={};d.ventas.forEach(o=>{if(!valida(o))return;(o.cobros||[]).forEach(c=>{if(c.ts>=r[0]&&c.ts<r[1])med[c.medio]=(med[c.medio]||0)+c.monto})});
  const mrows=Object.keys(MEDIOS).filter(k=>med[k]).map(k=>({n:MEDIOS[k],total:med[k]})).sort((a,b)=>b.total-a.total);
  const prods=groupBy(s.vs,'producto').slice(0,5),cats=groupBy(s.vs,'categoria').slice(0,5);
  const bk=buckets(d),sel=S.sel<0?bk.length-1:S.sel,tot=sum(bk,b=>b.v);
  const ev={ventas:'Ventas',gastos:'Gastos',ganancia:'Ganancia estimada'}[S.evo];
  const ind=(k,v,sub,extra)=>'<div class="card"><div class="k">'+k+'</div><div class="v num">'+v+'</div>'+(extra||'')+'<div class="s">'+sub+'</div></div>';
  return '<div class="top"><h1>Estadísticas</h1></div>'+
  '<div class="seg light" role="group" aria-label="Período">'+['hoy','semana','mes'].map(x=>'<button data-a="sp" data-v="'+x+'" aria-pressed="'+(S.sp===x)+'">'+(x==='semana'?'Semana':PER[x])+'</button>').join('')+'</div>'+
  '<div class="ind" style="margin-top:12px">'+ind('Total vendido',m(s.vendido),'Ventas válidas del período',deltaTag(s.vendido,p.vendido,lab))+
  ind('Total cobrado',m(s.cob),'Dinero recibido por esas ventas')+ind('Por cobrar',m(s.porCobrar),'Lo que te deben de esas ventas')+
  ind('Gastos',m(s.gastos),s.retiros?'Sin contar retiros personales ('+m(s.retiros)+')':'Pagos y egresos registrados')+
  ind('Ganancia estimada',m(s.ganancia),s.sinCosto?'Faltan costos en '+plural(s.sinCosto,'venta','ventas')+': puede estar sobreestimada':'Ventas menos costos y gastos')+
  ind('Dinero disponible',m(disp),'Saldo total de tus cuentas ahora')+'</div>'+
  '<div class="row2"><div class="card"><div class="k">Operaciones</div><div class="v num">'+s.ops+'</div></div><div class="card"><div class="k">Ticket promedio</div><div class="v num">'+m(s.ticket)+'</div></div></div>'+
  '<div class="sec"><h2>Cobrado por medio de pago</h2></div><div class="card">'+bars(mrows,Math.max(1,...mrows.map(x=>x.total)),'Todavía no cobraste nada en este período.')+'</div>'+
  '<div class="sec"><h2>Más vendidos</h2></div><div class="card"><div class="lab" style="margin-bottom:8px">Productos</div>'+bars(prods,Math.max(1,...prods.map(x=>x.total)),'Sin ventas en este período.')+
  (cats.length?'<div class="lab" style="margin:14px 0 8px">Categorías</div>'+bars(cats,Math.max(1,...cats.map(x=>x.total)),''):'')+'</div>'+
  '<div class="sec"><h2>Evolución</h2></div><div class="card"><div class="seg light" role="group" aria-label="Serie">'+[['ventas','Ventas'],['gastos','Gastos'],['ganancia','Ganancia']].map(x=>'<button data-a="evo" data-v="'+x[0]+'" aria-pressed="'+(S.evo===x[0])+'">'+x[1]+'</button>').join('')+'</div>'+
  '<div class="chips" style="margin-top:10px">'+[['dias','Últimos 14 días'],['meses','Últimos 6 meses']].map(x=>'<button class="chip" data-a="span" data-v="'+x[0]+'" aria-pressed="'+(S.span===x[0])+'">'+x[1]+'</button>').join('')+'</div>'+
  '<div class="chart-wrap">'+chart(bk)+'</div><div class="cap"><b>'+esc(bk[sel].full)+'</b> · '+ev+' '+m(bk[sel].v)+' &nbsp;|&nbsp; Total del gráfico '+m(tot)+'</div></div>'}
function vAjustes(d){
  const pin=hasPin();
  const row=(a,t,s)=>'<button class="btn sec2" data-a="'+a+'"><span>'+t+(s?'<br><small style="color:var(--muted);font-weight:500">'+s+'</small>':'')+'</span><span style="color:var(--accent)">›</span></button>';
  return '<div class="top"><div style="display:flex;align-items:center;gap:10px"><button class="icon-btn" data-a="tab" data-v="inicio" aria-label="Volver">'+ico('back')+'</button><h1>Ajustes</h1></div></div>'+
  '<div class="sec" style="margin-top:6px"><h2>Seguridad</h2></div><div class="set">'+(pin?row('pin-change','Cambiar PIN','Pide el PIN al abrir y después de un rato sin usar la app')+row('pin-off','Quitar PIN'):row('pin-on','Proteger con PIN','Bloqueo de 4 dígitos en este dispositivo'))+'</div>'+
  '<div class="sec"><h2>Exportar</h2></div><div class="set">'+row('exp-ventas','Ventas a Excel (CSV)','Todas las ventas, una fila por operación')+row('exp-movs','Movimientos de dinero (CSV)','Cobros, gastos, retiros y pasajes entre cuentas')+'</div>'+
  '<div class="sec"><h2>Copia de seguridad</h2></div><div class="set">'+row('backup','Descargar copia (JSON)','Ventas, gastos, movimientos y saldos')+row('restore','Restaurar desde una copia')+'</div><input type="file" id="restoref" accept=".json,application/json" hidden>'+
  '<div class="sec"><h2>Cuentas</h2></div><div class="set">'+row('saldos','Saldos iniciales','Lo que tenías en efectivo, banco y billetera al empezar')+'</div>'+'<div class="sec"><h2>Sesión</h2></div><div class="set">'+row('logout','Cerrar sesión',esc(USER_EMAIL))+'</div>'+
  '<div class="sec"><h2>Historial de modificaciones</h2></div>'+
  (S.bitacora.length&&!d.demo?'<div class="card"><ul class="hist">'+S.bitacora.map(b=>'<li><b style="color:var(--ink)">'+fFull(b.ts)+'</b> · '+esc(b.msg)+'</li>').join('')+'</ul></div>':'<div class="empty"><b>Sin cambios importantes</b>Ediciones, cancelaciones, devoluciones y eliminaciones quedan anotadas acá.</div>')+
  (S.demoHidden&&!S.ventas.length?'<div class="set" style="margin-top:16px">'+row('showdemo','Mostrar datos de ejemplo')+'</div>':'')+
  '<p class="hint" style="margin-top:18px">'+(S.usingDb?'Tus datos se guardan en Supabase y se actualizan en todos tus dispositivos.':'Tus datos se guardan solo en este navegador. Descargá una copia de seguridad de vez en cuando.')+'</p>'}

/* ---------- hojas (formularios y detalle) ---------- */
const cloneV=o=>JSON.parse(JSON.stringify(o));
const findV=id=>D().ventas.find(o=>o.id===id);
const inputNum=c=>c?String(c/100).replace('.',','):'';
const val=id=>{const e=document.getElementById(id);return e?e.value:''};
function toast(msg){const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2800)}
function lockScroll(on){const v=on?'hidden':'';document.documentElement.style.overflow=v;document.body.style.overflow=v}
function closeSheet(){S.sheet=null;$('#layer').innerHTML='';lockScroll(false)}
const head=(t)=>'<div class="sh-top"><h2>'+t+'</h2><button class="icon-btn" data-a="close" aria-label="Cerrar">'+ico('x',20)+'</button></div>';
const chipsOf=(grp,opts,cur)=>'<div class="opts" role="group" data-grp="'+grp+'">'+opts.map(o=>'<button type="button" class="chip" data-a="pick" data-v="'+o[0]+'" aria-pressed="'+(o[0]===cur)+'">'+o[1]+'</button>').join('')+'</div>';
const grpVal=g=>{const e=document.querySelector('[data-grp="'+g+'"] [aria-pressed="true"]');return e?e.dataset.v:''};
const blankItem=()=>({producto:'',cantidad:'1',precio:'',costo:'',categoria:''});
function openSheet(sh){
  const f={detalle:shDetalle,venta:shVenta,cobro:shCobro,gasto:shGasto,transf:shTransf,saldos:shSaldos,confirm:shConfirm}[sh.type];
  const prev=document.querySelector('.sheet'),top=prev?prev.scrollTop:0;
  if(sh.type==='venta'&&!sh.items){const old=sh.id?findV(sh.id):null;
    sh.items=old?itemsOf(old).map(i=>({producto:i.producto||'',cantidad:qty(i.cantidad),precio:inputNum(i.precio),costo:inputNum(i.costo),categoria:i.categoria||''})):[blankItem()]}
  S.sheet=sh;
  const html=f(sh);if(html==null){closeSheet();return}
  $('#layer').innerHTML='<div class="scrim" data-a="scrim"><div class="sheet'+(sh.type==='venta'?' fx':'')+(prev?' noanim':'')+'" role="dialog" aria-modal="true">'+html+'</div></div>';
  lockScroll(true);
  if(prev&&sh.type==='detalle')document.querySelector('.sheet').scrollTop=top;
  if(sh.type==='venta'){calcTotal();if(!sh.id&&window.matchMedia&&matchMedia('(hover:hover)').matches)setTimeout(()=>{const e=document.querySelector('.i-prod');if(e)e.focus({preventScroll:true})},60)}}
function readItems(){return [...document.querySelectorAll('#items .itm')].map(r=>({producto:r.querySelector('.i-prod').value,cantidad:r.querySelector('.i-cant').value,precio:r.querySelector('.i-precio').value,costo:r.querySelector('.i-costo').value,categoria:r.querySelector('.i-cat').value}))}
function calcTotal(){let t=0;const rows=document.querySelectorAll('#items .itm');
  rows.forEach(r=>{const c=parseAR(r.querySelector('.i-cant').value),p=parseAR(r.querySelector('.i-precio').value);const s=(isFinite(c)&&isFinite(p))?Math.round(c*toC(p)):0;t+=s;const e=r.querySelector('.i-sub');if(e)e.textContent=m(s)});
  const el=$('#v-total');if(el)el.textContent=m(t);const tl=$('#v-tl');if(tl)tl.textContent=rows.length>1?'Total · '+rows.length+' productos':'Total'}
function drawItems(){const box=$('#items');if(!box)return;box.innerHTML=itemsHtml(S.sheet.items);calcTotal()}
function shDetalle(sh){
  const o=findV(sh.id);if(!o)return null;
  const cob=cobrado(o),pc=porCobrarDe(o),par=o.estado==='pendiente'&&cob>0,its=itemsOf(o);
  const tag=par?'<span class="tag parcial">Parcial</span>':'<span class="tag '+o.estado+'">'+ESTADOS[o.estado]+'</span>';
  const kv=(k,v)=>v?'<dt>'+k+'</dt><dd>'+v+'</dd>':'';
  let h=head(esc(o.producto))+'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div class="num" style="font-size:32px;font-weight:800">'+m(o.total)+'</div>'+tag+'</div>';
  if(o.demo)h+='<div class="banner"><span>Esto es un ejemplo. Registrá tu primera venta con el botón +.</span></div>';
  h+='<div class="card"><dl class="kv" style="margin:0">'+kv('Cliente',esc(o.cliente||'Mostrador'))+kv('Fecha',fDia(o.ts)+' · '+fHora(o.ts))+kv('Medio de pago',MEDIOS[o.medio])+kv('Cobrado',m(cob))+(pc?kv('Por cobrar','<b class="neg">'+m(pc)+'</b>'):'')+kv('Notas',esc(o.notas))+'</dl></div>';
  h+='<div class="sec" style="margin-top:16px"><h2 style="font-size:16px">Productos ('+its.length+')</h2></div><div class="card"><ul class="hist its">'+its.map(it=>'<li class="itl"><span class="mid"><b>'+esc(it.producto)+'</b><small>'+qty(it.cantidad)+' × '+m(it.precio)+(it.categoria?' · '+esc(it.categoria):'')+(it.costo?' · costo '+m(it.costo):'')+'</small></span><b class="num">'+m(itTotal(it))+'</b></li>').join('')+'</ul></div>';
  if((o.cobros||[]).length&&valida(o))h+='<div class="sec" style="margin-top:16px"><h2 style="font-size:16px">Cobros</h2></div><div class="card"><ul class="hist">'+o.cobros.map(c=>'<li><b class="pos num">'+m(c.monto)+'</b> · '+MEDIOS[c.medio]+' · '+fFull(c.ts)+'</li>').join('')+'</ul></div>';
  if(!valida(o)&&(o.cobros||[]).length)h+='<p class="hint" style="margin-top:10px">Los cobros de esta venta no suman a tus saldos porque está '+ESTADOS[o.estado].toLowerCase()+'.</p>';
  if((o.hist||[]).length)h+='<div class="sec" style="margin-top:16px"><h2 style="font-size:16px">Historial</h2></div><div class="card"><ul class="hist">'+o.hist.slice().reverse().map(x=>'<li><b style="color:var(--ink)">'+fFull(x.ts)+'</b> · '+esc(x.m)+'</li>').join('')+'</ul></div>';
  if(o.demo)return h;
  h+='<div class="btns" style="margin-top:16px">';
  if(o.estado==='pendiente')h+='<button class="btn" data-a="cobrar" data-id="'+esc(o.id)+'">Registrar cobro</button>';
  h+='<button class="btn sec2" data-a="editar" data-id="'+esc(o.id)+'">Editar</button>';
  if(o.estado==='cobrada')h+='<button class="btn sec2" data-a="devolver" data-id="'+esc(o.id)+'">Devolver</button>';
  if(valida(o))h+='<button class="btn sec2" data-a="cancelar" data-id="'+esc(o.id)+'">Cancelar venta</button>';
  h+='<button class="btn ghost" data-a="eliminar" data-id="'+esc(o.id)+'">Eliminar</button></div>';
  return h}
function itemHtml(it,i,n){
  const id=x=>x+'-'+i;
  return '<div class="itm" data-i="'+i+'">'+
  (n>1?'<div class="itm-h"><b>Producto '+(i+1)+'</b><button type="button" class="link" data-a="rm-item" data-i="'+i+'">Quitar</button></div>':'')+
  '<div class="field"><label for="'+id('ip')+'">Producto</label><input class="inp i-prod" id="'+id('ip')+'" list="dl-prod" autocomplete="off" placeholder="Ej: Buzo canguro" value="'+esc(it.producto)+'"></div>'+
  '<div class="two"><div class="field"><label for="'+id('ic')+'">Cantidad</label><div class="stepper"><button type="button" data-a="step" data-d="-1" aria-label="Menos">−</button><input class="i-cant" id="'+id('ic')+'" data-in="calc" inputmode="decimal" value="'+esc(it.cantidad)+'"><button type="button" data-a="step" data-d="1" aria-label="Más">+</button></div></div>'+
  '<div class="field"><label for="'+id('ipr')+'">Precio unitario ($)</label><input class="inp i-precio" id="'+id('ipr')+'" data-in="calc" inputmode="decimal" placeholder="0" value="'+esc(it.precio)+'"></div></div>'+
  (n>1?'<div class="itm-sub"><span>Subtotal</span><b class="num i-sub">$ 0</b></div>':'')+
  '<details'+((it.costo||it.categoria)?' open':'')+'><summary>Costo y categoría (opcional)</summary><div class="two" style="margin-top:10px"><div class="field"><label for="'+id('ico')+'">Costo unitario ($)</label><input class="inp i-costo" id="'+id('ico')+'" inputmode="decimal" placeholder="Para calcular ganancia" value="'+esc(it.costo)+'"></div><div class="field"><label for="'+id('ik')+'">Categoría</label><input class="inp i-cat" id="'+id('ik')+'" list="dl-cat" autocomplete="off" value="'+esc(it.categoria)+'"></div></div></details></div>'}
const itemsHtml=items=>items.map((it,i)=>itemHtml(it,i,items.length)).join('');
function shVenta(sh){
  const old=sh.id?findV(sh.id):null,V=S.ventas;
  const uniqI=k=>[...new Set(V.flatMap(o=>itemsOf(o).map(i=>(i[k]||'').trim())).filter(Boolean))];
  const uniqC=[...new Set(V.map(o=>(o.cliente||'').trim()).filter(Boolean))];
  const last=V.slice().sort((a,b)=>b.ts-a.ts)[0];
  const o=old||{ts:Date.now(),cliente:'',medio:last?last.medio:'efectivo',estado:'cobrada',notas:''};
  const dl=(id,a)=>'<datalist id="'+id+'">'+a.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist>';
  const estados=old?Object.entries(ESTADOS):[['cobrada','Cobrada'],['pendiente','Pendiente']];
  return head(old?'Editar venta':'Nueva venta')+'<div class="form">'+
  '<div id="items" class="form">'+itemsHtml(sh.items)+'</div>'+
  '<button type="button" class="btn ghost" data-a="add-item">+ Agregar otro producto</button>'+
  '<div class="field"><label for="v-cli">Cliente</label><input class="inp" id="v-cli" list="dl-cli" autocomplete="off" placeholder="Nombre (vacío = Mostrador)" value="'+esc(o.cliente)+'"></div>'+
  '<div class="field"><span class="lab">Medio de pago</span>'+chipsOf('medio',Object.entries(MEDIOS),o.medio)+'</div>'+
  '<div class="field"><span class="lab">Estado</span>'+chipsOf('estado',estados,o.estado)+'</div>'+
  '<div class="field"><label for="v-ts">Fecha y hora</label><input class="inp" type="datetime-local" id="v-ts" value="'+toInput(o.ts)+'"></div>'+
  '<div class="field"><label for="v-notas">Notas (opcional)</label><textarea class="inp" id="v-notas" rows="2" placeholder="Talle, color, entrega…">'+esc(o.notas)+'</textarea></div>'+
  dl('dl-prod',uniqI('producto'))+dl('dl-cli',uniqC)+dl('dl-cat',uniqI('categoria'))+'</div>'+
  '<div class="sh-foot"><div class="total"><span id="v-tl">Total</span><b class="num" id="v-total">$ 0</b></div><div class="err" id="v-err" role="alert"></div><button class="btn" data-a="save-venta">'+(old?'Guardar cambios':'Guardar venta')+'</button></div>'}
async function saveV(o,msg){const now=Date.now();o.upd=now;o.hist=(o.hist||[]).concat([{ts:now,m:msg}]).slice(-30);await put('ventas',o.id,o)}
async function doSaveVenta(){
  const sh=S.sheet,old=sh.id?cloneV(findV(sh.id)):null,err=t=>{$('#v-err').textContent=t};
  const raw=readItems(),multi=raw.length>1,its=[];
  for(let i=0;i<raw.length;i++){
    const r=raw[i],E=t=>err(multi?'Producto '+(i+1)+': '+t:cap(t));
    const producto=r.producto.trim(),cant=parseAR(r.cantidad),pr=parseAR(r.precio),cs=r.costo.trim(),costo=cs?parseAR(cs):0;
    if(!producto)return E('escribí qué vendiste.');
    if(!(cant>0))return E('la cantidad tiene que ser mayor a 0.');
    if(!(pr>=0)||isNaN(pr))return E('ingresá el precio unitario.');
    if(cs&&!(costo>=0))return E('el costo no es válido.');
    its.push({producto,categoria:r.categoria.trim(),cantidad:cant,precio:toC(pr),costo:cs?toC(costo):0})}
  let ts=new Date(val('v-ts')).getTime();if(!isFinite(ts))ts=Date.now();
  const medio=grpVal('medio')||'efectivo',estado=grpVal('estado')||'cobrada';
  const total=sum(its,itTotal),resumen=its[0].producto+(its.length>1?' + '+(its.length-1)+' más':'');
  const o=Object.assign({},old||{id:newId(),cobros:[],hist:[]},{ts,cliente:val('v-cli').trim(),items:its,producto:resumen,categoria:its[0].categoria,cantidad:sum(its,i=>i.cantidad),precio:its.length===1?its[0].precio:0,costo:its.length===1?its[0].costo:0,total,medio,estado,notas:val('v-notas').trim()});
  const oc=(old&&old.cobros)||[];
  if(estado==='cobrada'){if(old&&old.estado==='cobrada'&&oc.length===1)o.cobros=[{monto:total,medio,ts:oc[0].ts}];else if(old&&old.estado==='pendiente'){const r=total-sum(oc,c=>c.monto);o.cobros=r>0?oc.concat([{monto:r,medio,ts:Date.now()}]):oc}else o.cobros=[{monto:total,medio,ts:Math.min(ts,Date.now())}]}
  else if(estado==='pendiente'){o.cobros=(old&&(old.estado==='pendiente'||old.estado==='cancelada'))?oc:[];if(sum(o.cobros,c=>c.monto)>=total&&o.cobros.length)o.estado='cobrada'}
  else o.cobros=oc;
  let msg='Venta creada';
  if(old){const ch=[],key=a=>JSON.stringify(a.map(i=>[i.producto,i.cantidad,i.precio]));
    if(old.total!==o.total)ch.push('total '+m(old.total)+' → '+m(o.total));if(old.estado!==o.estado)ch.push('estado '+ESTADOS[old.estado]+' → '+ESTADOS[o.estado]);
    if(key(itemsOf(old))!==key(its))ch.push('productos');if((old.cliente||'')!==o.cliente)ch.push('cliente');if(old.medio!==o.medio)ch.push('medio de pago');if(old.ts!==o.ts)ch.push('fecha');
    msg='Editada'+(ch.length?': '+ch.join(', '):'')}
  try{await saveV(o,msg);if(old&&(old.total!==o.total||old.estado!==o.estado))await log('Venta "'+o.producto+'" '+msg.toLowerCase());
    closeSheet();toast(old?'Cambios guardados':'Venta guardada');
  }catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shCobro(sh){const o=findV(sh.id);if(!o)return null;const pc=porCobrarDe(o);
  return head('Registrar cobro')+'<p class="hint" style="margin:-6px 0 14px">'+esc(o.producto)+' · '+esc(o.cliente||'Mostrador')+'. Falta cobrar <b class="num">'+m(pc)+'</b>.</p><div class="form">'+
  '<div class="field"><label for="c-monto">Monto recibido ($)</label><input class="inp" id="c-monto" inputmode="decimal" value="'+inputNum(pc)+'"></div>'+
  '<div class="field"><span class="lab">Medio de pago</span>'+chipsOf('medio',Object.entries(MEDIOS),o.medio)+'</div>'+
  '<div class="err" id="c-err" role="alert"></div><button class="btn" data-a="save-cobro">Registrar cobro</button></div>'}
async function doSaveCobro(){
  const id=S.sheet.id,o=cloneV(findV(id)),err=t=>{$('#c-err').textContent=t},pc=porCobrarDe(o),monto=toC(parseAR(val('c-monto')));
  if(!(monto>0))return err('Ingresá el monto que recibiste.');
  if(monto>pc)return err('Es más de lo que falta cobrar ('+m(pc)+').');
  const medio=grpVal('medio')||o.medio;o.cobros=(o.cobros||[]).concat([{monto,medio,ts:Date.now()}]);
  if(cobrado(o)>=o.total)o.estado='cobrada';
  try{await saveV(o,'Cobro de '+m(monto)+' ('+MEDIOS[medio]+')');closeSheet();toast('Cobro registrado')}catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shGasto(sh){
  const g=sh.id?D().gastos.find(x=>x.id===sh.id):null,tipo=g?g.tipo:sh.tipo,rt=tipo==='retiro';
  const o=g||{ts:Date.now(),concepto:rt?'Retiro personal':'',monto:0,cuenta:'efectivo',notas:''};
  return head(g?'Editar '+(rt?'retiro':'gasto'):(rt?'Retiro personal':'Nuevo gasto'))+'<div class="form">'+
  '<div class="field"><label for="g-con">Concepto</label><input class="inp" id="g-con" autocomplete="off" placeholder="'+(rt?'Ej: Retiro personal':'Ej: Flete, bolsas, alquiler')+'" value="'+esc(o.concepto)+'"></div>'+
  '<div class="field"><label for="g-monto">Monto ($)</label><input class="inp" id="g-monto" inputmode="decimal" value="'+inputNum(o.monto)+'"></div>'+
  '<div class="field"><span class="lab">Salió de</span>'+chipsOf('cuenta',Object.entries(CUENTAS),o.cuenta)+'</div>'+
  '<div class="field"><label for="g-ts">Fecha y hora</label><input class="inp" type="datetime-local" id="g-ts" value="'+toInput(o.ts)+'"></div>'+
  '<div class="field"><label for="g-notas">Notas (opcional)</label><input class="inp" id="g-notas" value="'+esc(o.notas)+'"></div>'+
  '<div class="err" id="g-err" role="alert"></div><button class="btn" data-a="save-gasto">Guardar</button>'+(g?'<button class="btn ghost" data-a="del-gasto">Eliminar</button>':'')+'</div>'}
async function doSaveGasto(){
  const sh=S.sheet,old=sh.id?D().gastos.find(x=>x.id===sh.id):null,tipo=old?old.tipo:sh.tipo,err=t=>{$('#g-err').textContent=t};
  const concepto=val('g-con').trim(),monto=toC(parseAR(val('g-monto')));
  if(!concepto)return err('Escribí el concepto.');if(!(monto>0))return err('Ingresá el monto.');
  let ts=new Date(val('g-ts')).getTime();if(!isFinite(ts))ts=Date.now();
  try{await put('gastos',old?old.id:newId(),{ts,tipo,concepto,monto,cuenta:grpVal('cuenta')||'efectivo',notas:val('g-notas').trim()});
    if(old&&old.monto!==monto)await log((tipo==='retiro'?'Retiro':'Gasto')+' "'+concepto+'" editado: '+m(old.monto)+' → '+m(monto));
    closeSheet();toast('Guardado')}catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shTransf(sh){
  const t=sh.id?D().transf.find(x=>x.id===sh.id):null,o=t||{ts:Date.now(),desde:'efectivo',hasta:'banco',monto:0,notas:''};
  return head(t?'Editar pasaje':'Pasar entre cuentas')+'<div class="form">'+
  '<div class="field"><span class="lab">De</span>'+chipsOf('desde',Object.entries(CUENTAS),o.desde)+'</div>'+
  '<div class="field"><span class="lab">A</span>'+chipsOf('hasta',Object.entries(CUENTAS),o.hasta)+'</div>'+
  '<div class="field"><label for="t-monto">Monto ($)</label><input class="inp" id="t-monto" inputmode="decimal" value="'+inputNum(o.monto)+'"></div>'+
  '<div class="field"><label for="t-ts">Fecha y hora</label><input class="inp" type="datetime-local" id="t-ts" value="'+toInput(o.ts)+'"></div>'+
  '<div class="err" id="t-err" role="alert"></div><button class="btn" data-a="save-transf">Guardar</button>'+(t?'<button class="btn ghost" data-a="del-transf">Eliminar</button>':'')+'</div>'}
async function doSaveTransf(){
  const sh=S.sheet,old=sh.id?D().transf.find(x=>x.id===sh.id):null,err=t=>{$('#t-err').textContent=t};
  const desde=grpVal('desde'),hasta=grpVal('hasta'),monto=toC(parseAR(val('t-monto')));
  if(desde===hasta)return err('Elegí dos cuentas distintas.');if(!(monto>0))return err('Ingresá el monto.');
  let ts=new Date(val('t-ts')).getTime();if(!isFinite(ts))ts=Date.now();
  try{await put('transf',old?old.id:newId(),{ts,desde,hasta,monto,notas:''});closeSheet();toast('Guardado')}catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shSaldos(){const s=(D().config.saldos)||{};
  return head('Saldos iniciales')+'<p class="hint" style="margin:-6px 0 14px">Cargá lo que tenías en cada cuenta antes de empezar a usar ARGYR. Las ventas cobradas y los gastos se suman y restan desde ahí.</p><div class="form">'+
  Object.keys(CUENTAS).map(k=>'<div class="field"><label for="s-'+k+'">'+CUENTAS[k]+' ($)</label><input class="inp" id="s-'+k+'" inputmode="decimal" value="'+inputNum(s[k])+'"></div>').join('')+
  '<div class="err" id="s-err" role="alert"></div><button class="btn" data-a="save-saldos">Guardar saldos</button></div>'}
async function doSaveSaldos(){
  const saldos={};for(const k in CUENTAS){const v=val('s-'+k).trim();const n=v?parseAR(v):0;if(isNaN(n)){$('#s-err').textContent='Revisá el monto de '+CUENTAS[k]+'.';return}saldos[k]=toC(n)}
  try{await put('meta','config',Object.assign({},S.config,{saldos}));await log('Saldos iniciales actualizados');closeSheet();toast('Saldos guardados')}catch(e){$('#s-err').textContent='No se pudo guardar. Probá de nuevo.'}}
function shConfirm(sh){return head(esc(sh.title))+'<p style="margin:0 0 16px">'+esc(sh.msg)+'</p><div class="btns"><button class="btn sec2" data-a="close">Volver</button><button class="btn '+(sh.danger?'danger':'')+'" data-a="confirm-yes">'+esc(sh.yes)+'</button></div>'}
function confirmar(title,msg,yes,fn,danger){openSheet({type:'confirm',title,msg,yes,fn,danger})}
/* ---------- PIN ---------- */
let PAD=null,lockUntil=0,fails=0;
const hasPin=()=>{try{return !!localStorage.getItem('argyr:pin')}catch(e){return false}};
async function hashPin(pin,salt){try{const b=new TextEncoder().encode(salt+':'+pin),h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){let x=5381;for(const c of salt+':'+pin)x=((x<<5)+x+c.charCodeAt(0))|0;return 'f'+x}}
async function checkPin(pin){try{const j=JSON.parse(localStorage.getItem('argyr:pin'));return (await hashPin(pin,j.salt))===j.hash}catch(e){return false}}
async function savePin(pin){const salt=newId();localStorage.setItem('argyr:pin',JSON.stringify({salt,hash:await hashPin(pin,salt)}))}
function padDraw(err){const o=PAD.o,b=PAD.buf;
  $('#lockbox').innerHTML='<div class="lock" role="dialog" aria-modal="true"><div class="brand" style="color:#fff;opacity:.8">ARGYR</div><h2>'+esc(o.title)+'</h2><p role="alert">'+esc(err||o.sub||'')+'</p><div class="dots" aria-hidden="true">'+[0,1,2,3].map(i=>'<i class="'+(i<b.length?'on':'')+'"></i>').join('')+'</div><div class="pad">'+
  [1,2,3,4,5,6,7,8,9].map(n=>'<button data-a="pk" data-v="'+n+'">'+n+'</button>').join('')+'<button class="x" data-a="pk" data-v="c">Borrar</button><button data-a="pk" data-v="0">0</button><span></span></div>'+(o.cancel?'<button class="cancel" data-a="pcancel">Cancelar</button>':'')+'</div>'}
function pinPad(o){PAD={o,buf:''};padDraw()}
async function padKey(v){
  if(!PAD||PAD.busy)return;
  if(v==='c')PAD.buf=PAD.buf.slice(0,-1);else if(PAD.buf.length<4)PAD.buf+=v;
  padDraw();if(PAD.buf.length<4)return;
  PAD.busy=true;const pin=PAD.buf,r=await PAD.o.done(pin);
  if(r&&r.ok){const after=r.after;PAD=null;$('#lockbox').innerHTML='';if(after)after();return}
  PAD.busy=false;PAD.buf='';if(r&&r.next)PAD.o=r.next;padDraw(r&&r.err)}
function padSetFlow(onDone){return {title:'Elegí un PIN',sub:'4 dígitos',cancel:true,done:async p1=>({next:{title:'Repetí el PIN',sub:'Para confirmarlo',cancel:true,done:async p2=>{
  if(p2!==p1)return {err:'No coincide. Empezá de nuevo.',next:padSetFlow(onDone)};
  await savePin(p2);return {ok:true,after:onDone}}}})}}
function verifyFlow(title,next){return {title,sub:'Ingresá tu PIN actual',cancel:true,done:async p=>{
  if(Date.now()<lockUntil)return {err:'Esperá unos segundos y probá de nuevo.'};
  if(await checkPin(p)){fails=0;return next()}
  if(++fails>=5){lockUntil=Date.now()+30000;fails=0;return {err:'Demasiados intentos. Esperá 30 segundos.'}}return {err:'PIN incorrecto'}}}}
function lockApp(){if(!hasPin()||PAD)return;
  pinPad({title:'ARGYR bloqueada',sub:'Ingresá tu PIN',cancel:false,done:async p=>{
    if(Date.now()<lockUntil)return {err:'Esperá unos segundos y probá de nuevo.'};
    if(await checkPin(p)){fails=0;return {ok:true}}
    if(++fails>=5){lockUntil=Date.now()+30000;fails=0;return {err:'Demasiados intentos. Esperá 30 segundos.'}}return {err:'PIN incorrecto'}}})}
/* ---------- exportar y copias ---------- */
const csvCell=v=>{v=String(v==null?'':v);return /[;"\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const csvNum=c=>String(c/100).replace('.',',');
const csv=rows=>'﻿'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
const fDate=t=>new Date(t).toLocaleDateString('es-AR');
async function saveFile(filename,data){
  try{const type=filename.endsWith('.json')?'application/json':'text/csv;charset=utf-8';
    const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Archivo listo')}
  catch(e){toast('No se pudo guardar el archivo.')}}
const stamp=()=>toDateInput(Date.now());
function ventasCsv(list){const rows=[['N° venta','Fecha','Hora','Cliente','Producto','Categoría','Cantidad','Precio unitario','Subtotal','Total venta','Cobrado','Por cobrar','Medio de pago','Estado','Costo unitario','Notas']];
  list.slice().sort((a,b)=>a.ts-b.ts).forEach((o,k)=>itemsOf(o).forEach((it,j)=>rows.push([k+1,fDate(o.ts),fHora(o.ts),o.cliente||'Mostrador',it.producto,it.categoria||'',String(it.cantidad).replace('.',','),csvNum(it.precio),csvNum(itTotal(it)),j===0?csvNum(o.total):'',j===0?csvNum(cobrado(o)):'',j===0?csvNum(porCobrarDe(o)):'',MEDIOS[o.medio],ESTADOS[o.estado],it.costo?csvNum(it.costo):'',j===0?(o.notas||''):''])));
  return csv(rows)}
function realData(){return S.ventas.length||S.gastos.length||S.transf.length||Object.keys(S.config).length}
async function pool(items,fn,n){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){await fn(items[i++])}}))}
async function restoreFile(file){
  let j;try{j=JSON.parse(await file.text())}catch(e){toast('El archivo no es una copia válida.');return}
  if(!j||j.app!=='ARGYR'||!Array.isArray(j.ventas)){toast('El archivo no es una copia de ARGYR.');return}
  const g=Array.isArray(j.gastos)?j.gastos:[],t=Array.isArray(j.transf)?j.transf:[];
  confirmar('Restaurar copia','La copia tiene '+plural(j.ventas.length,'venta','ventas')+', '+plural(g.length,'gasto o retiro','gastos y retiros')+' y '+plural(t.length,'pasaje','pasajes')+'. Se agregan o actualizan sin borrar lo que ya tenés.','Restaurar',async()=>{
    try{const jobs=[].concat(j.ventas.map(x=>['ventas',x]),g.map(x=>['gastos',x]),t.map(x=>['transf',x]));
      await pool(jobs,async([c,x])=>{if(x&&x.id)await put(c,x.id,x)},4);
      if(j.config&&typeof j.config==='object'){const cf=Object.assign({},j.config);delete cf.id;await put('meta','config',cf)}
      await log('Copia de seguridad restaurada');toast('Copia restaurada')}catch(e){toast('No se pudo restaurar todo. Probá de nuevo.')}})}
/* ---------- eventos ---------- */
function demoBlock(){if(D().demo){toast('Es un ejemplo. Registrá tu primera venta para empezar.');return true}return false}
document.addEventListener('click',async ev=>{
  const el=ev.target.closest('[data-a]');if(!el)return;const a=el.dataset.a,v=el.dataset.v,id=el.dataset.id;
  if(a==='scrim'){if(ev.target===el)closeSheet();return}
  switch(a){
  case 'tab':S.tab=v;closeSheet();window.scrollTo(0,0);render();break;
  case 'nueva':openSheet({type:'venta'});break;
  case 'hidedemo':S.demoHidden=true;try{localStorage.setItem('argyr:demoHidden','1')}catch(e){}render();break;
  case 'showdemo':S.demoHidden=false;try{localStorage.removeItem('argyr:demoHidden')}catch(e){}S.tab='inicio';render();break;
  case 'goventas':S.tab='ventas';S.f.per=el.dataset.per;S.f.estado=el.dataset.estado||'todas';S.f.desde=S.f.hasta='';S.f.q='';window.scrollTo(0,0);render();break;
  case 'per':S.f.per=v;S.f.desde=S.f.hasta='';render();break;
  case 'vmetric':S.vmetric=v;render();break;
  case 'estado':S.f.estado=v;render();break;
  case 'filtros':S.f.open=!S.f.open;render();break;
  case 'limpiar':Object.assign(S.f,{estado:'todas',per:'mes',q:'',medio:'',cat:'',desde:'',hasta:''});render();break;
  case 'dfilt':S.dfilt=v;render();break;
  case 'sp':S.sp=v;render();break;
  case 'evo':S.evo=v;render();break;
  case 'span':S.span=v;S.sel=-1;render();break;
  case 'bar':S.sel=+el.dataset.i;render();break;
  case 'venta':openSheet({type:'detalle',id});break;
  case 'mov':
    if(el.dataset.k==='cobro')openSheet({type:'detalle',id});
    else if(demoBlock())break;
    else if(el.dataset.k==='transf')openSheet({type:'transf',id});else openSheet({type:'gasto',id});break;
  case 'gasto':openSheet({type:'gasto',tipo:v});break;
  case 'transf':openSheet({type:'transf'});break;
  case 'saldos':openSheet({type:'saldos'});break;
  case 'close':closeSheet();break;
  case 'pick':{const grp=el.closest('[data-grp]');grp.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===el?'true':'false'));break}
  case 'step':{const i=el.closest('.itm').querySelector('.i-cant'),n=parseAR(i.value)||0;i.value=qty(Math.max(1,Math.round((n+ +el.dataset.d)*1000)/1000));calcTotal();break}
  case 'add-item':{S.sheet.items=readItems();S.sheet.items.push(blankItem());drawItems();const rows=document.querySelectorAll('#items .itm'),last=rows[rows.length-1];if(last){last.scrollIntoView({block:'nearest'});const f=last.querySelector('.i-prod');if(f)f.focus({preventScroll:true})}break}
  case 'rm-item':{S.sheet.items=readItems();S.sheet.items.splice(+el.dataset.i,1);drawItems();break}
  case 'cobrar':openSheet({type:'cobro',id});break;
  case 'editar':openSheet({type:'venta',id});break;
  case 'cancelar':case 'devolver':{const o=findV(id),dev=a==='devolver';
    confirmar(dev?'Devolver venta':'Cancelar venta',dev?'La venta deja de contar en tus totales y se descuentan '+m(cobrado(o))+' de tus saldos, como dinero devuelto.':'La venta deja de contar en tus totales. Podés reactivarla después desde Editar.',dev?'Devolver':'Cancelar venta',async()=>{
      const c=cloneV(o);c.estado=dev?'devuelta':'cancelada';try{await saveV(c,dev?'Devuelta':'Cancelada');await log('Venta "'+c.producto+'" ('+m(c.total)+') '+(dev?'devuelta':'cancelada'));closeSheet();toast(dev?'Venta devuelta':'Venta cancelada')}catch(e){toast('No se pudo guardar.')}},true);break}
  case 'eliminar':{const o=findV(id);confirmar('Eliminar venta','Se borra para siempre "'+o.producto+'" por '+m(o.total)+'. Si solo querés que no cuente, mejor cancelala.','Eliminar',async()=>{
      try{await del('ventas',id);await log('Venta eliminada: "'+o.producto+'" de '+(o.cliente||'Mostrador')+' por '+m(o.total));closeSheet();toast('Venta eliminada')}catch(e){toast('No se pudo eliminar.')}},true);break}
  case 'save-venta':await doSaveVenta();break;
  case 'save-cobro':await doSaveCobro();break;
  case 'save-gasto':await doSaveGasto();break;
  case 'save-transf':await doSaveTransf();break;
  case 'save-saldos':await doSaveSaldos();break;
  case 'del-gasto':{const sid=S.sheet.id,g=D().gastos.find(x=>x.id===sid);confirmar('Eliminar','Se borra "'+g.concepto+'" por '+m(g.monto)+'.','Eliminar',async()=>{try{await del('gastos',sid);await log('Eliminado: "'+g.concepto+'" por '+m(g.monto));closeSheet();toast('Eliminado')}catch(e){toast('No se pudo eliminar.')}},true);break}
  case 'del-transf':{const sid=S.sheet.id;confirmar('Eliminar pasaje','Los saldos de las cuentas vuelven a como estaban antes.','Eliminar',async()=>{try{await del('transf',sid);closeSheet();toast('Eliminado')}catch(e){toast('No se pudo eliminar.')}},true);break}
  case 'confirm-yes':{const fn=S.sheet.fn;closeSheet();fn();break}
  case 'auth-go':authGo();break;
  case 'auth-toggle':AUTH.mode=AUTH.mode==='in'?'up':'in';authView('',val('au-mail'));break;
  case 'logout':try{await SB.auth.signOut()}catch(e){}location.reload();break;
  case 'pk':padKey(v);break;
  case 'pcancel':PAD=null;$('#lockbox').innerHTML='';break;
  case 'pin-on':pinPad(padSetFlow(()=>{toast('PIN activado');render()}));break;
  case 'pin-change':pinPad(verifyFlow('Cambiar PIN',()=>({next:padSetFlow(()=>{toast('PIN cambiado');render()})})));break;
  case 'pin-off':pinPad(verifyFlow('Quitar PIN',()=>{try{localStorage.removeItem('argyr:pin')}catch(e){}return {ok:true,after:()=>{toast('PIN quitado');render()}}}));break;
  case 'exp-ventas':if(demoBlock())break;await saveFile('argyr-ventas-'+stamp()+'.csv',ventasCsv(S.ventas));break;
  case 'exp-ventas-f':{const b=ventasBase(D()),L=S.f.estado==='todas'?b:b.filter(o=>o.estado===S.f.estado);if(!L.length){toast('No hay ventas para exportar.');break}await saveFile('argyr-ventas-filtradas-'+stamp()+'.csv',ventasCsv(L));break}
  case 'exp-movs':{if(demoBlock())break;const rows=[['Fecha','Hora','Tipo','Concepto','Cuenta','Ingreso','Egreso']].concat(movs(D()).map(x=>[fDate(x.ts),fHora(x.ts),x.k==='cobro'?'Cobro':x.k==='gasto'?'Gasto':x.k==='retiro'?'Retiro':'Entre cuentas',x.t,x.k==='transf'?'':CUENTAS[x.cuenta],x.k==='cobro'?csvNum(x.monto):'',x.k==='gasto'||x.k==='retiro'?csvNum(x.monto):'']));await saveFile('argyr-movimientos-'+stamp()+'.csv',csv(rows));break}
  case 'backup':{if(demoBlock())break;await saveFile('argyr-copia-'+stamp()+'.json',JSON.stringify({app:'ARGYR',v:1,at:new Date().toISOString(),ventas:S.ventas,gastos:S.gastos,transf:S.transf,config:S.config}));break}
  case 'restore':{const f=document.getElementById('restoref');if(f)f.click();break}
  }});
document.addEventListener('input',ev=>{
  const t=ev.target,k=t.dataset&&t.dataset.in;
  if(k==='calc'){calcTotal();return}
  if(k==='q'){S.f.q=t.value;render();return}
  if(k==='fmedio'){S.f.medio=t.value;render();return}
  if(k==='fcat'){S.f.cat=t.value;render();return}
  if(k==='fdesde'){S.f.desde=t.value;render();return}
  if(k==='fhasta'){S.f.hasta=t.value;render();return}
  if(t.classList&&t.classList.contains('i-prod')&&S.sheet&&S.sheet.type==='venta'&&!S.sheet.id){
    const q=t.value.trim().toLowerCase();if(!q)return;const row=t.closest('.itm');let p=null;
    S.ventas.slice().sort((a,b)=>b.ts-a.ts).some(o=>itemsOf(o).some(it=>{if((it.producto||'').trim().toLowerCase()===q){p=it;return true}return false}));
    const pr=row.querySelector('.i-precio');
    if(p&&!pr.value){pr.value=inputNum(p.precio);const c=row.querySelector('.i-costo');if(p.costo&&!c.value)c.value=inputNum(p.costo);const k=row.querySelector('.i-cat');if(p.categoria&&!k.value)k.value=p.categoria;calcTotal()}}
});
document.addEventListener('change',ev=>{const t=ev.target;if(t.id==='restoref'&&t.files&&t.files[0]){restoreFile(t.files[0]);t.value=''}});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&S.sheet)closeSheet()});
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.id&&ev.target.id.indexOf('au-')===0)authGo()});
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(hasPin()&&hiddenAt&&Date.now()-hiddenAt>60000)lockApp()});
/* ---------- arranque ---------- */
lockApp();render();initStore();

