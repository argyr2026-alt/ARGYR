'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MEDIOS={efectivo:'Efectivo',transferencia:'Transferencia'};
const MLABEL=Object.assign({tarjeta:'Transferencia',billetera:'Transferencia'},MEDIOS);
const medN=k=>(k==='tarjeta'||k==='billetera')?'transferencia':k;
const ctaN=k=>k==='billetera'?'banco':k;
const ENVIOS=['Retiro','Cadete','Otro'];
const medioOpts=cur=>Object.entries(MEDIOS).concat(cur&&!(cur in MEDIOS)&&MLABEL[cur]?[[cur,MLABEL[cur]]]:[]);
const cuentaOpts=cur=>[['efectivo','Efectivo'],['banco','Transferencia']];
const CUENTA_DE={efectivo:'efectivo',transferencia:'banco',tarjeta:'banco',billetera:'banco'};
const CUENTAS={efectivo:'Efectivo',banco:'Transferencia',billetera:'Transferencia'};
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
  f:{estado:'todas',per:'mes',q:'',medio:'',cat:'',producto:'',variante:'',cliente:'',envio:'',mmin:'',mmax:'',desc:'',desde:'',hasta:'',open:false},
  vmetric:'vendido',sp:'mes',cliAll:true,cliBy:'monto',evo:'ventas',span:'dias',sel:-1,dfilt:'todos',demoHidden:false,sheet:null};
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
  $('#authbox').innerHTML='<div class="lock"><svg class="logo" role="img" aria-label="ARGYR" style="color:#fff;width:52px;height:60px;margin:0"><use href="#logo"/></svg><h2>'+(inn?'Entrá a tu cuenta':'Creá tu cuenta')+'</h2><p role="alert">'+esc(msg||'')+'</p>'+
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
const MENU=[
  {n:'10 Clasica',c:'Hamburguesas'},{n:'Pongan Huevo',c:'Hamburguesas'},{n:'Cebollitas',c:'Hamburguesas'},
  {n:'Hat - Trick',c:'Hamburguesas'},{n:'Fuerte al Medio',c:'Hamburguesas'},{n:'Gol Gana',c:'Hamburguesas'},
  {n:'Libero',c:'Hamburguesas'},{n:'Saque Lateral',c:'Hamburguesas'},{n:'Papas Goat',c:'Papas'},
  {n:'Combo para 2P',c:'Combos'},{n:'Combo para 1P',c:'Combos'}];
const VARIANTES=['Simple','Doble','Único'];
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const itName=it=>(it.producto||'')+(it.variante?' · '+it.variante:'');
/* unidades reales: un "Combo para 2P" son 2 unidades por cada uno vendido */
const unitMult=it=>{const n=norm(it.producto);if(!/\bcombo/.test(n))return 1;
  const r=n.match(/(\d+)\s*(?:p\b|pers|personas?|hamburguesas?|burgers?|burgas?|unidades|u\b)/)||n.match(/(?:para|x|por|de)\s*(\d+)/)||n.match(/\bcombo\s*(\d+)/);
  const k=r?parseInt(r[1],10):1;return k>=1&&k<=50?k:1};
const itUnits=it=>it.cantidad*unitMult(it);
const extraSum=it=>sum(it.extras||[],e=>e.p||0);
const itTotal=it=>Math.round(it.cantidad*(it.precio+extraSum(it)));
const descF=o=>o.descMonto>0?o.total/(o.total+o.descMonto):1;
const pctStr=n=>String(n).replace('.',',');
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
  mk(1,17,20,'Tomás Herrera','Mochila urbana','Accesorios',1,32000,17000,'transferencia','cobrada');
  mk(1,11,0,'Lucía Fernández','Medias pack x3','Accesorios',4,4200,1800,'efectivo','cobrada');
  mk(1,15,40,'Paula Sosa','Remera estampada','Remeras',2,6000,2500,'transferencia','pendiente');
  mk(2,10,10,'Mostrador','Gorra','Accesorios',1,7500,3000,'efectivo','cobrada');
  mk(3,18,30,'Martín Gómez','Buzo canguro','Abrigo',2,24500,12000,'transferencia','cobrada');
  mk(4,13,0,'Carla Ruiz','Mochila urbana','Accesorios',1,32000,17000,'transferencia','devuelta');
  mk(5,16,45,'Tomás Herrera','Remera estampada','Remeras',5,6000,2500,'efectivo','cobrada');
  mk(6,12,30,'Mostrador','Medias pack x3','Accesorios',3,4200,1800,'transferencia','cobrada');
  mk(8,10,0,'Paula Sosa','Campera rompeviento','Abrigo',1,48000,26000,'transferencia','cobrada');
  mk(9,19,0,'Lucía Fernández','Gorra','Accesorios',1,7500,3000,'efectivo','cancelada');
  mk(12,11,30,'Mostrador','Buzo canguro','Abrigo',2,24500,12000,'transferencia','cobrada');
  mk(35,15,0,'Tomás Herrera','Mochila urbana','Accesorios',2,32000,17000,'transferencia','cobrada');
  mk(38,12,0,'Mostrador','Remera estampada','Remeras',6,6000,2500,'efectivo','cobrada');
  const G=[],T=[];
  const g=(dias,h,tipo,concepto,monto,cuenta,clase,items)=>G.push({id:'demog'+(G.length+1),demo:true,ts:D0(addD(now,-dias))+h*3600000,tipo,concepto,monto:toC(monto),cuenta,notas:'',clase:clase||'variable',items:(items||[]).map(([nombre,cantidad,unidad,precio])=>({nombre,cantidad,unidad,precio:toC(precio),total:Math.round(cantidad*toC(precio))}))});
  g(0,8,'gasto','Bolsas y etiquetas',6500,'efectivo','variable',[['Bolsas kraft',500,'unidad',9],['Etiquetas',200,'unidad',10]]);g(1,9,'gasto','Flete de mercadería',18000,'banco','variable');
  g(2,10,'gasto','Compra de insumos',141000,'banco','variable',[['Carne molida',12,'kg',9200],['Pan de hamburguesa',150,'unidad',210]]);g(12,10,'gasto','Compra de insumos',128000,'banco','variable',[['Carne molida',12,'kg',8400],['Pan de hamburguesa',140,'unidad',190]]);
  g(3,20,'haberes','Sueldo de Juan (cocina)',25000,'efectivo');g(10,10,'gasto','Alquiler del puesto',40000,'banco','fijo');
  T.push({id:'demot1',demo:true,ts:D0(addD(now,-2))+14*3600000,desde:'efectivo',hasta:'banco',monto:toC(30000),notas:''});
  return {ventas:V,gastos:G,transf:T,config:{saldos:{efectivo:toC(150000),banco:toC(90000)}}}}
let _demo=null;
function demoOn(){return S.ready&&!S.demoHidden&&!S.ventas.length&&!S.gastos.length&&!S.transf.length&&!Object.keys(S.config).length}
function D(){if(demoOn()){if(!_demo||_demo.day!==D0(Date.now())){_demo=makeDemo();_demo.day=D0(Date.now())}return Object.assign({demo:true},_demo)}
  return {demo:false,ventas:S.ventas,gastos:S.gastos,transf:S.transf,config:S.config}}
function saldos(d){const s={efectivo:0,banco:0};const ini=(d.config&&d.config.saldos)||{};for(const k in ini)if(ini[k]&&s[ctaN(k)]!=null)s[ctaN(k)]+=ini[k];
  d.ventas.forEach(o=>{if(!valida(o))return;(o.cobros||[]).forEach(c=>{s[CUENTA_DE[c.medio]||'efectivo']+=c.monto})});
  d.gastos.forEach(g=>{const k=ctaN(g.cuenta);if(s[k]!=null)s[k]-=g.monto});
  d.transf.forEach(t=>{const a=ctaN(t.desde),b=ctaN(t.hasta);if(a===b)return;if(s[a]!=null)s[a]-=t.monto;if(s[b]!=null)s[b]+=t.monto});return s}
function ctasVis(d){return ['efectivo','banco']}
function movs(d){const a=[];
  d.ventas.forEach(o=>{if(!valida(o))return;(o.cobros||[]).forEach(c=>a.push({k:'cobro',ts:c.ts,monto:c.monto,cuenta:CUENTA_DE[c.medio]||'efectivo',medio:c.medio,t:o.producto,cli:o.cliente,ref:o.id}))});
  d.gastos.forEach(g=>a.push({k:g.tipo,ts:g.ts,monto:g.monto,cuenta:ctaN(g.cuenta),t:g.concepto,ref:g.id}));
  d.transf.forEach(t=>a.push({k:'transf',ts:t.ts,monto:t.monto,desde:t.desde,hasta:t.hasta,t:CUENTAS[ctaN(t.desde)]+' → '+CUENTAS[ctaN(t.hasta)],ref:t.id}));
  return a.sort((x,y)=>y.ts-x.ts)}
function stats(d,r){const inR=t=>t>=r[0]&&t<r[1];
  const va=d.ventas.filter(o=>valida(o)&&inR(o.ts)),vs=va.filter(o=>o.estado==='cobrada');
  const vendido=sum(vs,o=>o.total),cob=sum(va,cobrado),porCobrar=sum(va,porCobrarDe),pend=va.filter(o=>porCobrarDe(o)>0).length;
  let costo=0,sinCosto=0;vs.forEach(o=>{let falta=false;itemsOf(o).forEach(it=>{if(it.costo>0)costo+=Math.round(it.costo*it.cantidad);else falta=true});if(falta)sinCosto++});
  const gastos=sum(d.gastos.filter(g=>g.tipo==='gasto'&&inR(g.ts)),g=>g.monto),haberes=sum(d.gastos.filter(g=>g.tipo==='haberes'&&inR(g.ts)),g=>g.monto);
  const retiros=sum(d.gastos.filter(g=>g.tipo==='retiro'&&inR(g.ts)),g=>g.monto);
  const unidades=sum(vs,o=>sum(itemsOf(o),itUnits));
  return {vs,pend,unidades,vendido,cob,porCobrar,ops:vs.length,ticket:vs.length?Math.round(vendido/vs.length):0,costo,sinCosto,gastos,haberes,egresos:gastos+haberes,retiros,ganancia:vendido-costo-gastos-haberes}}
function groupBy(vs,key){const mp=new Map();vs.forEach(o=>{const fd=descF(o);itemsOf(o).forEach(it=>{const raw=(it[key]||'').trim();if(!raw)return;const k=raw.toLowerCase();
  const e=mp.get(k)||{n:raw,total:0,u:0,q:0};e.total+=Math.round(itTotal(it)*fd);e.u+=itUnits(it);e.q+=it.cantidad;mp.set(k,e)})});
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
function onData(){render();if(S.sheet&&(S.sheet.type==='detalle'||S.sheet.type==='gastoDet'))openSheet(S.sheet)}
function render(){
  const app=$('#app');renderNav();
  if(!S.ready){app.innerHTML='<div class="top"><div><svg class="logo" role="img" aria-label="ARGYR"><use href="#logo"/></svg><h1>Mi actividad</h1></div></div><div class="hero"><div class="lbl">Cargando tus ventas…</div><div class="big num">$ —</div></div>';return}
  const ae=document.activeElement,fid=ae&&ae.id,ss=ae&&ae.selectionStart;
  const d=D();
  const v={inicio:vInicio,ventas:vVentas,dinero:vDinero,stats:vStats,ajustes:vAjustes}[S.tab](d);
  app.innerHTML=banners(d)+v;
  if(fid){const e=document.getElementById(fid);if(e&&e!==document.activeElement){e.focus();try{if(ss!=null)e.setSelectionRange(ss,ss)}catch(x){}}}}
function movRow(x){
  const hora=when(x.ts);let ic,cl,amt,sub;
  if(x.k==='cobro'){ic='dn';cl='in';amt='<span class="amt num pos">'+mS(x.monto)+'</span>';sub=CUENTAS[x.cuenta]+' · '+hora+(x.cli?' · '+esc(x.cli):'')}
  else if(x.k==='transf'){ic='swap';cl='mv';amt='<span class="amt num">'+m(x.monto)+'</span>';sub=hora+' · Entre cuentas'}
  else{ic='up';cl=x.k==='haberes'?'hab':'out';amt='<span class="amt num '+(x.k==='haberes'?'hab':'neg')+'">'+mS(-x.monto)+'</span>';sub=CUENTAS[x.cuenta]+' · '+hora+' · '+({retiro:'Retiro',haberes:'Haberes'}[x.k]||'Gasto')}
  return '<button class="item" data-a="mov" data-k="'+x.k+'" data-id="'+esc(x.ref)+'"><span class="ava '+cl+'">'+ico(ic,20)+'</span><span class="mid"><div class="t">'+esc(x.t)+'</div><div class="d">'+sub+'</div></span><span class="r">'+amt+'</span></button>'}
function vInicio(d){
  const ay=S.hday==='ayer',r=rng('hoy',ay),st=stats(d,r),pedidos=d.ventas.filter(o=>o.ts>=r[0]&&o.ts<r[1]).length;
  const mv=movs(d).slice(0,6);
  return '<div class="top"><div><svg class="logo" role="img" aria-label="ARGYR"><use href="#logo"/></svg><h1>Mi actividad</h1><div class="date">'+fDia(Date.now())+'</div></div><button class="icon-btn" data-a="tab" data-v="ajustes" aria-label="Ajustes">'+ico('gear')+'</button></div>'+
  '<section class="hero" aria-label="Ventas del día"><div class="per" role="group" aria-label="Día">'+[['ayer','Ayer'],['hoy','Hoy']].map(x=>'<button data-a="hday" data-v="'+x[0]+'" aria-pressed="'+((S.hday==='ayer')===(x[0]==='ayer'))+'">'+x[1]+'</button>').join('')+'</div>'+
  '<div><div class="lbl">Ventas de '+(ay?'ayer':'hoy')+'</div><div class="big num">'+m(st.vendido)+'</div><div class="sub">'+plural(st.ops,'venta cobrada','ventas cobradas')+'</div></div>'+
  '<div class="accts"><div class="acct"><small>Cobrado</small><b class="num">'+m(st.cob)+'</b></div><div class="acct"><small>Por cobrar</small><b class="num">'+m(st.porCobrar)+'</b></div><div class="acct"><small>Total pedidos</small><b class="num">'+pedidos+'</b></div></div></section>'+
  '<div class="sec"><h2>Últimos movimientos</h2>'+(mv.length?'<button data-a="tab" data-v="dinero">Ver todos</button>':'')+'</div>'+
  (mv.length?'<div class="list">'+mv.map(movRow).join('')+'</div>':'<div class="empty"><b>Todavía no hay movimientos</b>Cuando registres una venta cobrada o un gasto, aparece acá.</div>')}
function ventasBase(d){const f=S.f;let from=0,to=Infinity;
  if(f.desde||f.hasta){from=f.desde?new Date(f.desde+'T00:00').getTime():0;to=f.hasta?new Date(f.hasta+'T00:00').getTime()+DAY:Infinity}else{const r=rng(f.per);from=r[0];to=r[1]}
  const q=f.q.trim().toLowerCase(),mn=parseAR(f.mmin),mx=parseAR(f.mmax),nc=norm(f.cliente),np=norm(f.producto);
  return d.ventas.filter(o=>o.ts>=from&&o.ts<to&&(!f.medio||medN(o.medio)===f.medio)&&
    ((!f.producto&&!f.variante&&!f.cat)||itemsOf(o).some(i=>(!f.producto||norm(i.producto)===np)&&(!f.variante||(i.variante||'')===f.variante)&&(!f.cat||(i.categoria||'')===f.cat)))&&
    (!f.cliente||norm(o.cliente||'Mostrador')===nc)&&
    (!f.envio||(f.envio==='__none'?!o.envio:o.envio===f.envio))&&(!f.desc||(f.desc==='con'?o.descMonto>0:!(o.descMonto>0)))&&
    (isNaN(mn)||o.total>=toC(mn))&&(isNaN(mx)||o.total<=toC(mx))&&
    (!q||[o.cliente,o.notas,o.envio].concat(itemsOf(o).map(i=>itName(i)+' '+(i.categoria||'')+' '+(i.agregados||''))).join(' ').toLowerCase().includes(q))).sort((a,b)=>b.ts-a.ts)}
function ventaRow(o){
  const par=o.estado==='pendiente'&&cobrado(o)>0;
  const tag=par?'<span class="tag parcial">Parcial</span>':'<span class="tag '+o.estado+'">'+ESTADOS[o.estado]+'</span>';
  const dead=!valida(o)?' style="text-decoration:line-through;opacity:.6"':'';
  return '<button class="item" data-a="venta" data-id="'+esc(o.id)+'"><span class="ava">'+esc((o.producto||'?').charAt(0).toUpperCase())+'</span><span class="mid"><div class="t">'+esc(o.producto)+'</div><div class="d">'+esc(o.cliente||'Mostrador')+' · '+(itemsOf(o).length>1?itemsOf(o).length+' productos · ':'')+qty(unidades(o))+' u. · '+MLABEL[o.medio]+(o.envio?' · '+esc(o.envio):'')+(o.descMonto>0?' · desc. '+pctStr(o.descPct)+'%':'')+' · '+when(o.ts)+'</div></span>'+
  '<span class="r"><span class="amt num"'+dead+'>'+m(o.total)+'</span>'+tag+'</span></button>'}
function listaVentas(d){
  const base=ventasBase(d),f=S.f,L=f.estado==='todas'?base:base.filter(o=>o.estado===f.estado);
  if(!L.length)return '<div class="empty"><b>'+(d.ventas.length?'No hay ventas con esos filtros':'Todavía no registraste ventas')+'</b>'+(d.ventas.length?'Probá con otro período o limpiá los filtros.':'Tocá el botón + para anotar la primera.')+'</div>';
  let h='<div class="list">',cur=null;
  L.forEach(o=>{const dk=D0(o.ts);if(dk!==cur){cur=dk;const dia=L.filter(x=>D0(x.ts)===dk&&x.estado==='cobrada'),pn=L.filter(x=>D0(x.ts)===dk&&x.estado==='pendiente').length;
    h+='</div><div class="day"><b>'+esc(dayName(o.ts))+'</b><span class="num">'+m(sum(dia,x=>x.total))+' · '+plural(dia.length,'cobrada','cobradas')+(pn?' · '+plural(pn,'pendiente','pendientes'):'')+'</span></div><div class="list">'}
    h+=ventaRow(o)});
  return h+'</div>'}
function vVentasLista(d){
  const f=S.f,base=ventasBase(d),vs=base.filter(valida),vc=vs.filter(o=>o.estado==='cobrada'),pp=vs.filter(o=>porCobrarDe(o)>0);
  const val={vendido:sum(vc,o=>o.total),cobrado:sum(vs,cobrado),porcobrar:sum(vs,porCobrarDe)}[S.vmetric];
  const lab={vendido:'Total vendido',cobrado:'Total cobrado',porcobrar:'Por cobrar'}[S.vmetric];
  const cnt=e=>e==='todas'?base.length:base.filter(o=>o.estado===e).length;
  const cats=[...new Set(d.ventas.flatMap(o=>itemsOf(o).map(i=>i.categoria)).filter(Boolean))].sort();
  const custom=f.desde||f.hasta;
  const sel=(id,opts,cur,ph,key)=>'<select class="inp" id="'+id+'" data-in="'+(key||id)+'"><option value="">'+ph+'</option>'+opts.map(o=>'<option value="'+esc(o[0])+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
  const prodNames=(()=>{const seen=new Set(),a=[];MENU.map(x=>x.n).concat(d.ventas.flatMap(o=>itemsOf(o).map(i=>(i.producto||'').trim()))).forEach(n=>{const k=norm(n);if(n&&!seen.has(k)){seen.add(k);a.push(n)}});return a})();
  const cliNames=(()=>{const seen=new Set(),a=[];d.ventas.slice().sort((x,y)=>y.ts-x.ts).forEach(o=>{const n=(o.cliente||'Mostrador').trim(),k=norm(n);if(!seen.has(k)){seen.add(k);a.push(n)}});return a.sort((x,y)=>x.localeCompare(y,'es'))})();
  const nF=(f.medio?1:0)+(f.cat?1:0)+(custom?1:0)+(f.producto?1:0)+(f.variante?1:0)+(f.cliente?1:0)+(f.envio?1:0)+(f.desc?1:0)+((f.mmin||f.mmax)?1:0);
  const fld=(id,label,inner)=>'<div class="field"><label for="'+id+'">'+label+'</label>'+inner+'</div>';
  return '<section class="hero"><div class="per" role="group" aria-label="Período">'+['hoy','semana','mes','todo'].map(p=>'<button data-a="per" data-v="'+p+'" aria-pressed="'+(!custom&&f.per===p)+'">'+(p==='semana'?'Semana':PER[p])+'</button>').join('')+'</div>'+
  '<div><div class="lbl">'+lab+(custom?' · rango elegido':'')+'</div><div class="big num">'+m(val)+'</div><div class="sub">'+({vendido:plural(vc.length,'venta cobrada','ventas cobradas'),cobrado:plural(vs.length,'operación válida','operaciones válidas'),porcobrar:plural(pp.length,'pendiente','pendientes')+' · no suman a ventas'})[S.vmetric]+'</div></div>'+
  '<div class="seg" role="group" aria-label="Indicador">'+[['vendido','Vendido'],['cobrado','Cobrado'],['porcobrar','Por cobrar']].map(x=>'<button data-a="vmetric" data-v="'+x[0]+'" aria-pressed="'+(S.vmetric===x[0])+'">'+x[1]+'</button>').join('')+'</div></section>'+
  '<div class="chips" role="group" aria-label="Estado">'+['todas','cobrada','pendiente','cancelada','devuelta'].map(e=>'<button class="chip" data-a="estado" data-v="'+e+'" aria-pressed="'+(f.estado===e)+'">'+(e==='todas'?'Todas':ESTADOS[e])+' <i>'+cnt(e)+'</i></button>').join('')+'</div>'+
  '<div class="search"><input class="inp" id="q" data-in="q" type="search" placeholder="Buscar por producto o cliente" value="'+esc(f.q)+'" autocomplete="off"><button class="icon-btn" data-a="filtros" aria-label="Filtros" aria-expanded="'+f.open+'" style="'+(nF?'color:var(--accent)':'')+'">'+ico('flt',20)+(nF?'<i class="bdg">'+nF+'</i>':'')+'</button></div>'+
  (nF?'<div class="hint" style="margin:8px 2px 0;display:flex;justify-content:space-between;align-items:center;gap:10px"><span>'+plural(nF,'filtro activo','filtros activos')+'</span><button class="link" data-a="limpiar">Limpiar</button></div>':'')+
  (f.open?'<div class="card" style="margin-top:10px"><div class="form">'+
    '<div class="two">'+fld('fprod','Producto',sel('fprod',prodNames.map(n=>[n,n]),f.producto,'Todos','f:producto'))+fld('fvar','Tamaño',sel('fvar',VARIANTES.map(n=>[n,n]),f.variante,'Todos','f:variante'))+'</div>'+
    '<div class="two">'+fld('fcli','Cliente',sel('fcli',cliNames.map(n=>[n,n]),f.cliente,'Todos','f:cliente'))+fld('fenv','Envío',sel('fenv',ENVIOS.map(n=>[n,n]).concat([['__none','Sin envío']]),f.envio,'Todos','f:envio'))+'</div>'+
    '<div class="two">'+fld('fmedio','Medio de pago',sel('fmedio',Object.entries(MEDIOS),f.medio,'Todos'))+fld('fcat','Categoría',sel('fcat',cats.map(c=>[c,c]),f.cat,'Todas'))+'</div>'+
    '<div class="two">'+fld('fdesc','Descuento',sel('fdesc',[['con','Con descuento'],['sin','Sin descuento']],f.desc,'Todos','f:desc'))+'<div></div></div>'+
    '<div class="two">'+fld('fdesde','Desde','<input class="inp" type="date" id="fdesde" data-in="fdesde" value="'+esc(f.desde)+'">')+fld('fhasta','Hasta','<input class="inp" type="date" id="fhasta" data-in="fhasta" value="'+esc(f.hasta)+'">')+'</div>'+
    '<div class="two">'+fld('fmin','Total desde ($)','<input class="inp" id="fmin" data-in="f:mmin" inputmode="decimal" placeholder="0" value="'+esc(f.mmin)+'">')+fld('fmax','Total hasta ($)','<input class="inp" id="fmax" data-in="f:mmax" inputmode="decimal" placeholder="Sin límite" value="'+esc(f.mmax)+'">')+'</div>'+
    '<p class="hint" style="margin:0">El estado se elige con los botones de arriba. La búsqueda también mira notas y envío.</p>'+
    '<div class="btns"><button class="btn ghost" data-a="exp-ventas-f">Exportar estas ventas (CSV)</button><button class="btn sec2" data-a="limpiar">Limpiar filtros</button></div></div></div>':'')+
  '<div id="lista" style="margin-top:6px">'+listaVentas(d)+'</div>'}
function vIngresos(d){
  const sal=saldos(d),disp=sal.efectivo+sal.banco,pend=d.ventas.filter(o=>valida(o)&&porCobrarDe(o)>0);
  const all=movs(d),fl=S.dfilt;
  const L=fl==='pendiente'?[]:all.filter(x=>fl==='todos'||(fl==='ingresos'&&x.k==='cobro')||(fl==='gastos'&&(x.k==='gasto'||x.k==='retiro'))||(fl==='haberes'&&x.k==='haberes')||(fl==='transf'&&x.k==='transf'));
  let h='<section class="hero" aria-label="Dinero disponible"><div><div class="lbl">Dinero disponible</div><div class="big num">'+m(disp)+'</div><div class="sub">Efectivo + transferencias</div></div></section><div class="list cards3" style="margin-top:12px">'+ctasVis(d).map(k=>'<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><div class="k">'+CUENTAS[k]+'</div><div class="v num" style="margin:2px 0 0">'+m(sal[k])+'</div></div><span class="ava mv">'+ico(k==='efectivo'?'wal':'swap',20)+'</span></div>').join('')+'</div>'+
  '<button class="card tap" style="margin-top:12px" data-a="goventas" data-per="todo" data-estado="pendiente"><div class="k">Pendiente de cobro</div><div class="v num">'+m(sum(pend,porCobrarDe))+'</div><div class="s">'+plural(pend.length,'operación','operaciones')+' · no está en tus saldos hasta que lo cobres</div></button>'+
  '<div class="sec"><h2>Movimientos</h2><button data-a="saldos">Saldos iniciales</button></div>'+
  '<div class="chips" style="margin-top:0">'+[['todos','Todos'],['ingresos','Ingresos'],['gastos','Gastos'],['haberes','Haberes'],['pendiente','Pendiente de cobro'],['transf','Entre cuentas']].map(x=>'<button class="chip" data-a="dfilt" data-v="'+x[0]+'" aria-pressed="'+(fl===x[0])+'">'+x[1]+'</button>').join('')+'</div>';
  if(fl==='pendiente'){const ps=pend.slice().sort((a,b)=>b.ts-a.ts);
    return h+(ps.length?'<p class="hint" style="margin:0 0 8px">Ventas con saldo por cobrar. Todavía no están en tus saldos.</p><div class="list">'+ps.map(o=>'<button class="item" data-a="venta" data-id="'+esc(o.id)+'"><span class="ava in">'+ico('dn',20)+'</span><span class="mid"><div class="t">'+esc(o.producto)+'</div><div class="d">'+esc(o.cliente||'Mostrador')+' · '+when(o.ts)+'</div></span><span class="r"><span class="amt num">'+m(porCobrarDe(o))+'</span></span></button>').join('')+'</div>':'<div class="empty"><b>Nada pendiente de cobro</b>Todas tus ventas están cobradas.</div>')}
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
  out.forEach(x=>{const s=stats(d,[x.a,x.b]);x.v={ventas:s.vendido,gastos:s.gastos,haberes:s.haberes,ganancia:s.ganancia}[S.evo]});return out}
const compact=c=>{const v=Math.abs(c)/100,s=c<0?'-':'';return s+(v>=1e6?(v/1e6).toFixed(1).replace('.',',')+' M':v>=1000?Math.round(v/1000)+' mil':String(Math.round(v)))};
function chart(bk){
  const W=560,H=190,L=46,R=8,T=10,B=26,col={ventas:'var(--accent)',gastos:'var(--c-gasto)',haberes:'var(--c-hab)',ganancia:'var(--ok)'}[S.evo];
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
function clientesHtml(d,r){
  const rg=S.cliAll?[0,Infinity]:r,mp=new Map(),porMonto=S.cliBy==='monto';
  d.ventas.forEach(o=>{if(o.estado!=='cobrada'||o.ts<rg[0]||o.ts>=rg[1])return;const nm=(o.cliente||'').trim(),k=norm(nm);if(!k||k==='mostrador')return;
    const e=mp.get(k)||{n:nm,total:0,ops:0,last:0};e.total+=o.total;e.ops++;if(o.ts>e.last){e.last=o.ts;e.n=nm}mp.set(k,e)});
  const L=[...mp.values()].sort((a,b)=>porMonto?(b.total-a.total||b.ops-a.ops):(b.ops-a.ops||b.total-a.total)).slice(0,10);
  const mx=L.length?Math.max(1,...L.map(x=>porMonto?x.total:x.ops)):1;
  const sg=(act,items,cur)=>'<div class="seg light" role="group">'+items.map(x=>'<button data-a="'+act+'" data-v="'+x[0]+'" aria-pressed="'+(cur===x[0])+'">'+x[1]+'</button>').join('')+'</div>';
  return '<div class="sec"><h2>Mejores clientes</h2></div><div class="card"><div style="display:flex;flex-direction:column;gap:8px">'+
    sg('cliall',[['todo','Todo el tiempo'],['per',PER[S.sp]]],S.cliAll?'todo':'per')+sg('cliby',[['monto','Por monto'],['compras','Por compras']],S.cliBy)+'</div>'+
    (L.length?'<div class="clis">'+L.map((x,i)=>'<button class="cli" data-a="cli" data-v="'+esc(x.n)+'"><span class="rk'+(i<3?' top':'')+'">'+(i+1)+'</span><span class="mid"><b>'+esc(x.n)+'</b><small>'+plural(x.ops,'compra','compras')+' · última '+fCorta(x.last)+'</small></span><b class="num">'+m(x.total)+'</b><span class="track"><span class="fill" style="width:'+Math.max(3,Math.round((porMonto?x.total:x.ops)/mx*100))+'%"></span></span></button>').join('')+'</div>':
    '<p class="hint" style="margin-top:12px">Todavía no hay clientes con nombre en este período. Escribí el nombre al cargar una venta para ver quién compra más.</p>')+
    '<p class="hint" style="margin-top:10px">Cuentan solo las ventas cobradas. Las pendientes, canceladas, devueltas y las de "Mostrador" no entran. Tocá un cliente para ver sus ventas.</p></div>'}
function vStats(d){
  const r=rng(S.sp),pr=rng(S.sp,true),s=stats(d,r),p=stats(d,pr),lab={hoy:'vs ayer',semana:'vs semana anterior',mes:'vs mes anterior'}[S.sp];
  const med={};d.ventas.forEach(o=>{if(!valida(o))return;(o.cobros||[]).forEach(c=>{if(c.ts>=r[0]&&c.ts<r[1])med[c.medio]=(med[c.medio]||0)+c.monto})});
  const med2={};for(const k in med)med2[medN(k)]=(med2[medN(k)]||0)+med[k];const mrows=Object.keys(med2).map(k=>({n:MLABEL[k],total:med2[k]})).sort((a,b)=>b.total-a.total);
  const cats=groupBy(s.vs,'categoria').slice(0,5);
  const bk=buckets(d),sel=S.sel<0?bk.length-1:S.sel,tot=sum(bk,b=>b.v);
  const ev={ventas:'Ventas',gastos:'Gastos',haberes:'Haberes',ganancia:'Ganancia estimada'}[S.evo];
  const ind=(k,v,sub,extra,cls)=>'<div class="card'+(cls?' '+cls:'')+'"><div class="k">'+k+'</div><div class="v num">'+v+'</div>'+(extra||'')+'<div class="s">'+sub+'</div></div>';
  return '<div class="top"><h1>Estadísticas</h1></div>'+
  '<div class="seg light" role="group" aria-label="Período">'+['hoy','semana','mes'].map(x=>'<button data-a="sp" data-v="'+x+'" aria-pressed="'+(S.sp===x)+'">'+(x==='semana'?'Semana':PER[x])+'</button>').join('')+'</div>'+
  '<div class="ind" style="margin-top:12px">'+ind('Total vendido',m(s.vendido),'Solo ventas cobradas · las pendientes no suman',deltaTag(s.vendido,p.vendido,lab))+
  ind('Total cobrado',m(s.cob),'Dinero recibido por esas ventas')+ind('Por cobrar',m(s.porCobrar),plural(s.pend,'pedido pendiente','pedidos pendientes')+' · no suman a ventas')+
  ind('Gastos',m(s.gastos),'Sin haberes · fijos '+m(gStats(d,r).fijo),'','gas')+ind('Haberes',m(s.haberes),'Pagos de haberes del período','','hab')+
  ind('Total egresos',m(s.egresos),'Gastos + haberes'+(s.retiros?' · sin retiros personales ('+m(s.retiros)+')':''))+
  ind('Ganancia estimada',m(s.ganancia),s.sinCosto?'Faltan costos en '+plural(s.sinCosto,'venta','ventas')+': puede estar sobreestimada':'Ventas menos costos, gastos y haberes')+
  ind('Operaciones',s.ops,'Ventas cobradas del período')+ind('Unidades vendidas',qty(s.unidades),'Un combo cuenta por sus personas: “Combo para 4P” = 4 unidades')+ind('Unidades por venta',s.ops?qty(Math.round(s.unidades/s.ops*10)/10):'—','Promedio por operación')+ind('Total pedidos',d.ventas.filter(o=>o.ts>=r[0]&&o.ts<r[1]).length,'Con cancelados y devueltos')+ind('Ticket promedio',m(s.ticket),'Promedio por operación')+'</div>'+
  '<div class="sec"><h2>Cobrado por medio de pago</h2></div><div class="card">'+bars(mrows,Math.max(1,...mrows.map(x=>x.total)),'Todavía no cobraste nada en este período.')+'</div>'+
  '<div class="sec"><h2>Más vendidos</h2></div><div class="card"><div class="lab" style="margin-bottom:8px">Productos</div>'+prodList(s.vs)+
  (cats.length?'<div class="lab" style="margin:14px 0 8px">Categorías</div>'+bars(cats,Math.max(1,...cats.map(x=>x.total)),''):'')+'</div>'+
  agregadosHtml(s.vs)+clientesHtml(d,r)+statsExtra(d,r,pr,s)+'<div class="sec"><h2>Evolución</h2></div><div class="card"><div class="seg light" role="group" aria-label="Serie">'+[['ventas','Ventas'],['gastos','Gastos'],['haberes','Haberes'],['ganancia','Ganancia']].map(x=>'<button data-a="evo" data-v="'+x[0]+'" aria-pressed="'+(S.evo===x[0])+'">'+x[1]+'</button>').join('')+'</div>'+
  '<div class="chips" style="margin-top:10px">'+[['dias','Últimos 14 días'],['meses','Últimos 6 meses']].map(x=>'<button class="chip" data-a="span" data-v="'+x[0]+'" aria-pressed="'+(S.span===x[0])+'">'+x[1]+'</button>').join('')+'</div>'+
  '<div class="chart-wrap">'+chart(bk)+'</div><div class="cap"><b>'+esc(bk[sel].full)+'</b> · '+ev+' '+m(bk[sel].v)+' &nbsp;|&nbsp; Total del gráfico '+m(tot)+'</div></div>'}
function vAjustes(d){
  const pin=hasPin();
  const row=(a,t,s)=>'<button class="btn sec2" data-a="'+a+'"><span>'+t+(s?'<br><small style="color:var(--muted);font-weight:500">'+s+'</small>':'')+'</span><span style="color:var(--accent)">›</span></button>';
  return '<div class="top"><div style="display:flex;align-items:center;gap:10px"><button class="icon-btn" data-a="tab" data-v="inicio" aria-label="Volver">'+ico('back')+'</button><h1>Ajustes</h1></div></div>'+
  '<div class="sec" style="margin-top:6px"><h2>Seguridad</h2></div><div class="set">'+(pin?row('pin-change','Cambiar PIN','Pide el PIN al abrir y después de un rato sin usar la app')+row('pin-off','Quitar PIN'):row('pin-on','Proteger con PIN','Bloqueo de 4 dígitos en este dispositivo'))+'</div>'+
  '<div class="sec"><h2>Exportar</h2></div><div class="set">'+row('exp-ventas','Ventas a Excel (CSV)','Todas las ventas, una fila por operación')+row('exp-movs','Movimientos de dinero (CSV)','Cobros, gastos, haberes, retiros y pasajes entre cuentas')+'</div>'+
  '<div class="sec"><h2>Copia de seguridad</h2></div><div class="set">'+row('backup','Descargar copia (JSON)','Ventas, gastos, movimientos y saldos')+row('restore','Restaurar desde una copia')+'</div><input type="file" id="restoref" accept=".json,application/json" hidden>'+
  '<div class="sec"><h2>Cuentas</h2></div><div class="set">'+row('saldos','Saldos iniciales','Lo que tenías en efectivo y por transferencia al empezar')+'</div>'+'<div class="sec"><h2>Sesión</h2></div><div class="set">'+row('logout','Cerrar sesión',esc(USER_EMAIL))+'</div>'+
  '<div class="sec"><h2>Historial de modificaciones</h2></div>'+
  (S.bitacora.length&&!d.demo?'<div class="card"><ul class="hist">'+S.bitacora.map(b=>'<li><b style="color:var(--ink)">'+fFull(b.ts)+'</b> · '+esc(b.msg)+'</li>').join('')+'</ul></div>':'<div class="empty"><b>Sin cambios importantes</b>Ediciones, cancelaciones, devoluciones y eliminaciones quedan anotadas acá.</div>')+
  (S.demoHidden&&!S.ventas.length?'<div class="set" style="margin-top:16px">'+row('showdemo','Mostrar datos de ejemplo')+'</div>':'')+
  '<p class="hint" style="margin-top:18px">'+(S.usingDb?'Tus datos se guardan en Supabase y se actualizan en todos tus dispositivos.':'Tus datos se guardan solo en este navegador. Descargá una copia de seguridad de vez en cuando.')+'</p>'}

/* ---------- módulo de gastos y pestañas de Dinero ---------- */
S.prodBy='monto';S.prodAll=false;S.dtab='ingresos';S.hp='mes';S.hday='hoy';
S.g={per:'mes',desde:'',hasta:'',v:'resumen',q:'',tipo:'',medio:'',ord:'fecha-d',prod:'',cmp:false,sel:-1};
const CLASES={fijo:'Fijo',variable:'Variable'};
const claseDe=g=>g.clase==='fijo'?'fijo':'variable';
const UMAP={u:'unidad',un:'unidad',unid:'unidad',unidad:'unidad',unidades:'unidad',kg:'kg',kilo:'kg',kilos:'kg',kilogramo:'kg',kilogramos:'kg',g:'g',gr:'g',gramo:'g',gramos:'g',l:'litro',lt:'litro',lts:'litro',litro:'litro',litros:'litro',ml:'ml',paquete:'paquete',paquetes:'paquete',caja:'caja',cajas:'caja',docena:'docena',docenas:'docena'};
const UNIDADES=['unidad','kg','g','litro','ml','paquete','caja','docena'];
const unidadN=u=>{const k=norm(u);return k?(UMAP[k]||k):'unidad'};
const uShort=u=>({unidad:'u.',litro:'L'}[u]||u);
const gastosOnly=d=>d.gastos.filter(g=>g.tipo==='gasto');
const gastosAll=d=>d.gastos.filter(g=>g.tipo==='gasto'||g.tipo==='haberes');
const tipoLbl=x=>x.tipo==='haberes'?'Haberes':CLASES[claseDe(x)];
const gItems=g=>Array.isArray(g.items)?g.items:[];
const gFecha=t=>new Date(t).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
const GPER=[['hoy','Hoy'],['7d','Últimos 7 días'],['mes','Mes actual'],['mesant','Mes anterior'],['6m','Últimos 6 meses'],['anio','Último año'],['custom','Personalizado']];
function gRange(p){const n=Date.now(),t0=D0(n);
  if(p==='hoy')return {r:[t0,t0+DAY],pr:[t0-DAY,t0]};
  if(p==='7d')return {r:[t0-6*DAY,t0+DAY],pr:[t0-13*DAY,t0-6*DAY]};
  if(p==='mesant')return {r:[mo0(n,-1),mo0(n)],pr:[mo0(n,-2),mo0(n,-1)]};
  if(p==='6m')return {r:[mo0(n,-5),mo0(n,1)],pr:[mo0(n,-11),mo0(n,-5)]};
  if(p==='anio')return {r:[mo0(n,-11),mo0(n,1)],pr:[mo0(n,-23),mo0(n,-11)]};
  if(p==='custom'&&S.g.desde){const a=new Date(S.g.desde+'T00:00').getTime(),b=(S.g.hasta?new Date(S.g.hasta+'T00:00').getTime():t0)+DAY;
    if(isFinite(a)&&isFinite(b)&&b>a)return {r:[a,b],pr:[a-(b-a),a]}}
  return {r:[mo0(n),mo0(n,1)],pr:[mo0(n,-1),mo0(n)]}}
function gStats(d,rg){
  const L=gastosAll(d).filter(g=>g.ts>=rg[0]&&g.ts<rg[1]);
  const total=sum(L,g=>g.monto),n=L.length,fijo=sum(L.filter(g=>g.tipo==='gasto'&&claseDe(g)==='fijo'),g=>g.monto),hab=sum(L.filter(g=>g.tipo==='haberes'),g=>g.monto),ef=sum(L.filter(g=>ctaN(g.cuenta)==='efectivo'),g=>g.monto);
  let nprod=0;L.forEach(g=>{nprod+=gItems(g).length});
  return {L,total,n,prom:n?Math.round(total/n):0,fijo,hab,variable:total-fijo-hab,ef,tr:total-ef,nprod}}
const pKey=i=>norm(i.nombre)+'|'+unidadN(i.unidad);
function pStats(d,rg){const mp=new Map();
  gastosOnly(d).filter(g=>g.ts>=rg[0]&&g.ts<rg[1]).forEach(g=>gItems(g).forEach(i=>{const k=pKey(i);let e=mp.get(k);
    if(!e){e={k,n:i.nombre,u:unidadN(i.unidad),units:0,total:0,gs:new Set(),last:0};mp.set(k,e)}
    e.units+=i.cantidad;e.total+=i.total;e.gs.add(g.id);if(g.ts>=e.last){e.last=g.ts;e.n=i.nombre}}));
  const arr=[...mp.values()],cnt={};
  arr.forEach(e=>{e.compras=e.gs.size;e.avg=e.units?Math.round(e.total/e.units):0;const b=norm(e.n);cnt[b]=(cnt[b]||0)+1});
  arr.forEach(e=>{e.label=e.n+(cnt[norm(e.n)]>1?' ('+e.u+')':'')});
  return arr}
function pHist(d,k){const a=[];gastosOnly(d).forEach(g=>gItems(g).forEach(i=>{if(pKey(i)===k)a.push({ts:g.ts,p:i.precio,id:g.id})}));return a.sort((x,y)=>x.ts-y.ts)}
/* presupuesto mensual */
const mkey=t=>{const x=new Date(t);return x.getFullYear()+'-'+pad2(x.getMonth()+1)};
function presLimit(d,key){const L=(d.config&&d.config.presupuestos)||{};const ks=Object.keys(L).filter(k=>k<=key).sort();return ks.length?(L[ks[ks.length-1]]||0):0}
const gastoMes=(d,t)=>sum(gastosAll(d).filter(g=>g.ts>=mo0(t)&&g.ts<mo0(t,1)),g=>g.monto);
function presAlert(d){const n=Date.now(),lim=presLimit(d,mkey(n));if(!lim)return '';const g=gastoMes(d,n),p=g/lim*100;
  if(p>100)return '<div class="banner bad" style="margin:12px 0 0"><span>Superaste el presupuesto del mes por '+m(g-lim)+' ('+Math.round(p)+'%).</span><button data-a="gv" data-v="presupuesto">Ver</button></div>';
  if(p>=80)return '<div class="banner warn" style="margin:12px 0 0"><span>Ya usaste el '+Math.round(p)+'% de tu presupuesto del mes. Te quedan '+m(lim-g)+'.</span><button data-a="gv" data-v="presupuesto">Ver</button></div>';
  return ''}
/* ---------- piezas visuales ---------- */
const gSeg=(act,items,cur)=>'<div class="seg light'+(items.length>3?' s4':'')+'" role="group">'+items.map(x=>'<button data-a="'+act+'" data-v="'+x[0]+'" aria-pressed="'+(cur===x[0])+'">'+x[1]+'</button>').join('')+'</div>';
const gChips=(act,items,cur)=>'<div class="chips" style="margin-top:10px">'+items.map(x=>'<button class="chip" data-a="'+act+'" data-v="'+x[0]+'" aria-pressed="'+(cur===x[0])+'">'+x[1]+'</button>').join('')+'</div>';
function gDelta(now,prev){if(!prev)return '<span class="delta eq">Sin datos del período anterior</span>';const df=now-prev,p=Math.round(df/prev*100);
  return '<span class="delta '+(df>0?'dn':df<0?'up':'eq')+'">'+(df===0?'Igual que el período anterior':mS(df)+' ('+(p>0?'+':'')+p+'%) vs período anterior')+'</span>'}
const gRow=x=>{const h=x.tipo==='haberes';return '<button class="item" data-a="'+(h?'mov':'gdet')+'"'+(h?' data-k="haberes"':'')+' data-id="'+esc(x.id)+'"><span class="ava '+(h?'hab':'out')+'">'+ico('up',20)+'</span><span class="mid"><div class="t">'+esc(x.concepto)+'</div><div class="d">'+gFecha(x.ts)+' · '+(h?'<b style="color:var(--c-hab)">Haberes</b>':CLASES[claseDe(x)])+' · '+CUENTAS[ctaN(x.cuenta)]+(gItems(x).length?' · '+plural(gItems(x).length,'producto','productos'):'')+'</div></span><span class="r"><span class="amt num '+(h?'hab':'neg')+'">'+mS(-x.monto)+'</span></span></button>'};
function gBuckets(r,pr){const span=(r[1]-r[0])/DAY,gran=span<=1?'h':span<=35?'d':'m';
  const mk=(a0,b0)=>{const o=[];if(gran==='h'){for(let a=a0;a<b0;a+=3600000)o.push([a,a+3600000])}else if(gran==='d'){for(let a=a0;a<b0;a=addD(a,1))o.push([a,addD(a,1)])}else{let a=a0;while(a<b0){const nx=mo0(a,1);o.push([a,Math.min(nx,b0)]);a=nx}}return o};
  const cur=mk(r[0],r[1]),prev=mk(pr[0],pr[1]);
  const lab=([a])=>gran==='h'?String(new Date(a).getHours()):gran==='d'?String(new Date(a).getDate()):cap(new Date(a).toLocaleDateString('es-AR',{month:'short'}).replace('.',''));
  const full=([a])=>gran==='h'?pad2(new Date(a).getHours())+':00 h':gran==='d'?gFecha(a):cap(new Date(a).toLocaleDateString('es-AR',{month:'long',year:'numeric'}));
  return {gran,cur,prev,lab,full}}
function gChart(cur,prev,labs,sel,cmp){
  const W=560,H=190,L=46,R=8,T=10,B=26,n=cur.length,all=cur.concat(cmp?prev.slice(0,n):[]),mx=Math.max(0,...all);
  const step=(()=>{const raw=(mx||100)/3,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p})();
  const top=Math.ceil(mx/step)*step||step,y=v=>T+(top-v)/top*(H-T-B),cw=(W-L-R)/n,bw=Math.min(cmp?13:24,cw*(cmp?.4:.64)),z=y(0),every=Math.ceil(n/8);
  let s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Evolución de gastos">';
  for(let g=0;g<=top+1;g+=step)s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(g)+'" y2="'+y(g)+'" style="stroke:var(--line)" stroke-width="1"/><text x="'+(L-6)+'" y="'+(y(g)+4)+'" text-anchor="end" font-size="11" style="fill:var(--muted)">'+compact(g)+'</text>';
  cur.forEach((v,i)=>{const cx=L+cw*i+cw/2,x0=cmp?cx-bw-1:cx-bw/2,h=Math.max(z-y(v),v?2:0);
    if(cmp){const pv=prev[i]||0,ph=Math.max(z-y(pv),pv?2:0);s+='<rect x="'+(cx+1)+'" y="'+(z-ph)+'" width="'+bw+'" height="'+ph+'" rx="3" style="fill:var(--muted)" fill-opacity=".35"/>'}
    s+='<rect x="'+x0+'" y="'+(z-h)+'" width="'+bw+'" height="'+h+'" rx="3" style="fill:var(--c-gasto)" fill-opacity="'+(i===sel?1:.5)+'"/>';
    if(i%every===0)s+='<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" style="fill:var(--muted)">'+labs[i]+'</text>';
    s+='<rect x="'+(cx-cw/2)+'" y="0" width="'+cw+'" height="'+H+'" fill="transparent" data-a="gbar" data-i="'+i+'" style="cursor:pointer"/>'});
  return s+'</svg>'}
function gLine(H){
  const pts=H.slice(-20),W=560,Hh=180,L=50,R=14,T=14,B=26,vs=pts.map(p=>p.p),mx=Math.max(...vs),mn=Math.min(...vs),pad=(mx-mn)||mx||1,lo=Math.max(0,mn-pad*.25),hi=mx+pad*.25;
  const x=i=>L+(pts.length>1?i/(pts.length-1):.5)*(W-L-R),y=v=>T+(hi-v)/(hi-lo)*(Hh-T-B);
  let s='<svg viewBox="0 0 '+W+' '+Hh+'" width="100%" role="img" aria-label="Evolución del precio unitario">';
  [lo,(lo+hi)/2,hi].forEach(g=>{s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(g)+'" y2="'+y(g)+'" style="stroke:var(--line)"/><text x="'+(L-6)+'" y="'+(y(g)+4)+'" text-anchor="end" font-size="11" style="fill:var(--muted)">'+compact(Math.round(g))+'</text>'});
  s+='<polyline fill="none" style="stroke:var(--accent)" stroke-width="2.5" stroke-linejoin="round" points="'+pts.map((p,i)=>x(i)+','+y(p.p)).join(' ')+'"/>';
  pts.forEach((p,i)=>{s+='<circle cx="'+x(i)+'" cy="'+y(p.p)+'" r="4" style="fill:var(--accent)"/>'});
  s+='<text x="'+L+'" y="'+(Hh-8)+'" font-size="11" style="fill:var(--muted)">'+fCorta(pts[0].ts)+'</text><text x="'+(W-R)+'" y="'+(Hh-8)+'" text-anchor="end" font-size="11" style="fill:var(--muted)">'+fCorta(pts[pts.length-1].ts)+'</text>';
  return s+'</svg>'}
/* ---------- Dinero con pestañas ---------- */
function vDinero(d){
  const tabs=[['ingresos','Ingresos'],['gastos','Gastos'],['haberes','Haberes']];
  return '<div class="top"><h1>Dinero</h1></div><div class="dtabs" role="tablist" aria-label="Secciones de dinero">'+tabs.map(t=>'<button role="tab" data-a="dtab" data-v="'+t[0]+'" aria-selected="'+(S.dtab===t[0])+'">'+t[1]+'</button>').join('')+'</div><div class="dpane">'+
    (S.dtab==='gastos'?vGastos(d):S.dtab==='haberes'?vHaberes(d):vIngresos(d))+'</div>'}
function vHaberes(d){
  const per=S.hp,r=rng(per),L=d.gastos.filter(g=>g.tipo==='haberes'&&g.ts>=r[0]&&g.ts<r[1]).sort((a,b)=>b.ts-a.ts);
  return '<button class="btn" data-a="hnuevo">+ Nuevo pago de haberes</button>'+gChips('hper',[['hoy','Hoy'],['semana','Esta semana'],['mes','Este mes'],['todo','Todo']],per)+
   '<div class="card" style="margin-top:12px"><div class="k">Total pagado en haberes</div><div class="v num">'+m(sum(L,g=>g.monto))+'</div><div class="s">'+plural(L.length,'pago','pagos')+' · '+(per==='todo'?'todo el historial':PER[per].toLowerCase())+'</div></div>'+
   (L.length?'<div class="list" style="margin-top:12px">'+L.map(g=>movRow({k:'haberes',ts:g.ts,monto:g.monto,cuenta:ctaN(g.cuenta),t:g.concepto,ref:g.id})).join('')+'</div>':'<div class="empty" style="margin-top:12px"><b>Sin pagos de haberes</b>Registrá sueldos, adelantos o aguinaldos con el botón de arriba.</div>')}
/* ---------- Gastos ---------- */
function vGastos(d){
  const g=S.g,rg=gRange(g.per),st=gStats(d,rg.r),pst=gStats(d,rg.pr),pres=g.v==='presupuesto';
  let h='<button class="btn" data-a="gnuevo">+ Nuevo gasto</button>';
  if(!pres){h+=gChips('gper',GPER,g.per);
    if(g.per==='custom')h+='<div class="two" style="margin-top:8px"><div class="field"><label for="gdesde">Desde</label><input class="inp" type="date" id="gdesde" data-in="gdesde" value="'+esc(g.desde)+'"></div><div class="field"><label for="ghasta">Hasta</label><input class="inp" type="date" id="ghasta" data-in="ghasta" value="'+esc(g.hasta)+'"></div></div>';
    h+='<p class="hint" style="margin-top:6px">Período: '+gFecha(rg.r[0])+' al '+gFecha(rg.r[1]-1)+'</p>'}
  h+='<div style="margin-top:10px">'+gSeg('gv',[['resumen','Resumen'],['historial','Historial'],['productos','Productos'],['presupuesto','Presupuesto']],g.v)+'</div>';
  return h+({resumen:gResumen,historial:gHistorial,productos:gProductos,presupuesto:gPresupuesto}[g.v]||gResumen)(d,rg,st,pst)}
function gResumen(d,rg,st,pst){
  const pf=v=>(st.total>0?String(Math.round(v/st.total*1000)/10).replace('.',','):'0')+'% del total',P=pStats(d,rg.r);
  const ind=(k,v,s,x,span,cls)=>'<div class="card'+(cls?' '+cls:'')+'"'+(span?' style="grid-column:1/-1"':'')+'><div class="k">'+k+'</div><div class="v num">'+v+'</div>'+(x||'')+'<div class="s">'+s+'</div></div>';
  let h=presAlert(d);
  h+='<div class="ind" style="margin-top:12px">'+ind('Gastos totales',m(st.total),plural(st.n,'gasto','gastos')+' en el período',gDelta(st.total,pst.total),true)+
   ind('Cantidad de gastos',st.n,'Movimientos registrados')+ind('Gasto promedio',m(st.prom),st.n?'Por movimiento':'Sin movimientos')+
   ind('Gastos fijos',m(st.fijo),pf(st.fijo))+ind('Gastos variables',m(st.variable),pf(st.variable))+ind('Pagos de haberes',m(st.hab),pf(st.hab),null,false,'hab')+
   ind('En efectivo',m(st.ef),'Pagado en efectivo')+ind('Por transferencia',m(st.tr),'Pagado por transferencia')+
   ind('Productos comprados',st.nprod?plural(P.length,'producto','productos'):'—',st.nprod?plural(st.nprod,'registro','registros')+' de compra detallados':'Ningún gasto con productos detallados')+'</div>';
  /* evolución */
  const bk=gBuckets(rg.r,rg.pr),G=gastosAll(d),val=(a,b)=>sum(G.filter(x=>x.ts>=a&&x.ts<b),x=>x.monto);
  const cur=bk.cur.map(([a,b])=>val(a,b)),prev=bk.prev.map(([a,b])=>val(a,b)),nowI=bk.cur.findIndex(([a,b])=>Date.now()>=a&&Date.now()<b),sel=(S.g.sel<0||S.g.sel>=cur.length)?(nowI>=0?nowI:cur.length-1):S.g.sel,labs=bk.cur.map(bk.lab);
  h+='<div class="sec"><h2>Evolución de gastos</h2></div><div class="card">'+gChips('gcmp',[['0','Solo este período'],['1','Comparar con el anterior']],S.g.cmp?'1':'0')+'<div class="chart-wrap">'+gChart(cur,prev,labs,sel,S.g.cmp)+'</div>'+
   '<div class="cap"><b>'+esc(bk.full(bk.cur[sel]))+'</b> · '+m(cur[sel])+(S.g.cmp?' &nbsp;|&nbsp; período anterior '+(bk.prev[sel]?m(prev[sel]):'—'):'')+'</div></div>';
  /* fijo vs variable */
  const pc=v=>st.total>0?v/st.total*100:0;
  h+='<div class="sec"><h2>Fijos, variables y haberes</h2></div><div class="card">'+(st.total>0?'<div class="stk"><span style="width:'+pc(st.fijo)+'%;background:var(--accent)"></span><span style="width:'+pc(st.variable)+'%;background:var(--c-gasto)"></span><span style="width:'+pc(st.hab)+'%;background:var(--c-hab)"></span></div>'+
   '<div class="leg"><span><i style="background:var(--accent)"></i>Fijos</span><b class="num">'+m(st.fijo)+' · '+String(Math.round(pc(st.fijo)*10)/10).replace('.',',')+'%</b></div>'+
   '<div class="leg"><span><i style="background:var(--c-gasto)"></i>Variables</span><b class="num">'+m(st.variable)+' · '+String(Math.round(pc(st.variable)*10)/10).replace('.',',')+'%</b></div>'+'<div class="leg"><span><i style="background:var(--c-hab)"></i>Haberes</span><b class="num" style="color:var(--c-hab)">'+m(st.hab)+' · '+String(Math.round(pc(st.hab)*10)/10).replace('.',',')+'%</b></div>':'<p class="hint">Sin gastos en este período.</p>')+'</div>';
  /* medios de pago */
  const mr=[{n:'Efectivo',total:st.ef},{n:'Transferencia',total:st.tr}];
  h+='<div class="sec"><h2>Medios de pago</h2></div><div class="card">'+(st.total>0?bars(mr,Math.max(1,st.ef,st.tr),''):'<p class="hint">Sin gastos en este período.</p>')+'</div>';
  return h}
function gHistList(d,rg){
  const g=S.g,q=norm(g.q);
  const L=gastosAll(d).filter(x=>x.ts>=rg.r[0]&&x.ts<rg.r[1]&&(!g.tipo||(g.tipo==='haberes'?x.tipo==='haberes':(x.tipo==='gasto'&&claseDe(x)===g.tipo)))&&(!g.medio||ctaN(x.cuenta)===g.medio)&&(!q||norm(x.concepto).includes(q)||gItems(x).some(i=>norm(i.nombre).includes(q))));
  const cmp={'fecha-d':(a,b)=>b.ts-a.ts,'fecha-a':(a,b)=>a.ts-b.ts,'monto-d':(a,b)=>b.monto-a.monto,'monto-a':(a,b)=>a.monto-b.monto,'desc-a':(a,b)=>a.concepto.localeCompare(b.concepto,'es'),'desc-z':(a,b)=>b.concepto.localeCompare(a.concepto,'es')}[g.ord]||((a,b)=>b.ts-a.ts);
  return L.sort(cmp)}
function gHistorial(d,rg){
  const g=S.g,L=gHistList(d,rg),tot=sum(L,x=>x.monto);
  let h='<div class="search" style="margin-top:12px"><input class="inp" id="gq" data-in="gq" type="search" placeholder="Buscar por descripción o producto" value="'+esc(g.q)+'" autocomplete="off"></div>'+
   gChips('gtipo',[['','Todos'],['fijo','Fijo'],['variable','Variable'],['haberes','Haberes']],g.tipo)+gChips('gmedio',[['','Todos los medios'],['efectivo','Efectivo'],['banco','Transferencia']],g.medio)+
   '<div class="field" style="margin-top:10px"><label for="gord">Ordenar por</label><select class="inp" id="gord" data-in="gord">'+[['fecha-d','Fecha (más reciente)'],['fecha-a','Fecha (más antigua)'],['monto-d','Importe (mayor a menor)'],['monto-a','Importe (menor a mayor)'],['desc-a','Descripción (A-Z)'],['desc-z','Descripción (Z-A)']].map(o=>'<option value="'+o[0]+'"'+(g.ord===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></div>'+
   '<div class="card" style="margin-top:12px"><div class="k">Total de los filtros aplicados</div><div class="v num">'+m(tot)+'</div><div class="s">'+plural(L.length,'gasto','gastos')+(L.length?' · <button class="link" data-a="gexp">Exportar CSV</button>':'')+'</div></div>';
  if(!L.length)return h+'<div class="empty" style="margin-top:12px"><b>Sin gastos para mostrar</b>'+(g.q||g.tipo||g.medio?'Probá cambiando la búsqueda o los filtros.':'No hay gastos en este período. Registrá uno con el botón “Nuevo gasto”.')+'</div>';
  return h+'<div class="list" style="margin-top:12px">'+L.map(gRow).join('')+'</div>'}
function gRank(title,sub,arr,main,detail,val,unify){
  const mx=Math.max(1,...arr.map(val));
  return '<div class="sec"><h2>'+title+'</h2></div><div class="card"><p class="hint">'+sub+'</p><div class="clis">'+arr.map((e,i)=>'<div class="cli"><span class="rk'+(i<3?' top':'')+'">'+(i+1)+'</span><span class="mid"><b>'+esc(e.label)+'</b><small>'+detail(e)+'</small></span><b class="num">'+main(e)+'</b><span class="track"><span class="fill" style="width:'+Math.max(3,Math.round(val(e)/mx*100))+'%"></span></span>'+(unify?'<span style="grid-column:2/-1"><button class="link" data-a="gmerge" data-v="'+esc(e.k)+'">Unificar nombre</button></span>':'')+'</div>').join('')+'</div></div>'}
function gPrecio(d){
  const A=pStats(d,[0,Infinity]).sort((a,b)=>b.compras-a.compras||a.label.localeCompare(b.label,'es'));
  let h='<div class="sec"><h2>Evolución del precio</h2></div><div class="card">';
  if(!A.length)return h+'<p class="hint">Todavía no hay productos registrados. Cargá un gasto con productos para ver cómo cambia su precio.</p></div>';
  const k=A.some(e=>e.k===S.g.prod)?S.g.prod:A[0].k,H=pHist(d,k);
  h+='<p class="hint" style="margin-bottom:10px">Usa todo el historial de compras del producto. Solo se comparan precios en la misma unidad de medida.</p><div class="field"><label for="gprod">Producto</label><select class="inp" id="gprod" data-in="gprod">'+A.map(x=>'<option value="'+esc(x.k)+'"'+(x.k===k?' selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select></div>';
  if(H.length<2)return h+'<p class="hint" style="margin-top:12px">Todavía no hay datos suficientes para mostrar una evolución: hacen falta al menos dos compras de este producto ('+H.length+' registrada).</p></div>';
  const a=H[H.length-2],b=H[H.length-1],df=b.p-a.p,pc=a.p?Math.round(df/a.p*1000)/10:0,cl=df>0?'neg':df<0?'pos':'';
  h+='<div class="tiles3" style="margin-top:12px"><div class="card"><div class="k">Compra anterior</div><div class="v num">'+m(a.p)+'</div><div class="s">'+gFecha(a.ts)+'</div></div><div class="card"><div class="k">Última compra</div><div class="v num">'+m(b.p)+'</div><div class="s">'+gFecha(b.ts)+'</div></div><div class="card"><div class="k">Variación</div><div class="v num '+cl+'">'+mS(df)+'</div><div class="s">'+(pc>0?'+':'')+String(pc).replace('.',',')+'%</div></div></div>'+
   '<div class="chart-wrap" style="margin-top:8px">'+gLine(H)+'</div><div class="cap">Precio por '+esc(pStatsUnit(A,k))+' en las últimas '+Math.min(H.length,20)+' compras</div>';
  return h+'</div>'}
const pStatsUnit=(A,k)=>{const e=A.find(x=>x.k===k);return e?e.u:'unidad'};
function gProductos(d,rg){
  const P=pStats(d,rg.r);let h='';
  if(!P.length)h+='<div class="empty" style="margin-top:12px"><b>Sin productos en este período</b>Cuando cargues un gasto con productos detallados vas a ver cuáles comprás más y en cuáles gastás más. Los gastos sin productos no entran en estos rankings.</div>';
  else{
    const A=P.slice().sort((a,b)=>b.units-a.units||b.total-a.total).slice(0,10),B=P.slice().sort((a,b)=>b.total-a.total).slice(0,10),C=P.slice().sort((a,b)=>b.compras-a.compras||b.last-a.last).slice(0,10);
    h+=gRank('Más comprados','Por unidades compradas (top 10). Productos con distinta unidad de medida no son equivalentes.',A,e=>qty(e.units)+' '+uShort(e.u),e=>plural(e.compras,'compra','compras')+' · '+m(e.total)+' · prom. '+m(e.avg)+'/'+uShort(e.u)+' · última '+gFecha(e.last),e=>e.units,true)+
      gRank('Mayor gasto','Los productos en los que más dinero gastaste (top 10).',B,e=>m(e.total),e=>qty(e.units)+' '+uShort(e.u)+' · '+plural(e.compras,'compra','compras')+' · prom. '+m(e.avg)+'/'+uShort(e.u),e=>e.total,false)+
      gRank('Frecuencia de compra','Cantidad de compras en las que aparece cada producto, no de unidades.',C,e=>plural(e.compras,'compra','compras'),e=>'última compra '+gFecha(e.last)+' · '+qty(e.units)+' '+uShort(e.u)+' en total',e=>e.compras,false)}
  h+=gPrecio(d);
  const R=[];gastosOnly(d).filter(g=>g.ts>=rg.r[0]&&g.ts<rg.r[1]).sort((a,b)=>b.ts-a.ts).forEach(g=>gItems(g).forEach(i=>R.push({g,i})));
  h+='<div class="sec"><h2>Compras recientes</h2></div>'+(R.length?'<div class="list">'+R.slice(0,12).map(({g,i})=>'<button class="item" data-a="gdet" data-id="'+esc(g.id)+'"><span class="ava">'+esc((i.nombre||'?').charAt(0).toUpperCase())+'</span><span class="mid"><div class="t">'+esc(i.nombre)+'</div><div class="d">'+gFecha(g.ts)+' · '+qty(i.cantidad)+' '+uShort(unidadN(i.unidad))+' × '+m(i.precio)+'</div></span><span class="r"><span class="amt num">'+m(i.total)+'</span></span></button>').join('')+'</div>':'<div class="empty"><b>Sin compras de productos</b>Los productos que detalles en tus gastos aparecen acá, y podés abrir el gasto original.</div>');
  return h}
function gPresupuesto(d){
  const n=Date.now(),key=mkey(n),lim=presLimit(d,key),gas=gastoMes(d,n),p=lim?gas/lim*100:0;
  const col=p>100?'var(--bad)':p>=80?'var(--warn)':'var(--ok)';
  let h='<div class="card" style="margin-top:12px"><div class="k">Presupuesto de '+esc(cap(new Date(n).toLocaleDateString('es-AR',{month:'long',year:'numeric'})))+'</div>';
  if(!lim)h+='<p class="hint" style="margin:8px 0 12px">Todavía no definiste un límite mensual de gastos. Con un límite vas a ver cuánto te queda y recibir avisos al llegar al 80% y al superarlo.</p><button class="btn" data-a="gpres">Definir límite mensual</button>';
  else h+='<div class="v num">'+m(gas)+' <small style="font-size:15px;color:var(--muted);font-weight:600">de '+m(lim)+'</small></div><div class="pbar"><span style="width:'+Math.min(100,p)+'%;background:'+col+'"></span></div>'+
    '<div class="s">'+String(Math.round(p*10)/10).replace('.',',')+'% consumido · '+(p>100?'<b class="neg">superado por '+m(gas-lim)+'</b>':'te quedan <b>'+m(lim-gas)+'</b>')+'</div>'+
    (p>100?'<div class="banner bad" style="margin:12px 0 0"><span>Superaste el presupuesto del mes.</span></div>':p>=80?'<div class="banner warn" style="margin:12px 0 0"><span>Llegaste al 80% del presupuesto. Cuidá los próximos gastos.</span></div>':'')+
    '<button class="btn ghost" style="margin-top:12px" data-a="gpres">Cambiar límite</button>';
  h+='</div><p class="hint" style="margin-top:8px">Cuenta los gastos y los pagos de haberes. El límite se mantiene cada mes hasta que lo cambies.</p>';
  const rows=[];for(let i=0;i<12;i++){const t=mo0(n,-i),l=presLimit(d,mkey(t));if(l>0)rows.push({t,l,g:gastoMes(d,t),cur:i===0})}
  h+='<div class="sec"><h2>Historial de cumplimiento</h2></div>';
  if(!rows.length)return h+'<div class="empty"><b>Todavía no hay historial</b>Cuando definas un límite, acá vas a ver mes a mes si lo cumpliste.</div>';
  return h+'<div class="list">'+rows.map(r=>{const pp=Math.round(r.g/r.l*100),ok=r.g<=r.l;return '<div class="item"><span class="mid"><div class="t">'+esc(cap(new Date(r.t).toLocaleDateString('es-AR',{month:'long',year:'numeric'})))+'</div><div class="d">'+m(r.g)+' de '+m(r.l)+' · '+pp+'%</div></span><span class="r"><span class="tag '+(r.cur?'pendiente':ok?'cobrada':'devuelta')+'">'+(r.cur?'En curso':ok?'Cumplido':'Superado')+'</span></span></div>'}).join('')+'</div>'}
/* ---------- formularios del módulo de gastos ---------- */
const blankG=()=>({nombre:'',cantidad:'1',unidad:'',precio:''});
const numStr=n=>String(n).replace('.',',');
function gItemHtml(it,i){
  const id=x=>x+'-'+i;
  return '<div class="itm gi" data-i="'+i+'"><div class="itm-h"><b>Producto '+(i+1)+'</b><button type="button" class="link" data-a="grm" data-i="'+i+'">Quitar</button></div>'+
  '<div class="field"><label for="'+id('gn')+'">Nombre</label><input class="inp gi-n" id="'+id('gn')+'" list="dl-gp" autocomplete="off" autocapitalize="sentences" placeholder="Ej: Café, Leche, Carne molida" value="'+esc(it.nombre)+'"></div>'+
  '<div class="two"><div class="field"><label for="'+id('gc')+'">Cantidad</label><input class="inp gi-c" id="'+id('gc')+'" data-in="gcalc" inputmode="decimal" value="'+esc(it.cantidad)+'"></div><div class="field"><label for="'+id('gu')+'">Unidad (opcional)</label><input class="inp gi-u" id="'+id('gu')+'" list="dl-gu" autocomplete="off" placeholder="unidad" value="'+esc(it.unidad)+'"></div></div>'+
  '<div class="field"><label for="'+id('gp')+'">Precio unitario ($)</label><input class="inp gi-p" id="'+id('gp')+'" data-in="gcalc" inputmode="decimal" placeholder="0" value="'+esc(it.precio)+'"></div>'+
  '<div class="itm-sub"><span>Subtotal</span><b class="num gi-sub">$ 0</b></div></div>'}
const gItemsHtml=a=>a.length?a.map(gItemHtml).join(''):'<p class="hint">Sin productos: el gasto se registra como un importe general.</p>';
const readG=()=>[...document.querySelectorAll('#gitems .gi')].map(r=>({nombre:r.querySelector('.gi-n').value,cantidad:r.querySelector('.gi-c').value,unidad:r.querySelector('.gi-u').value,precio:r.querySelector('.gi-p').value}));
function drawG(){const b=$('#gitems');if(b){b.innerHTML=gItemsHtml(S.sheet.items);calcG()}}
function calcG(){
  let tot=0,rows=0;
  document.querySelectorAll('#gitems .gi').forEach(r=>{rows++;const c=parseAR(r.querySelector('.gi-c').value),p=parseAR(r.querySelector('.gi-p').value),s=(isFinite(c)&&isFinite(p)&&c>0&&p>=0)?Math.round(c*toC(p)):0;tot+=s;r.querySelector('.gi-sub').textContent=m(s)});
  const mo=document.getElementById('gm-monto'),info=document.getElementById('gm-info');if(!mo)return;
  if(tot>0&&(mo.dataset.auto==='1'||!mo.value.trim())){mo.value=inputNum(tot);mo.dataset.auto='1'}
  else if(!rows&&mo.dataset.auto==='1'){mo.value='';}
  if(info){const im=toC(parseAR(mo.value));
    info.innerHTML=rows?'<span>Total de productos</span><b class="num">'+m(tot)+'</b>':'';
    if(rows&&isFinite(im)&&im>tot&&tot>0)info.innerHTML+='<span style="grid-column:1/-1;display:block;font-size:13px;margin-top:2px">Otros conceptos (sin detallar): <b>'+m(im-tot)+'</b></span>';
    if(rows&&isFinite(im)&&im<tot)info.innerHTML+='<span style="grid-column:1/-1;display:block;color:var(--bad);font-size:13px;margin-top:2px">El importe total no puede ser menor que la suma de los productos.</span>'}}
function shGastoM(sh){
  const old=sh.id?D().gastos.find(x=>x.id===sh.id):null;
  const o=old||{ts:Date.now(),concepto:'',monto:0,cuenta:'efectivo',clase:'variable',notas:''};
  const names=[],seen=new Set();gastosOnly(D()).slice().sort((a,b)=>b.ts-a.ts).forEach(g=>gItems(g).forEach(i=>{const k=norm(i.nombre);if(k&&!seen.has(k)){seen.add(k);names.push(i.nombre)}}));
  const dl=(id,a)=>'<datalist id="'+id+'">'+a.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist>';
  const its=sh.items,auto=!old||(gItems(old).length&&sum(gItems(old),i=>i.total)===old.monto);
  return head(old?'Editar gasto':'Nuevo gasto')+'<div class="form">'+
  '<div class="field"><label for="gm-con">Descripción</label><input class="inp" id="gm-con" autocomplete="off" placeholder="Ej: Compra de supermercado, Combustible, Alquiler" value="'+esc(o.concepto)+'"></div>'+
  '<div class="field"><label for="gm-monto">Importe total ($)</label><input class="inp" id="gm-monto" data-in="gmonto"'+(auto?' data-auto="1"':'')+' inputmode="decimal" placeholder="0" value="'+inputNum(o.monto)+'"></div>'+
  '<div class="field"><label for="gm-ts">Fecha</label><input class="inp" type="datetime-local" id="gm-ts" value="'+toInput(o.ts)+'"></div>'+
  '<div class="field"><span class="lab">Tipo de gasto</span>'+chipsOf('clase',[['fijo','Fijo'],['variable','Variable']],claseDe(o))+'</div>'+
  '<div class="field"><span class="lab">Medio de pago</span>'+chipsOf('cuenta',cuentaOpts(),ctaN(o.cuenta))+'</div>'+
  '<div class="field"><label for="gm-notas">Notas (opcional)</label><textarea class="inp" id="gm-notas" rows="2" placeholder="Información adicional">'+esc(o.notas)+'</textarea></div>'+
  '<div class="sec" style="margin:6px 2px 0"><h2 style="font-size:16px">Productos comprados <small style="color:var(--muted);font-weight:500">(opcional)</small></h2></div>'+
  '<p class="hint" style="margin-top:-8px">Detallalos para saber después cuáles comprás más y cuánto gastás en cada uno.</p>'+
  '<div id="gitems" class="form">'+gItemsHtml(its)+'</div>'+
  '<button type="button" class="btn ghost" data-a="gadd">+ Agregar producto</button><div class="itm-sub" id="gm-info" style="display:grid;grid-template-columns:1fr auto"></div>'+
  dl('dl-gp',names)+dl('dl-gu',UNIDADES)+'</div>'+
  '<div class="sh-foot"><div class="err" id="gm-err" role="alert"></div><button class="btn" data-a="save-gm">'+(old?'Guardar cambios':'Guardar gasto')+'</button></div>'}
async function doSaveGM(){
  const sh=S.sheet,old=sh.id?D().gastos.find(x=>x.id===sh.id):null,err=t=>{$('#gm-err').textContent=t};
  const concepto=val('gm-con').trim();if(!concepto)return err('Escribí la descripción del gasto.');
  const raw=readG(),items=[];
  for(let i=0;i<raw.length;i++){const r=raw[i];
    if(!r.nombre.trim()&&!r.precio.trim()&&(r.cantidad.trim()===''||r.cantidad.trim()==='1')&&!r.unidad.trim())continue;
    const E=t=>err('Producto '+(i+1)+': '+t),c=parseAR(r.cantidad),p=parseAR(r.precio);
    if(!r.nombre.trim())return E('escribí el nombre.');
    if(!(c>0))return E('la cantidad tiene que ser mayor a 0.');
    if(isNaN(p)||p<0)return E('ingresá el precio unitario.');
    const pc=toC(p);items.push({nombre:r.nombre.trim(),cantidad:c,unidad:r.unidad.trim()?unidadN(r.unidad):'',precio:pc,total:Math.round(c*pc)})}
  const pt=sum(items,i=>i.total);let monto=val('gm-monto').trim()?toC(parseAR(val('gm-monto'))):(pt||NaN);
  if(isNaN(monto)||!(monto>0))return err('Ingresá el importe total del gasto.');
  if(items.length&&monto<pt)return err('El importe total ('+m(monto)+') no puede ser menor que la suma de los productos ('+m(pt)+').');
  let ts=new Date(val('gm-ts')).getTime();if(!isFinite(ts))ts=Date.now();
  const doc=Object.assign({},old||{},{ts,tipo:'gasto',concepto,monto,cuenta:grpVal('cuenta')||'efectivo',clase:grpVal('clase')||'variable',notas:val('gm-notas').trim(),items,upd:Date.now()});
  try{await put('gastos',old?old.id:newId(),doc);
    await log(old?'Gasto "'+concepto+'" editado'+(old.monto!==monto?': '+m(old.monto)+' → '+m(monto):''):'Gasto "'+concepto+'" por '+m(monto));
    closeSheet();toast(old?'Cambios guardados':'Gasto guardado')}catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shGastoDet(sh){
  const g=D().gastos.find(x=>x.id===sh.id);if(!g)return null;
  const its=gItems(g),pt=sum(its,i=>i.total),kv=(k,v)=>v?'<dt>'+k+'</dt><dd>'+v+'</dd>':'';
  let h=head(esc(g.concepto))+'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div class="num" style="font-size:32px;font-weight:800">'+m(g.monto)+'</div><span class="tag '+(claseDe(g)==='fijo'?'parcial':'cancelada')+'">'+CLASES[claseDe(g)]+'</span></div>';
  if(g.demo)h+='<div class="banner"><span>Esto es un ejemplo. Registrá tu primer gasto o venta para empezar.</span></div>';
  h+='<div class="card"><dl class="kv" style="margin:0">'+kv('Fecha',gFecha(g.ts)+' · '+fHora(g.ts))+kv('Tipo de gasto',CLASES[claseDe(g)])+kv('Medio de pago',CUENTAS[ctaN(g.cuenta)])+kv('Notas',esc(g.notas))+'</dl></div>';
  if(its.length){h+='<div class="sec" style="margin-top:16px"><h2 style="font-size:16px">Productos ('+its.length+')</h2></div><div class="card"><ul class="hist its">'+its.map(i=>'<li class="itl"><span class="mid"><b>'+esc(i.nombre)+'</b><small>'+qty(i.cantidad)+' '+uShort(unidadN(i.unidad))+' × '+m(i.precio)+'</small></span><b class="num">'+m(i.total)+'</b></li>').join('')+'</ul>'+
    '<dl class="kv" style="margin:12px 0 0;padding-top:10px;border-top:1px solid var(--line)">'+kv('Total de productos','<b>'+m(pt)+'</b>')+(g.monto>pt?kv('Otros conceptos',m(g.monto-pt)):'')+'</dl></div>'}
  else h+='<p class="hint" style="margin-top:12px">Gasto general, sin productos detallados.</p>';
  if(g.demo)return h;
  return h+'<div class="btns" style="margin-top:16px"><button class="btn sec2" data-a="gedit" data-id="'+esc(g.id)+'">Editar</button><button class="btn ghost" data-a="gdel" data-id="'+esc(g.id)+'">Eliminar</button></div>'}
function shMerge(sh){
  const A=pStats(D(),[0,Infinity]),e=A.find(x=>x.k===sh.k);if(!e)return null;
  const dl='<datalist id="dl-mg">'+A.filter(x=>x.k!==e.k).map(x=>'<option value="'+esc(x.n)+'">').join('')+'</datalist>';
  return head('Unificar nombre')+'<p class="hint" style="margin:-6px 0 14px">Todas las compras de “'+esc(e.label)+'” van a pasar a llamarse como escribas acá. Si ya existe otro producto con ese nombre, sus estadísticas se juntan. Los precios históricos no cambian.</p><div class="form">'+
   '<div class="field"><label for="mg-name">Nombre correcto</label><input class="inp" id="mg-name" list="dl-mg" autocomplete="off" value="'+esc(e.n)+'"></div>'+dl+
   '<div class="err" id="mg-err" role="alert"></div><button class="btn" data-a="save-merge">Unificar</button></div>'}
async function doMerge(){
  const sh=S.sheet,nn=val('mg-name').trim(),err=t=>{$('#mg-err').textContent=t};if(!nn)return err('Escribí el nombre.');
  const jobs=D().gastos.filter(g=>g.tipo==='gasto'&&gItems(g).some(i=>pKey(i)===sh.k));
  try{await pool(jobs,async g=>{const c=cloneV(g);c.items=c.items.map(i=>pKey(i)===sh.k?Object.assign({},i,{nombre:nn}):i);await put('gastos',g.id,c)},4);
    await log('Producto unificado como "'+nn+'" ('+plural(jobs.length,'compra','compras')+')');closeSheet();toast('Nombre unificado')}catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shPres(){
  const key=mkey(Date.now()),lim=presLimit(D(),key);
  return head('Presupuesto mensual')+'<p class="hint" style="margin:-6px 0 14px">Límite de gastos por mes. Se aplica desde este mes y se mantiene hasta que lo cambies.</p><div class="form">'+
   '<div class="field"><label for="pr-lim">Límite mensual ($)</label><input class="inp" id="pr-lim" inputmode="decimal" placeholder="0" value="'+inputNum(lim)+'"></div>'+
   '<div class="err" id="pr-err" role="alert"></div><button class="btn" data-a="save-pres">Guardar límite</button>'+(lim?'<button class="btn ghost" data-a="pres-off">Quitar límite</button>':'')+'</div>'}
async function doSavePres(off){
  if(D().demo)return $('#pr-err').textContent='Es un ejemplo. Registrá tu primer gasto o venta para empezar.';
  const key=mkey(Date.now());let v=0;
  if(!off){v=toC(parseAR(val('pr-lim')));if(!(v>0))return $('#pr-err').textContent='Ingresá un límite mayor a 0.'}
  const cur=Object.assign({},(S.config&&S.config.presupuestos)||{});cur[key]=v;
  try{await put('meta','config',Object.assign({},S.config,{presupuestos:cur}));await log(off?'Presupuesto mensual quitado':'Presupuesto mensual: '+m(v));closeSheet();toast(off?'Límite quitado':'Límite guardado')}catch(e){$('#pr-err').textContent='No se pudo guardar. Probá de nuevo.'}}

/* ---------- Estadísticas: gastos, haberes y más ---------- */
const ubars=(rows,fmt,cls)=>{const mx=Math.max(1,...rows.map(r=>r.v));return '<div class="bars">'+rows.map(r=>'<div class="br"><span class="nm">'+esc(r.n)+'</span><b class="num">'+fmt(r.v,r)+'</b><div class="track"><div class="fill'+(cls?' '+cls:'')+'" style="width:'+Math.max(3,Math.round(r.v/mx*100))+'%"></div></div></div>').join('')+'</div>'};
function statsExtra(d,r,pr,s){
  const st=gStats(d,r),pst=gStats(d,pr),P=pStats(d,r),f1=v=>String(Math.round(v*10)/10).replace('.',','),pc=v=>st.total>0?v/st.total*100:0;
  let h='<div class="sec"><h2>Gastos y haberes</h2></div><div class="card">';
  if(st.total>0){h+='<div class="k" style="margin-bottom:2px">Total de egresos</div><div class="v num" style="font-size:24px;font-weight:800">'+m(st.total)+'</div><div style="margin:4px 0 8px">'+gDelta(st.total,pst.total)+'</div>'+
    '<div class="stk"><span style="width:'+pc(st.fijo)+'%;background:var(--accent)"></span><span style="width:'+pc(st.variable)+'%;background:var(--c-gasto)"></span><span style="width:'+pc(st.hab)+'%;background:var(--c-hab)"></span></div>'+
    '<div class="leg"><span><i style="background:var(--accent)"></i>Gastos fijos</span><b class="num">'+m(st.fijo)+' · '+f1(pc(st.fijo))+'%</b></div>'+
    '<div class="leg"><span><i style="background:var(--c-gasto)"></i>Gastos variables</span><b class="num">'+m(st.variable)+' · '+f1(pc(st.variable))+'%</b></div>'+
    '<div class="leg"><span><i style="background:var(--c-hab)"></i>Pagos de haberes</span><b class="num" style="color:var(--c-hab)">'+m(st.hab)+' · '+f1(pc(st.hab))+'%</b></div>'}
  else h+='<p class="hint">Sin gastos ni haberes en este período.</p>';
  h+='</div><div class="sec"><h2>Pagado por medio de pago</h2></div><div class="card">'+(st.total>0?bars([{n:'Efectivo',total:st.ef},{n:'Transferencia',total:st.tr}],Math.max(1,st.ef,st.tr),''):'<p class="hint">Todavía no pagaste nada en este período.</p>')+'</div>';
  const pb=P.slice().sort((a,b)=>b.total-a.total).slice(0,5),pu=P.slice().sort((a,b)=>b.units-a.units||b.total-a.total).slice(0,5);
  h+='<div class="sec"><h2>Productos que comprás</h2></div><div class="card">'+(P.length?'<div class="lab" style="margin-bottom:8px">Mayor gasto</div>'+ubars(pb.map(e=>({n:e.label,v:e.total})),m,'gas')+'<div class="lab" style="margin:14px 0 8px">Más unidades</div>'+ubars(pu.map(e=>({n:e.label,v:e.units,u:e.u})),(x,r)=>qty(x)+' '+uShort(r.u),''):'<p class="hint">Sin productos detallados en tus gastos de este período. Podés cargarlos al registrar un gasto.</p>')+'</div>';
  const n=Date.now(),lim=presLimit(d,mkey(n));
  if(lim){const g=gastoMes(d,n),p=g/lim*100,col=p>100?'var(--bad)':p>=80?'var(--warn)':'var(--ok)';
    h+='<div class="sec"><h2>Presupuesto del mes</h2></div><div class="card"><div class="v num" style="font-size:22px;font-weight:800">'+m(g)+' <small style="font-size:14px;color:var(--muted);font-weight:600">de '+m(lim)+'</small></div><div class="pbar"><span style="width:'+Math.min(100,p)+'%;background:'+col+'"></span></div><div class="s" style="color:var(--muted);font-size:13px">'+f1(p)+'% consumido · '+(p>100?'<b class="neg">superado por '+m(g-lim)+'</b>':'te quedan <b>'+m(lim-g)+'</b>')+'</div></div>'}
  const env={};s.vs.forEach(o=>{const k=o.envio||'Sin envío';const e=env[k]||(env[k]={n:k,c:0,v:0});e.c++;e.v+=o.total});
  const er=Object.values(env).sort((a,b)=>b.v-a.v).map(e=>({n:e.n+' · '+plural(e.c,'venta','ventas'),total:e.v}));
  h+='<div class="sec"><h2>Ventas por envío</h2></div><div class="card">'+(er.length?bars(er,Math.max(1,...er.map(x=>x.total)),''):'<p class="hint">Sin ventas cobradas en este período.</p>')+'</div>';
  const todos=d.ventas.filter(o=>o.ts>=r[0]&&o.ts<r[1]),es=Object.keys(ESTADOS).map(k=>({n:ESTADOS[k],v:todos.filter(o=>o.estado===k).length})).filter(x=>x.v);
  h+='<div class="sec"><h2>Pedidos por estado</h2></div><div class="card">'+(es.length?ubars(es,x=>String(x),''):'<p class="hint">Sin pedidos en este período.</p>')+'</div>';
  return h}

/* ---------- Estadísticas: productos vendidos y agregados ---------- */
function prodList(vs){
  const A=groupBy(vs,'producto');if(!A.length)return '<p class="hint">Sin ventas en este período.</p>';
  const by=S.prodBy==='unidades';A.sort(by?(a,b)=>b.u-a.u||b.total-a.total:(a,b)=>b.total-a.total);
  const L=S.prodAll?A:A.slice(0,5),mx=Math.max(1,...L.map(x=>by?x.u:x.total));
  return gSeg('prodby',[['monto','Por monto'],['unidades','Por unidades']],S.prodBy)+'<div class="bars" style="margin-top:12px">'+L.map((x,i)=>'<div class="br"><span class="nm">'+(i+1)+'. '+esc(x.n)+'</span><b class="num">'+m(x.total)+'</b><small class="un"><b>'+qty(x.q)+'</b> '+(x.q===1?'vendido':'vendidos')+(x.u!==x.q?' · equivale a <b>'+qty(x.u)+'</b> unidades':'')+'</small><div class="track"><div class="fill" style="width:'+Math.max(3,Math.round((by?x.u:x.total)/mx*100))+'%"></div></div></div>').join('')+'</div>'+
    (A.length>5?'<button class="btn ghost" style="margin-top:4px" data-a="prodall">'+(S.prodAll?'Ver solo los 5 primeros':'Ver lista completa ('+A.length+' productos)')+'</button>':'')}
function agregadosHtml(vs){
  const mp=new Map(),add=(t,q,rev)=>{const k=norm(t);if(!k)return;const e=mp.get(k)||{n:t,v:0,rev:0};e.v+=q;e.rev+=rev;mp.set(k,e)};
  vs.forEach(o=>{const fd=descF(o);itemsOf(o).forEach(it=>{if(it.extras&&it.extras.length)it.extras.forEach(x=>add(x.n,it.cantidad,Math.round(it.cantidad*(x.p||0)*fd)));
    else if(it.agregados)String(it.agregados).split(/[,;+\n]|\sy\s/i).map(x=>x.trim()).filter(Boolean).forEach(t=>add(t,it.cantidad,0))})});
  const L=[...mp.values()].sort((a,b)=>b.v-a.v||b.rev-a.rev).slice(0,8),tot=sum([...mp.values()],e=>e.rev);
  return '<div class="sec"><h2>Agregados más pedidos</h2></div><div class="card">'+(L.length?ubars(L,(x,r)=>qty(x)+(r.rev?' · '+m(r.rev):''),'')+(tot?'<p class="hint" style="margin-top:10px">Ingresos por agregados: <b>'+m(tot)+'</b> (ya incluidos en el total vendido).</p>':''):'<p class="hint">Todavía no registraste agregados. Podés cargarlos con su precio en cada producto al hacer una venta (medallón extra, huevo, jamón…).</p>')+'</div>'}
/* ---------- Ventas: pestañas Ventas / Clientes ---------- */
S.vtab='ventas';S.vcli='';S.cl={q:'',ord:'compras',fil:'todos',est:'todas'};
function vVentas(d){
  const tabs=[['ventas','Ventas'],['clientes','Clientes']];
  return '<div class="top"><h1>Ventas</h1><button class="pill-btn" data-a="nueva">'+ico('plus',18)+' Venta</button></div><div class="dtabs" role="tablist" aria-label="Secciones de ventas">'+tabs.map(t=>'<button role="tab" data-a="vtab" data-v="'+t[0]+'" aria-selected="'+(S.vtab===t[0])+'">'+t[1]+'</button>').join('')+'</div><div class="dpane">'+
    (S.vtab==='clientes'?(S.vcli?vCliente(d):vClientes(d)):vVentasLista(d))+'</div>'}
function clientesAgg(d){const mp=new Map();
  d.ventas.forEach(o=>{const nm=(o.cliente||'').trim(),k=norm(nm);if(!k||k==='mostrador')return;
    const e=mp.get(k)||{k,n:nm,compras:0,total:0,deuda:0,pend:0,pedidos:0,last:0,units:0};
    e.pedidos++;if(o.ts>=e.last){e.last=o.ts;e.n=nm}
    if(valida(o)){const pc=porCobrarDe(o);if(pc>0){e.deuda+=pc;e.pend++}}
    if(o.estado==='cobrada'){e.compras++;e.total+=o.total;e.units+=sum(itemsOf(o),itUnits)}
    mp.set(k,e)});
  return [...mp.values()]}
function vClientes(d){
  const c=S.cl,q=norm(c.q),all=clientesAgg(d);
  const F={todos:()=>true,deuda:e=>e.deuda>0,uno:e=>e.compras===1,algunas:e=>e.compras>=2&&e.compras<=4,muchas:e=>e.compras>=5};
  const L=all.filter(e=>(!q||norm(e.n).includes(q))&&(F[c.fil]||F.todos)(e));
  const ORD={compras:(a,b)=>b.compras-a.compras||b.total-a.total,monto:(a,b)=>b.total-a.total||b.compras-a.compras,reciente:(a,b)=>b.last-a.last,nombre:(a,b)=>a.n.localeCompare(b.n,'es'),deuda:(a,b)=>b.deuda-a.deuda||b.total-a.total};
  L.sort(ORD[c.ord]||ORD.compras);
  let h='<div class="search"><input class="inp" id="clq" data-in="clq" type="search" placeholder="Buscar cliente por nombre" value="'+esc(c.q)+'" autocomplete="off"></div>'+
   gChips('clfil',[['todos','Todos'],['deuda','Con deuda'],['uno','1 compra'],['algunas','2 a 4 compras'],['muchas','5 o más']],c.fil)+
   '<div class="field" style="margin-top:10px"><label for="clord">Ordenar por</label><select class="inp" id="clord" data-in="clord">'+[['compras','Más compras'],['monto','Mayor monto comprado'],['reciente','Compra más reciente'],['deuda','Mayor deuda'],['nombre','Nombre (A-Z)']].map(o=>'<option value="'+o[0]+'"'+(c.ord===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></div>'+
   '<div class="card" style="margin-top:12px"><div class="k">'+plural(L.length,'cliente','clientes')+(L.length!==all.length?' de '+all.length:'')+'</div><div class="v num">'+m(sum(L,e=>e.total))+'</div><div class="s">Comprado en total'+(sum(L,e=>e.deuda)?' · <b class="neg">por cobrar '+m(sum(L,e=>e.deuda))+'</b>':'')+'</div></div>';
  if(!all.length)return h+'<div class="empty" style="margin-top:12px"><b>Todavía no hay clientes</b>Escribí el nombre del cliente al cargar una venta y va a aparecer acá con todo su historial. Las ventas de “Mostrador” no se listan.</div>';
  if(!L.length)return h+'<div class="empty" style="margin-top:12px"><b>Ningún cliente coincide</b>Probá con otro nombre o cambiá los filtros.</div>';
  return h+'<div class="list" style="margin-top:12px">'+L.map(e=>'<button class="item" data-a="cvc" data-v="'+esc(e.k)+'"><span class="ava">'+esc(e.n.charAt(0).toUpperCase())+'</span><span class="mid"><div class="t">'+esc(e.n)+'</div><div class="d">'+plural(e.compras,'compra','compras')+(e.pend?' · '+plural(e.pend,'pendiente','pendientes'):'')+' · última '+fCorta(e.last)+'</div></span><span class="r"><span class="amt num">'+m(e.total)+'</span>'+(e.deuda?'<span class="tag pendiente">Debe '+m(e.deuda)+'</span>':'')+'</span></button>').join('')+'</div>'}
function vCliente(d){
  const e=clientesAgg(d).find(x=>x.k===S.vcli);if(!e){S.vcli='';return vClientes(d)}
  const all=d.ventas.filter(o=>norm(o.cliente||'Mostrador')===e.k).sort((a,b)=>b.ts-a.ts),est=S.cl.est,L=est==='todas'?all:all.filter(o=>o.estado===est);
  const pm=new Map();all.filter(o=>o.estado==='cobrada').forEach(o=>itemsOf(o).forEach(it=>{const k=norm(it.producto),x=pm.get(k)||{n:it.producto,u:0};x.u+=it.cantidad;pm.set(k,x)}));
  const fav=[...pm.values()].sort((a,b)=>b.u-a.u).slice(0,3).map(x=>esc(x.n)+' ×'+qty(x.u)).join(' · ');
  const ind=(k,v,s,cls)=>'<div class="card'+(cls?' '+cls:'')+'"><div class="k">'+k+'</div><div class="v num">'+v+'</div><div class="s">'+s+'</div></div>';
  return '<button class="link" data-a="cback" style="margin-bottom:10px">‹ Todos los clientes</button><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span class="ava" style="width:50px;height:50px;font-size:20px">'+esc(e.n.charAt(0).toUpperCase())+'</span><div style="min-width:0"><h2 style="font-size:22px;overflow-wrap:anywhere">'+esc(e.n)+'</h2><div class="date">Cliente desde '+fCorta(all[all.length-1].ts)+'</div></div></div>'+
   '<div class="ind">'+ind('Total comprado',m(e.total),plural(e.compras,'compra cobrada','compras cobradas'))+ind('Ticket promedio',e.compras?m(Math.round(e.total/e.compras)):'—','Por compra')+
   ind('Por cobrar',m(e.deuda),e.pend?plural(e.pend,'pedido pendiente','pedidos pendientes'):'Sin deuda',e.deuda?'gas':'')+ind('Unidades',qty(e.units),'En sus compras cobradas')+'</div>'+
   (fav?'<p class="hint" style="margin-top:10px">Pide más: <b style="color:var(--ink)">'+fav+'</b></p>':'')+
   '<div class="sec"><h2>Historial de compras</h2></div>'+gChips('vcest',[['todas','Todas <i>'+all.length+'</i>'],['cobrada','Cobradas <i>'+all.filter(o=>o.estado==='cobrada').length+'</i>'],['pendiente','Pendientes <i>'+all.filter(o=>o.estado==='pendiente').length+'</i>'],['cancelada','Canceladas'],['devuelta','Devueltas']],est)+
   (L.length?'<div class="list" style="margin-top:10px">'+L.map(ventaRow).join('')+'</div><p class="hint" style="margin-top:10px">Tocá una venta para ver el detalle, cobrarla o editarla.</p>':'<div class="empty" style="margin-top:10px"><b>Sin ventas con ese estado</b>Probá con otro filtro.</div>')}

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
const blankItem=()=>({producto:'',variante:'',extras:[],cantidad:'1',precio:'',costo:'',categoria:''});
const extrasOf=i=>(i.extras&&i.extras.length)?i.extras.map(e=>({n:e.n,p:inputNum(e.p)})):String(i.agregados||'').split(/[,;]/).map(x=>x.trim()).filter(Boolean).map(n=>({n,p:''}));
function openSheet(sh){
  const f={detalle:shDetalle,venta:shVenta,cobro:shCobro,gasto:shGasto,transf:shTransf,saldos:shSaldos,confirm:shConfirm,gastoM:shGastoM,gastoDet:shGastoDet,merge:shMerge,pres:shPres}[sh.type];
  const prev=document.querySelector('.sheet'),top=prev?prev.scrollTop:0;
  if(sh.type==='venta'&&!sh.items){const old=sh.id?findV(sh.id):null;
    sh.items=old?itemsOf(old).map(i=>({producto:i.producto||'',variante:i.variante||'',cantidad:qty(i.cantidad),precio:inputNum(i.precio),costo:inputNum(i.costo),categoria:i.categoria||'',extras:extrasOf(i)})):[blankItem()]}
  if(sh.type==='gastoM'&&!sh.items){const og=sh.id?D().gastos.find(x=>x.id===sh.id):null;sh.items=og?gItems(og).map(i=>({nombre:i.nombre,cantidad:numStr(i.cantidad),unidad:i.unidad||'',precio:inputNum(i.precio)})):[]}
  S.sheet=sh;
  const html=f(sh);if(html==null){closeSheet();return}
  $('#layer').innerHTML='<div class="scrim" data-a="scrim"><div class="sheet'+(sh.type==='venta'||sh.type==='gastoM'?' fx':'')+(prev?' noanim':'')+'" role="dialog" aria-modal="true">'+html+'</div></div>';
  lockScroll(true);
  if(prev&&sh.type==='detalle')document.querySelector('.sheet').scrollTop=top;
  if(sh.type==='gastoM')calcG();
  if(sh.type==='venta'){calcTotal();if(!sh.id&&window.matchMedia&&matchMedia('(hover:hover)').matches)setTimeout(()=>{const e=document.querySelector('.i-prod');if(e)e.focus({preventScroll:true})},60)}}
function readItems(){return [...document.querySelectorAll('#items .itm')].map(r=>{const v=r.querySelector('.vars [aria-pressed="true"]');return {producto:r.querySelector('.i-prod').value,variante:v?v.dataset.v:'',cantidad:r.querySelector('.i-cant').value,precio:r.querySelector('.i-precio').value,costo:r.querySelector('.i-costo').value,categoria:r.querySelector('.i-cat').value,extras:[...r.querySelectorAll('.agr')].map(a=>({n:a.querySelector('.a-n').value,p:a.querySelector('.a-p').value}))}})}
function calcTotal(){let t=0;const rows=document.querySelectorAll('#items .itm');
  rows.forEach(r=>{const c=parseAR(r.querySelector('.i-cant').value),p=parseAR(r.querySelector('.i-precio').value),ex=[...r.querySelectorAll('.a-p')].reduce((a,e)=>{const v=parseAR(e.value);return a+(isFinite(v)&&v>0?toC(v):0)},0);const s=(isFinite(c)&&isFinite(p))?Math.round(c*(toC(p)+ex)):0;t+=s;const e=r.querySelector('.i-sub');if(e)e.textContent=m(s)});
  const pi=$('#v-dpct'),pv=pi?parseAR(pi.value):NaN,pct=(isFinite(pv)&&pv>0)?Math.min(100,pv):0,dm=Math.round(t*pct/100);
  const el=$('#v-total');if(el)el.textContent=m(t-dm);
  const dme=$('#v-dm');if(dme)dme.textContent='- '+m(dm);
  const sl=$('#v-subl');if(sl){sl.hidden=!(dm>0);sl.innerHTML='<span>Subtotal '+m(t)+'</span><b class="neg">Descuento -'+m(dm)+'</b>'}
  document.querySelectorAll('[data-a=dpct]').forEach(b=>b.setAttribute('aria-pressed',String(!!pi&&pv===+b.dataset.v)));const tl=$('#v-tl');if(tl)tl.textContent=rows.length>1?'Total · '+rows.length+' productos':'Total'}
const rowVar=row=>{const v=row.querySelector('.vars [aria-pressed="true"]');return v?v.dataset.v:''};
function lookupItem(name,vari){const q=norm(name);if(!q)return null;let p=null;
  S.ventas.slice().sort((a,b)=>b.ts-a.ts).some(o=>itemsOf(o).some(it=>{if(norm(it.producto)===q&&(it.variante||'')===(vari||'')&&it.precio>0){p=it;return true}return false}));return p}
function fillRow(row){const pr=row.querySelector('.i-precio');if(pr.value&&pr.dataset.auto!=='1')return;
  const p=lookupItem(row.querySelector('.i-prod').value,rowVar(row));if(!p)return;
  pr.value=inputNum(p.precio);pr.dataset.auto='1';const c=row.querySelector('.i-costo'),k=row.querySelector('.i-cat');
  if(p.costo&&!c.value)c.value=inputNum(p.costo);if(p.categoria&&!k.value)k.value=p.categoria;calcTotal()}
function cbList(q){const nq=norm(q),known=new Set(MENU.map(x=>norm(x.n))),seen=new Set(),otros=[];
  S.ventas.slice().sort((a,b)=>b.ts-a.ts).forEach(o=>itemsOf(o).forEach(it=>{const n=(it.producto||'').trim(),k=norm(n);if(n&&!known.has(k)&&!seen.has(k)){seen.add(k);otros.push({n,c:it.categoria||''})}}));
  const btn=x=>'<button type="button" role="option" data-a="cb-pick" data-v="'+esc(x.n)+'" data-c="'+esc(x.c)+'">'+esc(x.n)+'</button>';
  const menu=MENU.filter(x=>!nq||norm(x.n).includes(nq)),oth=otros.filter(x=>!nq||norm(x.n).includes(nq));
  let h='';
  if(nq&&!MENU.concat(otros).some(x=>norm(x.n)===nq))h+='<button type="button" class="cb-use" data-a="cb-pick" data-v="'+esc(q.trim())+'" data-c="">Usar “'+esc(q.trim())+'”</button>';
  if(menu.length)h+='<div class="cb-h">Mi carta</div>'+menu.map(btn).join('');
  if(oth.length)h+='<div class="cb-h">Otros que ya vendiste</div>'+oth.map(btn).join('');
  return h}
function cbClose(keep){document.querySelectorAll('.cb').forEach(b=>{if(!keep||b!==keep.closest('.cbw').querySelector('.cb'))b.hidden=true})}
function cbOpen(input,typed){const box=input.closest('.cbw').querySelector('.cb');cbClose(input);
  const exact=MENU.some(x=>norm(x.n)===norm(input.value));
  box.innerHTML=cbList(typed&&!exact?input.value:(exact?'':input.value));box.hidden=false;
  requestAnimationFrame(()=>{try{box.scrollIntoView({block:'nearest'})}catch(e){}})}
function drawItems(){const box=$('#items');if(!box)return;box.innerHTML=itemsHtml(S.sheet.items);calcTotal()}
function shDetalle(sh){
  const o=findV(sh.id);if(!o)return null;
  const cob=cobrado(o),pc=porCobrarDe(o),par=o.estado==='pendiente'&&cob>0,its=itemsOf(o);
  const tag=par?'<span class="tag parcial">Parcial</span>':'<span class="tag '+o.estado+'">'+ESTADOS[o.estado]+'</span>';
  const kv=(k,v)=>v?'<dt>'+k+'</dt><dd>'+v+'</dd>':'';
  let h=head(esc(o.producto))+'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div class="num" style="font-size:32px;font-weight:800">'+m(o.total)+'</div>'+tag+'</div>';
  if(o.demo)h+='<div class="banner"><span>Esto es un ejemplo. Registrá tu primera venta con el botón +.</span></div>';
  h+='<div class="card"><dl class="kv" style="margin:0">'+kv('Cliente',esc(o.cliente||'Mostrador'))+kv('Fecha',fDia(o.ts)+' · '+fHora(o.ts))+(o.descMonto>0?kv('Subtotal',m(o.total+o.descMonto))+kv('Descuento','<b class="neg">'+pctStr(o.descPct)+'% · -'+m(o.descMonto)+'</b>'):'')+kv('Medio de pago',MLABEL[o.medio])+kv('Envío',esc(o.envio))+kv('Cobrado',m(cob))+(pc?kv('Por cobrar','<b class="neg">'+m(pc)+'</b>'):'')+kv('Notas',esc(o.notas))+'</dl></div>';
  h+='<div class="sec" style="margin-top:16px"><h2 style="font-size:16px">Productos ('+its.length+')</h2></div><div class="card"><ul class="hist its">'+its.map(it=>'<li class="itl"><span class="mid"><b>'+esc(itName(it))+'</b>'+(extrasOf(it).length?'<small style="color:var(--accent);font-weight:600">+ '+((it.extras&&it.extras.length)?it.extras.map(e=>esc(e.n)+(e.p?' ('+m(e.p)+')':'')).join(', '):esc(it.agregados))+'</small>':'')+'<small>'+qty(it.cantidad)+' × '+m(it.precio+extraSum(it))+(it.categoria?' · '+esc(it.categoria):'')+(it.costo?' · costo '+m(it.costo):'')+'</small></span><b class="num">'+m(itTotal(it))+'</b></li>').join('')+'</ul></div>';
  if((o.cobros||[]).length&&valida(o))h+='<div class="sec" style="margin-top:16px"><h2 style="font-size:16px">Cobros</h2></div><div class="card"><ul class="hist">'+o.cobros.map(c=>'<li><b class="pos num">'+m(c.monto)+'</b> · '+MLABEL[c.medio]+' · '+fFull(c.ts)+'</li>').join('')+'</ul></div>';
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
const agrRow=(x,i,j)=>'<div class="agr"><input class="inp a-n" list="dl-agr" autocomplete="off" autocapitalize="sentences" aria-label="Agregado" placeholder="Ej: medallón extra" value="'+esc(x.n)+'"><input class="inp a-p" data-in="calc" inputmode="decimal" aria-label="Precio del agregado" placeholder="Precio $" value="'+esc(x.p)+'"><button type="button" class="agr-x" data-a="rm-agr" data-i="'+i+'" data-j="'+j+'" aria-label="Quitar agregado">✕</button></div>';
function itemHtml(it,i,n){
  const id=x=>x+'-'+i;
  return '<div class="itm" data-i="'+i+'">'+
  (n>1?'<div class="itm-h"><b>Producto '+(i+1)+'</b><button type="button" class="link" data-a="rm-item" data-i="'+i+'">Quitar</button></div>':'')+
  '<div class="field"><label for="'+id('ip')+'">Producto</label><div class="cbw"><input class="inp i-prod" id="'+id('ip')+'" autocomplete="off" autocapitalize="sentences" role="combobox" aria-autocomplete="list" placeholder="Elegí de tu carta o escribí otro" value="'+esc(it.producto)+'"><div class="cb" role="listbox" hidden></div></div></div>'+
  '<div class="field"><span class="lab">Tamaño</span><div class="opts vars" role="group" aria-label="Tamaño">'+VARIANTES.map(v=>'<button type="button" class="chip" data-a="var" data-v="'+v+'" aria-pressed="'+(it.variante===v)+'">'+v+'</button>').join('')+'</div></div>'+
  '<div class="field"><span class="lab">Agregados (opcional)</span>'+(it.extras&&it.extras.length?'<div class="agrs">'+it.extras.map((x,j)=>agrRow(x,i,j)).join('')+'</div>':'')+'<button type="button" class="link agr-add" data-a="add-agr" data-i="'+i+'">+ Agregar un agregado</button></div>'+
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
  const o=old||{ts:Date.now(),cliente:'',medio:last&&(last.medio in MEDIOS)?last.medio:'efectivo',envio:'',estado:'cobrada',notas:''};
  const dl=(id,a)=>'<datalist id="'+id+'">'+a.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist>';
  const estados=old?Object.entries(ESTADOS):[['cobrada','Cobrada'],['pendiente','Pendiente']];
  return head(old?'Editar venta':'Nueva venta')+'<div class="form">'+
  '<div id="items" class="form">'+itemsHtml(sh.items)+'</div>'+
  '<button type="button" class="btn ghost" data-a="add-item">+ Agregar otro producto</button>'+
  '<div class="desc"><div class="desc-h"><b>Descuento</b><small>opcional · porcentaje manual</small></div><div class="two"><div class="field"><label for="v-dpct">Porcentaje (%)</label><input class="inp" id="v-dpct" data-in="calc" inputmode="decimal" placeholder="0" value="'+(old&&old.descPct?pctStr(old.descPct):'')+'"></div><div class="desc-r"><small>Se descuenta</small><b class="num" id="v-dm">- $ 0</b></div></div><div class="opts">'+[5,10,15,20].map(n=>'<button type="button" class="chip" data-a="dpct" data-v="'+n+'" aria-pressed="false">'+n+'%</button>').join('')+'</div></div>'+
  '<div class="field"><label for="v-cli">Cliente</label><input class="inp" id="v-cli" list="dl-cli" autocomplete="off" placeholder="Nombre (vacío = Mostrador)" value="'+esc(o.cliente)+'"></div>'+
  '<div class="field"><span class="lab">Envío (opcional)</span><div class="opts" role="group" data-grp="envio">'+ENVIOS.map(v=>'<button type="button" class="chip" data-a="tog" data-v="'+v+'" aria-pressed="'+(o.envio===v)+'">'+v+'</button>').join('')+'</div></div>'+
  '<div class="field"><span class="lab">Medio de pago</span>'+chipsOf('medio',medioOpts(medN(o.medio)),medN(o.medio))+'</div>'+
  '<div class="field"><span class="lab">Estado</span>'+chipsOf('estado',estados,o.estado)+'</div>'+
  '<div class="field"><label for="v-ts">Fecha y hora</label><input class="inp" type="datetime-local" id="v-ts" value="'+toInput(o.ts)+'"></div>'+
  '<div class="field"><label for="v-notas">Notas (opcional)</label><textarea class="inp" id="v-notas" rows="2" placeholder="Talle, color, entrega…">'+esc(o.notas)+'</textarea></div>'+
  dl('dl-agr',[...new Set(V.flatMap(o=>itemsOf(o).flatMap(i=>extrasOf(i).map(e=>e.n))).filter(Boolean))])+dl('dl-cli',uniqC)+dl('dl-cat',uniqI('categoria'))+'</div>'+
  '<div class="sh-foot"><div class="itm-sub" id="v-subl" hidden></div><div class="total"><span id="v-tl">Total</span><b class="num" id="v-total">$ 0</b></div><div class="err" id="v-err" role="alert"></div><button class="btn" data-a="save-venta">'+(old?'Guardar cambios':'Guardar venta')+'</button></div>'}
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
    const extras=[];for(const x of (r.extras||[])){const en=(x.n||'').trim(),ps=(x.p||'').trim();if(!en&&!ps)continue;
      if(!en)return E('escribí el nombre del agregado.');const ep=ps?parseAR(ps):0;if(isNaN(ep)||ep<0)return E('el precio de "'+en+'" no es válido.');extras.push({n:en,p:toC(ep)})}
    its.push({producto,variante:r.variante||'',extras,agregados:extras.map(e=>e.n).join(', '),categoria:r.categoria.trim(),cantidad:cant,precio:toC(pr),costo:cs?toC(costo):0})}
  let ts=new Date(val('v-ts')).getTime();if(!isFinite(ts))ts=Date.now();
  const medio=grpVal('medio')||'efectivo',estado=grpVal('estado')||'cobrada';
  const subtotal=sum(its,itTotal),pRaw=val('v-dpct').trim(),pct=pRaw?parseAR(pRaw):0;
  if(isNaN(pct)||pct<0||pct>100)return err('El descuento tiene que ser un porcentaje entre 0 y 100.');
  const descMonto=Math.round(subtotal*pct/100),total=subtotal-descMonto,resumen=itName(its[0])+(its.length>1?' + '+(its.length-1)+' más':'');
  const o=Object.assign({},old||{id:newId(),cobros:[],hist:[]},{ts,cliente:val('v-cli').trim(),items:its,producto:resumen,categoria:its[0].categoria,cantidad:sum(its,i=>i.cantidad),precio:its.length===1?its[0].precio:0,costo:its.length===1?its[0].costo:0,total,descPct:pct,descMonto,medio,estado,envio:grpVal('envio'),notas:val('v-notas').trim()});
  const oc=(old&&old.cobros)||[];
  if(estado==='cobrada'){if(old&&old.estado==='cobrada'&&oc.length===1)o.cobros=[{monto:total,medio,ts:oc[0].ts}];else if(old&&old.estado==='pendiente'){const r=total-sum(oc,c=>c.monto);o.cobros=r>0?oc.concat([{monto:r,medio,ts:Date.now()}]):oc}else o.cobros=[{monto:total,medio,ts:Math.min(ts,Date.now())}]}
  else if(estado==='pendiente'){o.cobros=(old&&(old.estado==='pendiente'||old.estado==='cancelada'))?oc:[];if(sum(o.cobros,c=>c.monto)>=total&&o.cobros.length)o.estado='cobrada'}
  else o.cobros=oc;
  let msg='Venta creada';
  if(old){const ch=[],key=a=>JSON.stringify(a.map(i=>[i.producto,i.variante||'',i.cantidad,i.precio]));
    if(old.total!==o.total)ch.push('total '+m(old.total)+' → '+m(o.total));if(old.estado!==o.estado)ch.push('estado '+ESTADOS[old.estado]+' → '+ESTADOS[o.estado]);
    if((old.descPct||0)!==pct)ch.push('descuento');if(key(itemsOf(old))!==key(its))ch.push('productos');if((old.cliente||'')!==o.cliente)ch.push('cliente');if(old.medio!==o.medio)ch.push('medio de pago');if((old.envio||'')!==o.envio)ch.push('envío');if(old.ts!==o.ts)ch.push('fecha');
    msg='Editada'+(ch.length?': '+ch.join(', '):'')}
  try{await saveV(o,msg);if(old&&(old.total!==o.total||old.estado!==o.estado))await log('Venta "'+o.producto+'" '+msg.toLowerCase());
    closeSheet();toast(old?'Cambios guardados':'Venta guardada');
  }catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shCobro(sh){const o=findV(sh.id);if(!o)return null;const pc=porCobrarDe(o);
  return head('Registrar cobro')+'<p class="hint" style="margin:-6px 0 14px">'+esc(o.producto)+' · '+esc(o.cliente||'Mostrador')+'. Falta cobrar <b class="num">'+m(pc)+'</b>.</p><div class="form">'+
  '<div class="field"><label for="c-monto">Monto recibido ($)</label><input class="inp" id="c-monto" inputmode="decimal" value="'+inputNum(pc)+'"></div>'+
  '<div class="field"><span class="lab">Medio de pago</span>'+chipsOf('medio',medioOpts(medN(o.medio)),medN(o.medio))+'</div>'+
  '<div class="err" id="c-err" role="alert"></div><button class="btn" data-a="save-cobro">Registrar cobro</button></div>'}
async function doSaveCobro(){
  const id=S.sheet.id,o=cloneV(findV(id)),err=t=>{$('#c-err').textContent=t},pc=porCobrarDe(o),monto=toC(parseAR(val('c-monto')));
  if(!(monto>0))return err('Ingresá el monto que recibiste.');
  if(monto>pc)return err('Es más de lo que falta cobrar ('+m(pc)+').');
  const medio=grpVal('medio')||o.medio;o.cobros=(o.cobros||[]).concat([{monto,medio,ts:Date.now()}]);
  if(cobrado(o)>=o.total)o.estado='cobrada';
  try{await saveV(o,'Cobro de '+m(monto)+' ('+MLABEL[medio]+')');closeSheet();toast('Cobro registrado')}catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shGasto(sh){
  const g=sh.id?D().gastos.find(x=>x.id===sh.id):null,tipo=g?g.tipo:sh.tipo,rt=tipo==='retiro',TT=({gasto:['Nuevo gasto','Editar gasto','Ej: Flete, bolsas, alquiler'],retiro:['Retiro personal','Editar retiro','Ej: Retiro personal'],haberes:['Pago de haberes','Editar pago de haberes','Ej: Sueldo de Juan, adelanto, aguinaldo']})[tipo]||['Nuevo gasto','Editar gasto','Ej: Flete, bolsas, alquiler'];
  const o=g||{ts:Date.now(),concepto:rt?'Retiro personal':'',monto:0,cuenta:'efectivo',notas:''};
  return head(g?TT[1]:TT[0])+'<div class="form">'+
  '<div class="field"><label for="g-con">Concepto</label><input class="inp" id="g-con" autocomplete="off" placeholder="'+TT[2]+'" value="'+esc(o.concepto)+'"></div>'+
  '<div class="field"><label for="g-monto">Monto ($)</label><input class="inp" id="g-monto" inputmode="decimal" value="'+inputNum(o.monto)+'"></div>'+
  '<div class="field"><span class="lab">Salió de</span>'+chipsOf('cuenta',cuentaOpts(),ctaN(o.cuenta))+'</div>'+
  '<div class="field"><label for="g-ts">Fecha y hora</label><input class="inp" type="datetime-local" id="g-ts" value="'+toInput(o.ts)+'"></div>'+
  '<div class="field"><label for="g-notas">Notas (opcional)</label><input class="inp" id="g-notas" value="'+esc(o.notas)+'"></div>'+
  '<div class="err" id="g-err" role="alert"></div><button class="btn" data-a="save-gasto">Guardar</button>'+(g?'<button class="btn ghost" data-a="del-gasto">Eliminar</button>':'')+'</div>'}
async function doSaveGasto(){
  const sh=S.sheet,old=sh.id?D().gastos.find(x=>x.id===sh.id):null,tipo=old?old.tipo:sh.tipo,err=t=>{$('#g-err').textContent=t};
  const concepto=val('g-con').trim(),monto=toC(parseAR(val('g-monto')));
  if(!concepto)return err('Escribí el concepto.');if(!(monto>0))return err('Ingresá el monto.');
  let ts=new Date(val('g-ts')).getTime();if(!isFinite(ts))ts=Date.now();
  try{await put('gastos',old?old.id:newId(),{ts,tipo,concepto,monto,cuenta:grpVal('cuenta')||'efectivo',notas:val('g-notas').trim()});
    if(old&&old.monto!==monto)await log(({retiro:'Retiro',haberes:'Haberes'}[tipo]||'Gasto')+' "'+concepto+'" editado: '+m(old.monto)+' → '+m(monto));
    closeSheet();toast('Guardado')}catch(e){err('No se pudo guardar. Probá de nuevo.')}}
function shTransf(sh){
  const t=sh.id?D().transf.find(x=>x.id===sh.id):null,o=t||{ts:Date.now(),desde:'efectivo',hasta:'banco',monto:0,notas:''};
  return head(t?'Editar pasaje':'Pasar entre cuentas')+'<div class="form">'+
  '<div class="field"><span class="lab">De</span>'+chipsOf('desde',cuentaOpts(),ctaN(o.desde))+'</div>'+
  '<div class="field"><span class="lab">A</span>'+chipsOf('hasta',cuentaOpts(),ctaN(o.hasta))+'</div>'+
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
  ctasVis(D()).map(k=>'<div class="field"><label for="s-'+k+'">'+CUENTAS[k]+' ($)</label><input class="inp" id="s-'+k+'" inputmode="decimal" value="'+inputNum((s[k]||0)+(k==='banco'?(s.billetera||0):0))+'"></div>').join('')+
  '<div class="err" id="s-err" role="alert"></div><button class="btn" data-a="save-saldos">Guardar saldos</button></div>'}
async function doSaveSaldos(){
  const saldos={};for(const k of ['efectivo','banco']){const v=val('s-'+k).trim();const n=v?parseAR(v):0;if(isNaN(n)){$('#s-err').textContent='Revisá el monto de '+CUENTAS[k]+'.';return}saldos[k]=toC(n)}
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
  $('#lockbox').innerHTML='<div class="lock" role="dialog" aria-modal="true"><svg class="logo" role="img" aria-label="ARGYR" style="color:#fff;width:52px;height:60px;margin:0"><use href="#logo"/></svg><h2>'+esc(o.title)+'</h2><p role="alert">'+esc(err||o.sub||'')+'</p><div class="dots" aria-hidden="true">'+[0,1,2,3].map(i=>'<i class="'+(i<b.length?'on':'')+'"></i>').join('')+'</div><div class="pad">'+
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
function ventasCsv(list){const rows=[['N° venta','Fecha','Hora','Cliente','Producto','Variante','Agregados','Precio agregados','Categoría','Cantidad','Precio unitario','Subtotal','Total venta','Cobrado','Por cobrar','Medio de pago','Envío','Estado','Costo unitario','Notas','Descuento (%)','Descuento ($)']];
  list.slice().sort((a,b)=>a.ts-b.ts).forEach((o,k)=>itemsOf(o).forEach((it,j)=>rows.push([k+1,fDate(o.ts),fHora(o.ts),o.cliente||'Mostrador',it.producto,it.variante||'',it.agregados||'',extraSum(it)?csvNum(extraSum(it)):'',it.categoria||'',String(it.cantidad).replace('.',','),csvNum(it.precio),csvNum(itTotal(it)),j===0?csvNum(o.total):'',j===0?csvNum(cobrado(o)):'',j===0?csvNum(porCobrarDe(o)):'',MLABEL[o.medio],o.envio||'',ESTADOS[o.estado],it.costo?csvNum(it.costo):'',j===0?(o.notas||''):'',j===0&&o.descPct?pctStr(o.descPct):'',j===0&&o.descMonto?csvNum(o.descMonto):''])));
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
  case 'goventas':S.tab='ventas';S.vtab='ventas';S.f.per=el.dataset.per;S.f.estado=el.dataset.estado||'todas';S.f.desde=S.f.hasta='';S.f.q='';Object.assign(S.f,{medio:'',cat:'',producto:'',variante:'',cliente:'',envio:'',desc:'',mmin:'',mmax:''});window.scrollTo(0,0);render();break;
  case 'per':S.f.per=v;S.f.desde=S.f.hasta='';render();break;
  case 'vmetric':S.vmetric=v;render();break;
  case 'estado':S.f.estado=v;render();break;
  case 'filtros':S.f.open=!S.f.open;render();break;
  case 'limpiar':Object.assign(S.f,{estado:'todas',per:'mes',q:'',medio:'',cat:'',producto:'',variante:'',cliente:'',envio:'',mmin:'',mmax:'',desc:'',desde:'',hasta:''});render();break;
  case 'dfilt':S.dfilt=v;render();break;
  case 'vtab':S.vtab=v;S.vcli='';render();break;
  case 'cvc':S.vcli=v;S.cl.est='todas';window.scrollTo(0,0);render();break;
  case 'cback':S.vcli='';window.scrollTo(0,0);render();break;
  case 'clfil':S.cl.fil=v;render();break;
  case 'vcest':S.cl.est=v;render();break;
  case 'prodby':S.prodBy=v;render();break;
  case 'prodall':S.prodAll=!S.prodAll;render();break;
  case 'dpct':{const i=$('#v-dpct');if(i){i.value=(parseAR(i.value)===+v)?'':v;calcTotal()}break}
  case 'hday':S.hday=v;render();break;
  case 'dtab':S.dtab=v;render();break;
  case 'hper':S.hp=v;render();break;
  case 'hnuevo':openSheet({type:'gasto',tipo:'haberes'});break;
  case 'gper':S.g.per=v;S.g.sel=-1;render();break;
  case 'gv':S.g.v=v;render();break;
  case 'gcmp':S.g.cmp=(v==='1');render();break;
  case 'gbar':S.g.sel=+el.dataset.i;render();break;
  case 'gtipo':S.g.tipo=v;render();break;
  case 'gmedio':S.g.medio=v;render();break;
  case 'gnuevo':openSheet({type:'gastoM'});break;
  case 'gdet':openSheet({type:'gastoDet',id});break;
  case 'gedit':openSheet({type:'gastoM',id});break;
  case 'gdel':{const gx=D().gastos.find(x=>x.id===id);if(!gx)break;confirmar('Eliminar gasto','Se borra "'+gx.concepto+'" por '+m(gx.monto)+(gItems(gx).length?' y sus '+plural(gItems(gx).length,'producto','productos'):'')+'. Los totales y estadísticas se actualizan.','Eliminar',async()=>{try{await del('gastos',id);await log('Gasto eliminado: "'+gx.concepto+'" por '+m(gx.monto));closeSheet();toast('Gasto eliminado')}catch(e){toast('No se pudo eliminar.')}},true);break}
  case 'gadd':{S.sheet.items=readG();S.sheet.items.push(blankG());drawG();const rows=document.querySelectorAll('#gitems .gi'),last=rows[rows.length-1];if(last){last.scrollIntoView({block:'nearest'});const f=last.querySelector('.gi-n');if(f)f.focus({preventScroll:true})}break}
  case 'grm':{S.sheet.items=readG();S.sheet.items.splice(+el.dataset.i,1);drawG();break}
  case 'gmerge':if(demoBlock())break;openSheet({type:'merge',k:v});break;
  case 'gpres':if(demoBlock())break;openSheet({type:'pres'});break;
  case 'save-gm':await doSaveGM();break;
  case 'save-merge':await doMerge();break;
  case 'save-pres':await doSavePres(false);break;
  case 'pres-off':await doSavePres(true);break;
  case 'gexp':{const rg=gRange(S.g.per),L=gHistList(D(),rg);if(!L.length){toast('No hay gastos para exportar.');break}
    const rows=[['Fecha','Descripción','Importe','Tipo de gasto','Medio de pago','Producto','Cantidad','Unidad','Precio unitario','Subtotal producto','Notas']];
    L.forEach(x=>{const its=gItems(x);if(!its.length)rows.push([gFecha(x.ts),x.concepto,csvNum(x.monto),tipoLbl(x),CUENTAS[ctaN(x.cuenta)],'','','','','',x.notas||'']);else its.forEach((i,k)=>rows.push([gFecha(x.ts),x.concepto,k===0?csvNum(x.monto):'',tipoLbl(x),CUENTAS[ctaN(x.cuenta)],i.nombre,String(i.cantidad).replace('.',','),unidadN(i.unidad),csvNum(i.precio),csvNum(i.total),k===0?(x.notas||''):'']))});
    await saveFile('argyr-gastos-'+stamp()+'.csv',csv(rows));break}
  case 'sp':S.sp=v;render();break;
  case 'evo':S.evo=v;render();break;
  case 'span':S.span=v;S.sel=-1;render();break;
  case 'cliall':S.cliAll=(v==='todo');render();break;
  case 'cliby':S.cliBy=v;render();break;
  case 'cli':S.tab='ventas';S.vtab='clientes';S.vcli=norm(v);S.cl.est='todas';window.scrollTo(0,0);render();break;
  case 'bar':S.sel=+el.dataset.i;render();break;
  case 'venta':openSheet({type:'detalle',id});break;
  case 'mov':
    if(el.dataset.k==='cobro')openSheet({type:'detalle',id});
    else if(demoBlock())break;
    else if(el.dataset.k==='transf')openSheet({type:'transf',id});else if(el.dataset.k==='gasto')openSheet({type:'gastoDet',id});else openSheet({type:'gasto',id});break;
  case 'gasto':openSheet({type:'gasto',tipo:v});break;
  case 'transf':openSheet({type:'transf'});break;
  case 'saldos':openSheet({type:'saldos'});break;
  case 'close':closeSheet();break;
  case 'pick':{const grp=el.closest('[data-grp]');grp.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===el?'true':'false'));break}
  case 'step':{const i=el.closest('.itm').querySelector('.i-cant'),n=parseAR(i.value)||0;i.value=qty(Math.max(1,Math.round((n+ +el.dataset.d)*1000)/1000));calcTotal();break}
  case 'add-item':{S.sheet.items=readItems();S.sheet.items.push(blankItem());drawItems();const rows=document.querySelectorAll('#items .itm'),last=rows[rows.length-1];if(last){last.scrollIntoView({block:'nearest'});const f=last.querySelector('.i-prod');if(f)f.focus({preventScroll:true})}break}
  case 'tog':{const was=el.getAttribute('aria-pressed')==='true';el.closest('[data-grp]').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));if(!was)el.setAttribute('aria-pressed','true');break}
  case 'ir-gastos':S.tab='dinero';S.dtab='gastos';window.scrollTo(0,0);render();break;
  case 'var':{const row=el.closest('.itm'),was=el.getAttribute('aria-pressed')==='true',pr=row.querySelector('.i-precio');
    el.closest('.vars').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));if(!was)el.setAttribute('aria-pressed','true');
    if(pr.dataset.auto==='1'){pr.value='';delete pr.dataset.auto}fillRow(row);calcTotal();break}
  case 'cb-pick':{const row=el.closest('.itm'),inp=row.querySelector('.i-prod'),k=row.querySelector('.i-cat');
    inp.value=el.dataset.v;if(el.dataset.c&&!k.value)k.value=el.dataset.c;cbClose();fillRow(row);calcTotal();inp.blur();break}
  case 'add-agr':{S.sheet.items=readItems();S.sheet.items[+el.dataset.i].extras.push({n:'',p:''});drawItems();const rows=document.querySelectorAll('#items .itm')[+el.dataset.i].querySelectorAll('.agr');const l=rows[rows.length-1];if(l){l.scrollIntoView({block:'nearest'});l.querySelector('.a-n').focus({preventScroll:true})}break}
  case 'rm-agr':{S.sheet.items=readItems();S.sheet.items[+el.dataset.i].extras.splice(+el.dataset.j,1);drawItems();break}
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
  case 'exp-movs':{if(demoBlock())break;const rows=[['Fecha','Hora','Tipo','Concepto','Cuenta','Ingreso','Egreso']].concat(movs(D()).map(x=>[fDate(x.ts),fHora(x.ts),({cobro:'Cobro',gasto:'Gasto',retiro:'Retiro',haberes:'Haberes',transf:'Entre cuentas'})[x.k],x.t,x.k==='transf'?'':CUENTAS[x.cuenta],x.k==='cobro'?csvNum(x.monto):'',x.k!=='cobro'&&x.k!=='transf'?csvNum(x.monto):'']));await saveFile('argyr-movimientos-'+stamp()+'.csv',csv(rows));break}
  case 'backup':{if(demoBlock())break;await saveFile('argyr-copia-'+stamp()+'.json',JSON.stringify({app:'ARGYR',v:1,at:new Date().toISOString(),ventas:S.ventas,gastos:S.gastos,transf:S.transf,config:S.config}));break}
  case 'restore':{const f=document.getElementById('restoref');if(f)f.click();break}
  }});
document.addEventListener('input',ev=>{
  const t=ev.target,k=t.dataset&&t.dataset.in;
  if(k==='calc'){if(t.classList.contains('i-precio')||t.classList.contains('a-p'))delete t.dataset.auto;calcTotal();return}
  if(k==='gcalc'){calcG();return}
  if(k==='gmonto'){delete t.dataset.auto;calcG();return}
  if(k==='gq'){S.g.q=t.value;render();return}
  if(k==='clq'){S.cl.q=t.value;render();return}
  if(k==='clord'){S.cl.ord=t.value;render();return}
  if(k==='gord'){S.g.ord=t.value;render();return}
  if(k==='gprod'){S.g.prod=t.value;render();return}
  if(k==='gdesde'){S.g.desde=t.value;render();return}
  if(k==='ghasta'){S.g.hasta=t.value;render();return}
  if(k==='q'){S.f.q=t.value;render();return}
  if(k&&k.slice(0,2)==='f:'){S.f[k.slice(2)]=t.value;render();return}
  if(k==='fmedio'){S.f.medio=t.value;render();return}
  if(k==='fcat'){S.f.cat=t.value;render();return}
  if(k==='fdesde'){S.f.desde=t.value;render();return}
  if(k==='fhasta'){S.f.hasta=t.value;render();return}
  if(t.classList&&t.classList.contains('a-n')){const pr=t.closest('.agr').querySelector('.a-p');if(!pr.value||pr.dataset.auto==='1'){const nn=norm(t.value);let f=0;if(nn)S.ventas.slice().sort((a,b)=>b.ts-a.ts).some(o=>itemsOf(o).some(i=>(i.extras||[]).some(e=>{if(norm(e.n)===nn&&e.p>0){f=e.p;return true}return false})));if(f){pr.value=inputNum(f);pr.dataset.auto='1'}else if(pr.dataset.auto==='1'){pr.value='';delete pr.dataset.auto}calcTotal()}return}
  if(t.classList&&t.classList.contains('a-p'))delete t.dataset.auto;
  if(t.classList&&t.classList.contains('i-prod')&&S.sheet&&S.sheet.type==='venta'){cbOpen(t,true);fillRow(t.closest('.itm'))}
});
document.addEventListener('change',ev=>{const t=ev.target;if(t.id==='restoref'&&t.files&&t.files[0]){restoreFile(t.files[0]);t.value=''}});
document.addEventListener('keydown',ev=>{
  const t=ev.target;
  if(ev.key==='Enter'&&t.classList&&t.classList.contains('i-prod')){ev.preventDefault();cbClose();t.blur();return}
  if(ev.key==='Escape'){const open=[...document.querySelectorAll('.cb')].some(b=>!b.hidden);if(open){cbClose();return}if(S.sheet)closeSheet()}});
document.addEventListener('focusin',ev=>{const t=ev.target;if(t.classList&&t.classList.contains('i-prod')&&S.sheet&&S.sheet.type==='venta')cbOpen(t,false)});
document.addEventListener('focusout',ev=>{const t=ev.target;if(t.classList&&t.classList.contains('i-prod'))setTimeout(()=>cbClose(document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains('i-prod')?document.activeElement:null),150)});
document.addEventListener('click',ev=>{const t=ev.target;if(t.classList&&t.classList.contains('i-prod')&&S.sheet&&S.sheet.type==='venta'){const b=t.closest('.cbw').querySelector('.cb');if(b.hidden)cbOpen(t,false)}});
document.addEventListener('mousedown',ev=>{if(ev.target.closest&&ev.target.closest('.cb'))ev.preventDefault()});
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.id&&ev.target.id.indexOf('au-')===0)authGo()});
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(hasPin()&&hiddenAt&&Date.now()-hiddenAt>60000)lockApp()});
/* ---------- arranque ---------- */
lockApp();render();initStore();

