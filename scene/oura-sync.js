/* LifeSims Oura OAuth V2 — browser-only, no client secret. */
(function(){
'use strict';
const bridge=window.LifeSimsOuraBridge,root=document.getElementById('ouraMount');
if(!bridge||!root)return;
const AUTH='https://cloud.ouraring.com/oauth/authorize', API='https://api.ouraring.com/v2/usercollection/';
const REDIRECT='https://ansitnikkodland-alt.github.io/lifesims-web/scene/';
const ID_KEY='lifesims-oura-client-id',STATE_KEY='lifesims-oura-state',TOKEN_KEY='lifesims-oura-session',AUTO_KEY='lifesims-oura-auto',LAST_KEY='lifesims-oura-last-check';
let token='',expiry=0,preview=null,busy=false,grantedScopes=[];
const EXTRA_COLLECTIONS=[
 {name:'heartrate',scope:'heartrate',time:true,label:'Пульс'},
 {name:'workout',scope:'workout',label:'Тренировки'},
 {name:'enhanced_tag',scope:'tag',label:'Отметки'},
 {name:'session',scope:'session',label:'Сессии'},
 {name:'daily_spo2',scope:'spo2',label:'SpO₂'},
 {name:'daily_stress',scope:'daily',label:'Стресс'},
 {name:'daily_resilience',scope:'daily',label:'Устойчивость'},
 {name:'daily_cardiovascular_age',scope:'daily',label:'Сердечно-сосудистый возраст'},
 {name:'vo2_max',scope:'daily',label:'VO₂ max'},
 {name:'sleep_time',scope:'daily',label:'Рекомендации по сну'},
 {name:'rest_mode_period',scope:'daily',label:'Режим отдыха'},
 {name:'ring_battery_level',scope:'daily',time:true,label:'Заряд кольца'},
 {name:'ring_configuration',scope:'daily',snapshot:true,label:'Текущая конфигурация кольца'}
];
const el=id=>document.getElementById(id);
const panel=document.createElement('div');panel.className='card oura-panel';
panel.innerHTML=[
'<h3>💍 Oura Ring</h3>',
'<div id="ouraToday" class="oura-today" role="status">Оценки Oura за сегодня пока не загружены.</div>',
'<p class="hint">Первый импорт охватывает последние 7 дней. Для получения личных данных сначала нажми «Подключить Oura», разреши доступ на сайте Oura, затем «Проверить данные» и «Сохранить в LifeSims». Пульс, тренировки, стресс и другие доступные категории сохраняются отдельно; недоступные категории будут перечислены после проверки.</p>',
'<details id="ouraSettings" open><summary>Подключение Oura</summary>',
'<p class="hint">Создай OAuth-приложение на <a href="https://developer.ouraring.com/applications" target="_blank" rel="noopener noreferrer">Oura Developer → Applications</a>. Добавь Redirect URI ниже. Секретный ключ (Client Secret) сюда вводить нельзя.</p>',
'<label class="field">Redirect URI <input id="ouraRedirect" type="text" readonly></label>',
'<button type="button" class="secondary" id="ouraCopyRedirect">Скопировать Redirect URI</button>',
'<label class="field">Oura Client ID <input id="ouraClientId" autocomplete="off" spellcheck="false" placeholder="Только публичный Client ID"></label>',
'<div class="row"><button type="button" class="primary" id="ouraConnect">Подключить Oura</button><button type="button" class="secondary" id="ouraDisconnect" disabled>Отключить на устройстве</button></div></details>',
'<p class="hint">Период синхронизации: только последние 7 календарных дней (включая сегодня). Ранее сохранённые данные остаются в истории.</p>',
'<label class="oura-auto"><input id="ouraAuto" type="checkbox"> Обновлять при открытии LifeSims (не чаще раза в 6 часов)</label>',
'<div class="row"><button type="button" class="secondary" id="ouraPreview" disabled>Проверить данные</button><button type="button" class="primary" id="ouraApply" disabled>Сохранить в LifeSims</button></div>',
'<p id="ouraStatus" class="hint" role="status" aria-live="polite">Oura не подключена.</p>',
'<div id="ouraResults"></div>',
'<p id="ouraScopeStatus" class="hint">Расширенные показатели запрашиваются только при разрешении соответствующей категории Oura.</p>',
'<button type="button" class="secondary" id="ouraExportDetails">Скачать подробные данные за неделю (JSON)</button>',
'<p class="hint">Ручные записи не заменяются данными Oura. OAuth-токен хранится только в сеансе этой вкладки, не в JSON. Автопроверка работает, только когда LifeSims открыт.</p>',
'<p class="hint"><a href="./privacy.html" target="_blank" rel="noopener">Privacy Policy</a> · <a href="./terms.html" target="_blank" rel="noopener">Terms of Service</a></p>'
].join('');
root.append(panel);
el('ouraRedirect').value=REDIRECT;
const setting=(k)=>{try{return localStorage.getItem(k)}catch(_){return null}};
const saveSetting=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
const session=(k)=>{try{return sessionStorage.getItem(k)}catch(_){return null}};
const saveSession=(k,v)=>sessionStorage.setItem(k,v);
const dropSession=k=>{try{sessionStorage.removeItem(k)}catch(_){}};
const status=v=>el('ouraStatus').textContent=v;
function renderToday(){
 const r=bridge.getDays()[bridge.today()]||{},scores=r.ouraScores||{};
 const vals=[];
 if(Number.isFinite(scores.sleep))vals.push('Сон '+scores.sleep+'/100');
 if(Number.isFinite(scores.readiness))vals.push('Восстановление '+scores.readiness+'/100');
 if(Number.isFinite(scores.activity))vals.push('Активность '+scores.activity+'/100');
 el('ouraToday').textContent=vals.length?'Сегодня по Oura: '+vals.join(' · '):'Оценки Oura за сегодня пока не загружены.';
}
const connected=()=>token&&expiry>Date.now()+30000;
function update(){
 el('ouraConnect').disabled=busy;el('ouraDisconnect').disabled=busy||!connected();
 el('ouraPreview').disabled=busy||!connected();el('ouraApply').disabled=busy||!preview||(!preview.records.length&&!preview.collections?.some(c=>c.items.length));
}
function clearToken(){token='';expiry=0;preview=null;grantedScopes=[];dropSession(TOKEN_KEY);update()}
el('ouraClientId').value=setting(ID_KEY)||'';
el('ouraAuto').checked=setting(AUTO_KEY)!=='no';
el('ouraCopyRedirect').onclick=async()=>{
 try{await navigator.clipboard.writeText(REDIRECT);status('Адрес скопирован.')}
 catch(_){el('ouraRedirect').focus();el('ouraRedirect').select();status('Выдели и скопируй адрес.')}
};
el('ouraAuto').onchange=()=>saveSetting(AUTO_KEY,el('ouraAuto').checked?'yes':'no');
el('ouraExportDetails').onclick=()=>exportDetailed().catch(e=>status('⚠ Экспорт Oura: '+e.message));
function randomState(){
 if(!crypto?.getRandomValues)throw Error('Нужен защищённый браузер.');
 const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);
 return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
}
el('ouraConnect').onclick=()=>{
 if(location.origin!=='https://ansitnikkodland-alt.github.io'||location.pathname!=='/lifesims-web/scene/'){
  return status('Для входа Oura открой опубликованную LifeSims: '+REDIRECT)
 }
 const id=el('ouraClientId').value.trim();
 if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id))return status('Укажи публичный Client ID своего приложения Oura.');
 try{saveSession(STATE_KEY,randomState());}catch(_){return status('Нужно разрешить sessionStorage в Chrome.')}
 saveSetting(ID_KEY,id);
 const params=new URLSearchParams({response_type:'token',client_id:id,redirect_uri:REDIRECT,scope:'daily heartrate tag workout session spo2 personal',state:session(STATE_KEY)});
 location.assign(AUTH+'?'+params.toString());
};
function callback(){
 const hashParams=new URLSearchParams((location.hash||'').replace(/^#/,''));
 const queryParams=new URLSearchParams(location.search);
 const fromHash=hashParams.has('access_token')||hashParams.has('error');
 if(!fromHash&&!queryParams.has('error'))return false;
 const params=fromHash?hashParams:queryParams;
 // Oura sends access tokens in the fragment, but refused authorization can return ?error=.
 // Remove sensitive URL fragments and OAuth error details before displaying messages.
 try{
  const clean=new URL(location.href);
  clean.hash='';
  for(const field of ['error','error_description','error_uri','state'])clean.searchParams.delete(field);
  history.replaceState(history.state,'',clean.pathname+clean.search);
 }catch(_){}
 const expected=session(STATE_KEY);dropSession(STATE_KEY);
 if(!expected||params.get('state')!==expected){
  status('Недействительное состояние входа Oura. Начни подключение заново.');
  return true;
 }
 if(params.has('error')){
  status('Oura отказала в доступе: '+String(params.get('error')).slice(0,90));
  return true;
 }
 if(params.get('token_type')?.toLowerCase()!=='bearer'||!params.get('access_token')){
  status('Oura вернула неполную авторизацию.');
  return true;
 }
 const scopes=(params.get('scope')||'').split(/\s+/).filter(Boolean);
 if(!scopes.includes('daily')){
  status('Не дано разрешение daily. Подключи Oura заново и разреши ежедневные данные.');
  return true;
 }
 const seconds=Number(params.get('expires_in'));
 if(!Number.isFinite(seconds)||seconds<=0){
  status('Не указан срок токена Oura; нужно подключение заново.');
  return true;
 }
 token=params.get('access_token');expiry=Date.now()+seconds*1000;grantedScopes=scopes;
 try{saveSession(TOKEN_KEY,JSON.stringify({token,expiry,scopes:grantedScopes}))}catch(_){}
 status('✓ Oura подключена. Нажми «Проверить данные».');update();
 return true;
}
const returned=callback();
if(!returned){
 try{const cached=JSON.parse(session(TOKEN_KEY)||'null');
 if(cached&&typeof cached.token==='string'&&cached.expiry>Date.now()+30000){token=cached.token;expiry=cached.expiry;grantedScopes=Array.isArray(cached.scopes)?cached.scopes:['daily'];status('✓ Oura подключена в этом сеансе.')}}
 catch(_){}
}
el('ouraDisconnect').onclick=()=>{clearToken();status('Текущий сеанс Oura закрыт. Данные LifeSims не удалены. При необходимости отзови доступ в настройках Oura.')};
const dateAdd=(date,delta)=>{
 const p=date.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]+delta,12);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
async function read(name,start,end,time=false,snapshot=false){
 let data=[],next='',pages=0;
 do{
  if(++pages>10)throw Error('Слишком много страниц Oura; сократи период.');
  const q=snapshot?new URLSearchParams():time?new URLSearchParams({
    start_datetime:new Date(start+'T00:00:00').toISOString(),
    end_datetime:new Date(dateAdd(end,1)+'T00:00:00').toISOString()
  }):new URLSearchParams({start_date:start,end_date:dateAdd(end,1)});
  if(next)q.set('next_token',next);
  let res;
  try{res=await fetch(API+name+'?'+q,{headers:{Authorization:'Bearer '+token},cache:'no-store'})}
  catch(_){throw Error('Нет доступа к Oura API из браузера (интернет или CORS). Если API блокирует запрос, потребуется защищённый сервер.')}
  if(res.status===401){clearToken();throw Error('Время доступа Oura истекло; подключи заново.')}
  if(res.status===403)throw Error('Oura запретила доступ. Проверь разрешение daily и подписку.');
  if(res.status===429)throw Error('Достигнут лимит Oura; повтори позже.');
  if(!res.ok)throw Error('Oura '+name+': ошибка '+res.status);
  const obj=await res.json();
  if(!Array.isArray(obj.data))throw Error('Неожиданные данные Oura '+name);
  // End dates can be exclusive or inclusive depending on collection.
  // Request through tomorrow, then trim by the Oura record's calendar day.
  const withinWeek=item=>{
   if(snapshot)return true;
   const day=typeof item?.day==='string'?item.day:
     typeof item?.timestamp==='string'?item.timestamp.slice(0,10):
     typeof item?.start_datetime==='string'?item.start_datetime.slice(0,10):null;
   return !day||(day>=start&&day<=end);
  };
  data.push(...obj.data.filter(withinWeek));if(data.length>5000)throw Error('Слишком много записей Oura.');
  next=obj.next_token||'';
 }while(next);
 return data;
}

async function fetchExtras(from,to,baseCollections){
 const extra=baseCollections.map(x=>({name:x.name,label:x.label,items:x.items,scope:'daily'}));
 const failures=[];
 for(const collection of EXTRA_COLLECTIONS){
  if(!grantedScopes.includes(collection.scope))continue;
  status('Загружаю Oura: '+collection.label+'…');
  try{
   const items=await read(collection.name,from,to,!!collection.time,!!collection.snapshot);
   extra.push({...collection,items});
  }catch(e){
   // Optional endpoint failure must never conceal missing data or discard daily metrics.
   if(!token)throw e; // Expired authorization cancels the entire request.
   failures.push(collection.label+': '+e.message);
  }
 }
 return {extra,failures};
}
function openDetailsDb(){
 return new Promise((resolve,reject)=>{
  if(!window.indexedDB)return reject(Error('IndexedDB недоступна; подробные показатели не будут сохранены.'));
  const request=window.indexedDB.open('lifesims-oura-details',1);
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains('collections'))
     request.result.createObjectStore('collections',{keyPath:'name'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error('Не удалось открыть локальное хранилище Oura.'));
 });
}
async function saveDetails(collections,from,to){
 const db=await openDetailsDb();
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('collections','readwrite');
   const store=tx.objectStore('collections');
   // Merge by stable record ID or date/time: repeat sync must not create duplicates
   // and old weeks must not disappear when the seven-day window moves.
   for(const item of collections){
    if(item.items.length>5000)throw Error('Слишком много записей '+item.name);
    const req=store.get(item.name);
    req.onsuccess=()=>{
     const previous=req.result;
     const existing=Array.isArray(previous?.items)?previous.items:[];
     const merged=new Map();
     const recordKey=record=>record?.id!=null?'id:'+record.id:
       record?.timestamp?'ts:'+record.timestamp:
       record?.start_datetime?'start:'+record.start_datetime:
       record?.day?'day:'+record.day:'raw:'+JSON.stringify(record);
     for(const record of [...existing,...item.items])merged.set(recordKey(record),record);
     if(merged.size>100000){tx.abort();return}
     store.put({name:item.name,label:item.label,
       from:previous?.from&&previous.from<from?previous.from:from,
       to:previous?.to&&previous.to>to?previous.to:to,
       savedAt:new Date().toISOString(),items:[...merged.values()]});
    };
    req.onerror=()=>tx.abort();
   }
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(Error('Недостаточно места для подробностей Oura в IndexedDB.'));
   tx.onabort=()=>reject(Error('Запись подробностей Oura отменена браузером.'));
  });
 }finally{db.close()}
}
async function exportDetailed(){
 const db=await openDetailsDb();
 let details;
 try{
  details=await new Promise((resolve,reject)=>{
   const tx=db.transaction('collections','readonly');
   const req=tx.objectStore('collections').getAll();
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(Error('Не удалось прочитать подробные данные Oura.'));
  });
 }finally{db.close()}
 if(!details.length)throw Error('Подробные данные не сохранены. Сначала подключи Oura и импортируй последнюю неделю.');
 const data=JSON.stringify({format:'LifeSims Oura detail backup v1',exportedAt:new Date().toISOString(),collections:details},null,2);
 const blob=new Blob([data],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='lifesims-oura-details.json';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 status('Подробности Oura сохранены в файл. Он содержит данные о здоровье — храни его приватно.');
}
function number(v,min,max){const n=Number(v);return v!=null&&Number.isFinite(n)&&n>=min&&n<=max?n:null}
function aggregate(sleep,activity,dailySleep,readiness){
 const map=new Map(),validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d);
 function entry(day){if(!map.has(day))map.set(day,{date:day,metrics:{},scores:{}});return map.get(day)}
 for(const item of sleep||[]){
  if(!validDay(item?.day)||item.type==='rest')continue;
  const seconds=number(item.total_sleep_duration,0,86400);
  if(seconds==null)continue;
  const r=entry(item.day);r.seconds=(r.seconds||0)+seconds;
 }
 for(const r of map.values())if(r.seconds!=null){r.metrics.sleepHours=Math.round(Math.min(r.seconds,86400)/36)/100;delete r.seconds}
 for(const a of activity||[]){
  if(!validDay(a?.day))continue;
  const r=entry(a.day),steps=number(a.steps,0,100000),cal=number(a.total_calories,0,20000);
  if(steps!=null)r.metrics.steps=Math.round(steps);
  if(cal!=null)r.metrics.totalCalories=Math.round(cal);
  const score=number(a.score,0,100);if(score!=null)r.scores.activity=score;
 }
 for(const [items,key] of [[dailySleep,'sleep'],[readiness,'readiness']]){
  for(const item of items||[]){
   if(!validDay(item?.day))continue;
   const score=number(item.score,0,100);if(score!=null)entry(item.day).scores[key]=score;
  }
 }
 return [...map.values()].filter(r=>Object.keys(r.metrics).length||Object.keys(r.scores).length).sort((a,b)=>a.date.localeCompare(b.date));
}
function renderPreview(){
 const box=el('ouraResults');box.replaceChildren();
 if(!preview)return;
 const intro=document.createElement('p');intro.className='hint';
 intro.textContent='Получены данные за '+preview.records.length+' дней. Ручные значения останутся без изменений.';box.append(intro);
 const ul=document.createElement('ul');ul.className='oura-preview-items';
 for(const r of preview.records.slice(-10)){
  const li=document.createElement('li');
  li.textContent=r.date+' · '+[
   r.metrics.sleepHours!=null?'сон '+r.metrics.sleepHours+' ч':'',
   r.metrics.steps!=null?'шаги '+r.metrics.steps:'',
   r.metrics.totalCalories!=null?'расход '+r.metrics.totalCalories+' ккал':'',
   r.scores.readiness!=null?'Oura Readiness '+r.scores.readiness:''
  ].filter(Boolean).join(' · ');ul.append(li);
 }
 box.append(ul);
 if(preview.collections){const msg=document.createElement('p');msg.className='hint';msg.textContent='Дополнительные категории: '+preview.collections.map(c=>c.label+' ('+c.items.length+')').join(', ');box.append(msg)}
}
async function apply(automatic=false){
 if(!preview)return;
 if(preview.snapshot!==JSON.stringify(bridge.getDays())){preview=null;renderPreview();throw Error('Показатели LifeSims изменились. Проверь данные Oura ещё раз.')}
 const selected=preview;
 const done=bridge.importDays(selected.records);
 let note='';
 try{await saveDetails(selected.collections,selected.from,selected.to);note=' Подробные данные добавлены в историю.'}
 catch(e){note=' ⚠ Подробности не сохранились: '+e.message}
 renderToday();
 preview=null;renderPreview();saveSetting(LAST_KEY,String(Date.now()));
 status('✓ Oura: обновлено '+done.fields+' показателей за '+done.days+' дней; ручные записи не перезаписаны.'+note+
   (selected.failures.length?' Недоступные категории: '+selected.failures.join('; '):'')+(automatic?' Автопроверка завершена.':''));
 update();
}
async function load(automatic=false){
 if(busy||!connected())return;
 if(automatic&&!bridge.wasImported())return;
 busy=true;update();
 try{
  const end=bridge.today(),start=dateAdd(end,-6);
  status('Загружаю сон и активность Oura за '+start+' — '+end+'…');
  const sleep=await read('sleep',start,end);
  const activity=await read('daily_activity',start,end);
  const sleepScore=await read('daily_sleep',start,end);
  const readiness=await read('daily_readiness',start,end);
  const records=aggregate(sleep,activity,sleepScore,readiness);
  const baseCollections=[
    {name:'sleep',label:'Периоды сна',items:sleep},
    {name:'daily_activity',label:'Активность по дням',items:activity},
    {name:'daily_sleep',label:'Оценки сна',items:sleepScore},
    {name:'daily_readiness',label:'Оценки восстановления',items:readiness}
  ];
  const {extra,failures}=await fetchExtras(start,end,baseCollections);
  if(!records.length&&!extra.some(c=>c.items.length)){preview=null;renderPreview();status('Oura не вернула данные за этот период. Синхронизируй кольцо через приложение Oura.');return}
  preview={records,collections:extra,failures,from:start,to:end,snapshot:JSON.stringify(bridge.getDays())};
  renderPreview();
  el('ouraScopeStatus').textContent='Разрешённые категории: '+grantedScopes.join(', ')+'. Получено: '+extra.length+
    '. Недоступно: '+failures.length+(failures.length?' ('+failures.map(x=>x.split(':')[0]).join(', ')+')':'');
  status('✓ Oura: найдено '+records.length+' дней с основными показателями и '+extra.filter(c=>c.items.length).length+' непустых категорий за неделю. '+(automatic?'Автоматически обновляю показатели…':'Проверь и нажми «Сохранить в LifeSims».'));
  if(automatic)await apply(true);
 }finally{busy=false;update()}
}
el('ouraPreview').onclick=()=>load(false).catch(e=>status('⚠ '+e.message));
el('ouraApply').onclick=()=>{apply(false).catch(e=>status('⚠ '+e.message))};
renderToday();
update();
if(connected()&&el('ouraAuto').checked&&bridge.wasImported()){
 const last=Number(setting(LAST_KEY)||0);
 if(!Number.isFinite(last)||Date.now()-last>6*60*60*1000){
  saveSetting(LAST_KEY,String(Date.now()));
  load(true).catch(e=>status('⚠ Oura: '+e.message));
 }
}
window.LifeSimsOuraVersion='oura-v20-authorize';
})();