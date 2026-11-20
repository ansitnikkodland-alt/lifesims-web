/* LifeSims Oura OAuth V2 — browser-only, no client secret. */
(function(){
'use strict';
const bridge=window.LifeSimsOuraBridge,root=document.getElementById('ouraMount');
if(!bridge||!root)return;
const AUTH='https://cloud.ouraring.com/oauth/authorize', API='https://api.ouraring.com/v2/usercollection/';
const REDIRECT='https://ansitnikkodland-alt.github.io/lifesims-web/scene/';
const ID_KEY='lifesims-oura-client-id',STATE_KEY='lifesims-oura-state',TOKEN_KEY='lifesims-oura-session',AUTO_KEY='lifesims-oura-auto',LAST_KEY='lifesims-oura-last-check';
let token='',expiry=0,preview=null,busy=false;
const el=id=>document.getElementById(id);
const panel=document.createElement('div');panel.className='card oura-panel';
panel.innerHTML=[
'<h3>💍 Oura Ring</h3>',
'<p class="hint">Фактический сон, шаги и калории, оценки сна и восстановления. Потребность во сне LifeSims рассчитывает отдельно.</p>',
'<details id="ouraSettings" open><summary>Подключение Oura</summary>',
'<p class="hint">Создай OAuth-приложение на <a href="https://cloud.ouraring.com/" target="_blank" rel="noopener noreferrer">Oura Cloud → My Applications</a>. Добавь Redirect URI ниже. Секретный ключ (Client Secret) сюда вводить нельзя.</p>',
'<label class="field">Redirect URI <input id="ouraRedirect" type="text" readonly></label>',
'<button type="button" class="secondary" id="ouraCopyRedirect">Скопировать Redirect URI</button>',
'<label class="field">Oura Client ID <input id="ouraClientId" autocomplete="off" spellcheck="false" placeholder="Только публичный Client ID"></label>',
'<div class="row"><button type="button" class="primary" id="ouraConnect">Подключить Oura</button><button type="button" class="secondary" id="ouraDisconnect" disabled>Отключить на устройстве</button></div></details>',
'<label class="field">За какой период получить данные <select id="ouraDays"><option value="7">7 дней</option><option value="30" selected>30 дней</option><option value="90">90 дней</option></select></label>',
'<label class="oura-auto"><input id="ouraAuto" type="checkbox"> Обновлять при открытии LifeSims (не чаще раза в 6 часов)</label>',
'<div class="row"><button type="button" class="secondary" id="ouraPreview" disabled>Проверить данные</button><button type="button" class="primary" id="ouraApply" disabled>Сохранить в LifeSims</button></div>',
'<p id="ouraStatus" class="hint" role="status" aria-live="polite">Oura не подключена.</p>',
'<div id="ouraResults"></div>',
'<p class="hint">Ручные записи не заменяются данными Oura. OAuth-токен хранится только в сеансе этой вкладки, не в JSON. Автопроверка работает, только когда LifeSims открыт.</p>'
].join('');
root.append(panel);
el('ouraRedirect').value=REDIRECT;
const setting=(k)=>{try{return localStorage.getItem(k)}catch(_){return null}};
const saveSetting=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
const session=(k)=>{try{return sessionStorage.getItem(k)}catch(_){return null}};
const saveSession=(k,v)=>sessionStorage.setItem(k,v);
const dropSession=k=>{try{sessionStorage.removeItem(k)}catch(_){}};
const status=v=>el('ouraStatus').textContent=v;
const connected=()=>token&&expiry>Date.now()+30000;
function update(){
 el('ouraConnect').disabled=busy;el('ouraDisconnect').disabled=busy||!connected();
 el('ouraPreview').disabled=busy||!connected();el('ouraApply').disabled=busy||!preview?.records.length;
}
function clearToken(){token='';expiry=0;preview=null;dropSession(TOKEN_KEY);update()}
el('ouraClientId').value=setting(ID_KEY)||'';
el('ouraAuto').checked=setting(AUTO_KEY)==='yes';
el('ouraCopyRedirect').onclick=async()=>{
 try{await navigator.clipboard.writeText(REDIRECT);status('Адрес скопирован.')}
 catch(_){el('ouraRedirect').focus();el('ouraRedirect').select();status('Выдели и скопируй адрес.')}
};
el('ouraAuto').onchange=()=>saveSetting(AUTO_KEY,el('ouraAuto').checked?'yes':'no');
el('ouraDays').onchange=()=>{preview=null;renderPreview();update()};
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
 const params=new URLSearchParams({response_type:'token',client_id:id,redirect_uri:REDIRECT,scope:'daily',state:session(STATE_KEY)});
 location.assign(AUTH+'?'+params.toString());
};
function callback(){
 const hash=location.hash||'';
 if(!/(?:^#|&)access_token=/.test(hash)&&!/(?:^#|&)error=/.test(hash))return false;
 const params=new URLSearchParams(hash.slice(1));
 try{history.replaceState(history.state,'',location.pathname+location.search)}catch(_){}
 const expected=session(STATE_KEY);dropSession(STATE_KEY);
 if(!expected||params.get('state')!==expected){status('Недействительное состояние входа Oura. Начни подключение заново.');return true}
 if(params.has('error')){status('Oura отказала в доступе: '+String(params.get('error')).slice(0,90));return true}
 if(params.get('token_type')?.toLowerCase()!=='bearer'||!params.get('access_token')){status('Oura вернула неполную авторизацию.');return true}
 if(!(params.get('scope')||'').split(/\s+/).includes('daily')){status('Не дано разрешение daily. Подключи Oura заново и разреши ежедневные данные.');return true}
 const seconds=Number(params.get('expires_in'));
 if(!Number.isFinite(seconds)||seconds<=0){status('Не указан срок токена Oura; нужно подключение заново.');return true}
 token=params.get('access_token');expiry=Date.now()+seconds*1000;
 try{saveSession(TOKEN_KEY,JSON.stringify({token,expiry}))}catch(_){}
 status('✓ Oura подключена. Нажми «Проверить данные».');update();return true;
}
const returned=callback();
if(!returned){
 try{const cached=JSON.parse(session(TOKEN_KEY)||'null');
 if(cached&&typeof cached.token==='string'&&cached.expiry>Date.now()+30000){token=cached.token;expiry=cached.expiry;status('✓ Oura подключена в этом сеансе.')}}
 catch(_){}
}
el('ouraDisconnect').onclick=()=>{clearToken();status('Текущий сеанс Oura закрыт. Данные LifeSims не удалены. При необходимости отзови доступ в настройках Oura.')};
const dateAdd=(date,delta)=>{
 const p=date.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]+delta,12);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
async function read(name,start,end){
 let data=[],next='',pages=0;
 do{
  if(++pages>10)throw Error('Слишком много страниц Oura; сократи период.');
  const q=new URLSearchParams({start_date:start,end_date:end});if(next)q.set('next_token',next);
  let res;
  try{res=await fetch(API+name+'?'+q,{headers:{Authorization:'Bearer '+token},cache:'no-store'})}
  catch(_){throw Error('Нет доступа к Oura API из браузера (интернет или CORS). Если API блокирует запрос, потребуется защищённый сервер.')}
  if(res.status===401){clearToken();throw Error('Время доступа Oura истекло; подключи заново.')}
  if(res.status===403)throw Error('Oura запретила доступ. Проверь разрешение daily и подписку.');
  if(res.status===429)throw Error('Достигнут лимит Oura; повтори позже.');
  if(!res.ok)throw Error('Oura '+name+': ошибка '+res.status);
  const obj=await res.json();
  if(!Array.isArray(obj.data))throw Error('Неожиданные данные Oura '+name);
  data.push(...obj.data);if(data.length>5000)throw Error('Слишком много записей Oura.');
  next=obj.next_token||'';
 }while(next);
 return data;
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
}
function apply(automatic=false){
 if(!preview)return;
 if(preview.snapshot!==JSON.stringify(bridge.getDays())){preview=null;renderPreview();throw Error('Показатели LifeSims изменились. Проверь данные Oura ещё раз.')}
 const done=bridge.importDays(preview.records);
 preview=null;renderPreview();saveSetting(LAST_KEY,String(Date.now()));
 status('✓ Oura: обновлено '+done.fields+' показателей за '+done.days+' дней; ручные записи не перезаписаны.'+(automatic?' Автопроверка выполнена.':''));
 update();
}
async function load(automatic=false){
 if(busy||!connected())return;
 if(automatic&&!bridge.wasImported())return;
 busy=true;update();
 try{
  const end=bridge.today(),start=dateAdd(end,1-Number(el('ouraDays').value));
  status('Загружаю сон и активность Oura за '+start+' — '+end+'…');
  const sleep=await read('sleep',start,end);
  const activity=await read('daily_activity',start,end);
  const sleepScore=await read('daily_sleep',start,end);
  const readiness=await read('daily_readiness',start,end);
  const records=aggregate(sleep,activity,sleepScore,readiness);
  if(!records.length){preview=null;renderPreview();status('Oura не вернула данные за этот период. Синхронизируй кольцо через приложение Oura.');return}
  preview={records,snapshot:JSON.stringify(bridge.getDays())};renderPreview();
  status('✓ Oura: найдено '+records.length+' дней данных. '+(automatic?'Обновляю только автоматически полученные или пустые поля…':'Нажми «Сохранить в LifeSims».'));
  if(automatic)apply(true);
 }finally{busy=false;update()}
}
el('ouraPreview').onclick=()=>load(false).catch(e=>status('⚠ '+e.message));
el('ouraApply').onclick=()=>{try{apply(false)}catch(e){status('⚠ '+e.message)}};
update();
if(connected()&&el('ouraAuto').checked&&bridge.wasImported()){
 const last=Number(setting(LAST_KEY)||0);
 if(!Number.isFinite(last)||Date.now()-last>6*60*60*1000){
  saveSetting(LAST_KEY,String(Date.now()));
  load(true).catch(e=>status('⚠ Oura: '+e.message));
 }
}
window.LifeSimsOuraVersion='oura-v1';
})();