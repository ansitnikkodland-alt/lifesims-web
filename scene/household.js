/* LifeSims shared household panel.
 * Every signed-in avatar is the account holder; no second local character is created.
 * Location is opt-in and only updates while the browser page is foregrounded.
 */
(function(){
'use strict';
const cloud=()=>window.LifeSimsCloud;
const signed=()=>!!cloud()?.isActive?.();
const selfId=()=>cloud()?.activeId?.();
const account=()=>cloud()?.account?.();
const api=(path,method,payload)=>cloud().request(path,method,payload);
const E=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e};
const B=(text,cb,cls='secondary')=>{const e=E('button',text,cls);e.type='button';e.addEventListener('click',()=>Promise.resolve().then(cb).catch(err=>notice('⚠ '+err.message)));return e};
const F=(name,type='text',value='')=>{const e=document.createElement('input');e.type=type;e.value=value;e.placeholder=name;e.setAttribute('aria-label',name);e.className='cloud-input';return e};
const time=x=>x?new Date(x).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'ещё не отмечено';
const H=x=>x?Math.max(0,(Date.now()-Date.parse(x))/3600000):Infinity;
const sat=x=>Math.max(0,Math.round(100*(1-H(x)/12)));
const rid=()=>{const x=crypto.randomUUID?.()||'t'+Date.now()+'_'+Math.random().toString(36).slice(2);return x.replace(/[^A-Za-z0-9_-]/g,'')};
let cache=null,loaded=0,effects=null,tab='pets',root=null,notification='',watchId=null,lastSent=0,sharingStarted=false,chatPeer=null,chatTimer=0,petTimer=0;
function notice(message){notification=message;const area=document.querySelector('#cloudStatus');if(area)area.textContent=message}
async function fresh(force=false){
 if(!signed())return null;
 if(!force&&cache&&Date.now()-loaded<4500)return cache;
 cache=await api('/v1/household/overview');loaded=Date.now();return cache;
}
async function refreshEffects(){
 if(!signed())return null;
 const [current,history]=await Promise.all([api('/v1/household/effects'),api('/v1/household/history')]);
 effects=current;
 cloud()?.setFamilyEffects?.(effects.metrics||{});
 window.LifeSimsCloudBridge?.replayFamilySkills?.(history.events||[]);
 return effects;
}
function stopTimers(){if(chatTimer){clearInterval(chatTimer);chatTimer=0}if(petTimer){clearInterval(petTimer);petTimer=0}}
function open(section='pets'){cloud()?.openSection?.(section)}
function header(parent,title,subtitle){parent.append(E('h3',title,'house-title'));if(subtitle)parent.append(E('p',subtitle,'house-note'))}
function row(parent,label,value){const c=E('div',null,'house-line');c.append(E('span',label),E('strong',value));parent.append(c);return c}
function card(parent){const c=E('section',null,'house-card');parent.append(c);return c}
function trimSkills(skillString){
 return String(skillString||'').split(',').map(pair=>{const [name,amount]=pair.trim().split(':');return {name:String(name||'').trim(),xp:Math.max(0,Math.min(30,Number(amount)||0))}}).filter(x=>x.name).slice(0,3);
}
async function render(section,host){
 tab=section;root=host;stopTimers();
 host.replaceChildren();
 if(!signed()){host.append(E('p','Сначала войди в аккаунт LifeSims.','house-note'));return}
 header(host,'👨‍👩‍👧 Семья · '+({pets:'котики',care:'забота',chat:'сообщения',places:'местоположение'}[section]||section),
  'Персонаж = аккаунт. Общие действия синхронизируются между устройствами.');
 host.append(E('p','Тестовая база до 23.12.2026. Не записывайте реальные чувствительные данные детей.','house-warning'));
 const loading=E('p','Загружаю семейные данные…','house-note');host.append(loading);
 const data=await fresh();
 if(!host.isConnected||tab!==section)return;
 loading.remove();
 if(section==='pets')pets(host,data);
 else if(section==='care')care(host,data);
 else if(section==='chat')await chat(host,data);
 else if(section==='places')places(host,data);
}
async function rerender(){cache=null;loaded=0;const host=root;if(host&&host.isConnected)await render(tab,host)}
function choosePet(c,key){
 const pet=cache?.pets?.find(p=>p.key===key);
 const name=pet?.name||key;
 return c===key?name:(c==='both'?'общий лоток':name);
}
function pets(host,d){
 header(host,'🐈 Наши котики','У обоих котиков единая семейная история. Сытость после кормления падает с 100% до 0% за 12 часов.');
 const items=E('div',null,'house-pet-grid');host.append(items);
 function populate(){
  items.replaceChildren();
  for(const p of d.pets){
   const c=card(items),v=sat(p.fedAt);
   c.append(E('div',(p.key==='ginger'?'🧡 ':'🖤 ')+p.name,'house-pet-name'));
   row(c,'Сытость',v+'%');
   const track=E('div',null,'house-progress'),fill=E('div',null,'house-progress-fill');fill.style.width=v+'%';track.append(fill);c.append(track);
   row(c,'Кормление',time(p.fedAt));
   row(c,'Поглажен',time(p.pettedAt));
   c.append(B('🍽 Покормить',()=>petAction('feed',p.key),'primary'));
   c.append(B('❤️ Погладить',()=>petAction('pet',p.key)));
   if(account()?.role==='adult')c.append(B('✎ Переименовать',async()=>{
    const name=prompt('Новое имя котика',p.name);
    if(!name||!name.trim())return;
    await api('/v1/household/pets/name','PUT',{pet:p.key,name:name.trim()});
    notice('Имя сохранено для всей семьи');await rerender();
   }));
  }
 }
 populate();
 row(host,'🧹 Лоток убран',time(d.litterCleanedAt));
 host.append(B('🧹 Убрать общий лоток',()=>petAction('litter','both'),'primary'));
 const feedEvents=(d.events||[]).filter(x=>x.type==='pet');
 if(feedEvents.length){
  header(host,'История ухода');
  for(const e of feedEvents.slice(0,15)){
   const verb={feed:'покормил(а)',pet:'погладил(а)',litter:'убрал(а) лоток'}[e.action]||e.action;
   host.append(E('p',e.actorName+' · '+verb+' · '+(e.subject==='both'?'оба котика':choosePet(e.subject,e.subject))+' · '+time(e.at),'house-history'));
  }
 }
 petTimer=setInterval(()=>{if(tab==='pets'&&host.isConnected&&document.visibilityState==='visible')populate()},60000);
}
async function petAction(action,pet){
 const result=await api('/v1/household/pets/care','POST',{action,pet,requestId:rid()});
 if(result.duplicate)return;
 notice('✓ Уход записан для всей семьи, с именем того, кто его выполнил.');
 await refreshEffects().catch(()=>{});
 await rerender();
}
function care(host,d){
 header(host,'Забота о близких','Семейное действие повышает показатель получателя, а исполнителю добавляет XP выбранных навыков. Каждый эффект можно изменить.');
 const others=d.members.filter(x=>x.id!==selfId());
 if(!others.length){host.append(E('p','Добавь детский аккаунт в разделе «Дети».','house-note'));return}
 const selected=E('select');selected.className='cloud-input';selected.setAttribute('aria-label','Член семьи');
 for(const x of others){const o=E('option',x.name+(x.role==='child'?' · ребёнок':''));o.value=x.id;selected.append(o)}
 host.append(selected);
 const list=E('div',null,'house-actions');host.append(list);
 for(const rule of d.rules){
  const c=card(list);c.append(E('strong',rule.title));
  c.append(E('p','Получателю: '+rule.metric+' +'+rule.gain+' · Исполнителю: '+rule.skills.map(s=>s.name+' +'+s.xp).join(', ')+' · проект '+(rule.project||'—'),'house-note'));
  c.append(B('✓ '+rule.title,async()=>{
   const recipient=d.members.find(x=>x.id===selected.value);
   if(!confirm('Записать действие «'+rule.title+'» для '+(recipient?.name||'этого персонажа')+'?'))return;
   const result=await api('/v1/household/actions','POST',{to:selected.value,actionId:rule.id,requestId:rid()});
   if(result.event)window.LifeSimsCloudBridge?.recordFamilySkill?.(result.event);
   await refreshEffects().catch(()=>{});
   notice('✓ '+rule.title+' · влияет на получателя и навыки исполнителя.');await rerender();
  },'primary'));
 }
 const events=(d.events||[]).filter(x=>x.type==='member');
 if(events.length){
  header(host,'Сегодня и ранее');
  for(const x of events.slice(0,20)){
   host.append(E('p',x.actorName+' → '+x.recipientName+' · '+(x.details?.title||x.action)+' · '+time(x.at),'house-history'));
  }
 }
 if(account()?.role==='adult')editor(host,d);
 host.append(E('p','Прибавки к сытости, настроению и другим шкалам — игровые. Они не подтверждают реальное кормление или медицинское состояние человека.','house-note'));
}
function editor(host,d){
 const details=E('details',null,'house-editor'),summary=E('summary','⚙ Настроить семейные действия');details.append(summary);
 const wrap=E('div',null,'house-rules');details.append(wrap);
 let draft=d.rules.map(x=>({...x,skills:(x.skills||[]).map(y=>({...y}))}));
 function draw(){
  wrap.replaceChildren();
  for(const item of draft){
   const c=card(wrap);
   const title=F('Название действия','text',item.title);title.maxLength=65;
   const metric=E('select');metric.className='cloud-input';metric.setAttribute('aria-label','Изменяемый показатель');
   for(const [key,label] of [['nutrition','Сытость / питание'],['mood','Настроение'],['resource','Ресурс'],['hygiene','Гигиена'],['physical','Физическое состояние']]){
    const o=E('option',label);o.value=key;metric.append(o);
   }metric.value=item.metric;
   const gain=F('Прибавка от 0 до 30','number',String(item.gain));gain.min='0';gain.max='30';
   const skills=F('Навыки, например Забота:8, Коммуникация:4','text',item.skills.map(y=>y.name+':'+y.xp).join(', '));
   const project=F('Проект','text',item.project||'Семья');project.maxLength=50;
   for(const [label,field]of [['Название',title],['Показатель получателя',metric],['Прибавка',gain],['Навыки исполнителя (имя:XP)',skills],['Проект',project]]){
    const l=E('label',label,'house-field');l.append(field);c.append(l);
   }
   const synchronize=()=>{item.title=title.value;item.metric=metric.value;item.gain=Number(gain.value);item.skills=trimSkills(skills.value);item.project=project.value};
   [title,metric,gain,skills,project].forEach(el=>el.addEventListener('change',synchronize));
   c.append(B('Удалить действие',()=>{draft=draft.filter(x=>x!==item);draw()}));
  }
  wrap.append(B('＋ Добавить действие',()=>{
   const id='action_'+Math.random().toString(36).slice(2,9);
   draft.push({id,title:'Новое действие',metric:'mood',gain:5,skills:[{name:'Забота',xp:5}],project:'Семья'});draw();
  }));
  wrap.append(B('Сохранить настройки для семьи',async()=>{
   if(!draft.length)return notice('Должно остаться хотя бы одно действие');
   await api('/v1/household/rules','PUT',{rules:draft});
   notice('✓ Настройки сохранены для всех аккаунтов семьи');await rerender();
  },'primary'));
 }
 draw();host.append(details);
}
async function chat(host,d){
 header(host,'💬 Личные сообщения','Переписка доступна только между связанными аккаунтами. Это текстовый чат без сквозного шифрования и без push-уведомлений.');
 const linked=await api('/v1/connections');
 if(!host.isConnected||tab!=='chat')return;
 const peers=(linked.connections||[]).map(x=>x.peer);
 if(!peers.length){host.append(E('p','Сначала добавь связь в разделе «Связи».','house-note'));return}
 if(!peers.some(x=>x.id===chatPeer))chatPeer=peers[0].id;
 const select=E('select');select.className='cloud-input';select.setAttribute('aria-label','С кем переписываться');
 for(const p of peers){const o=E('option',p.displayName);o.value=p.id;select.append(o)}select.value=chatPeer;
 host.append(select);
 const log=E('div',null,'house-chat-log');log.setAttribute('aria-live','polite');host.append(log);
 async function read(){
  if(!host.isConnected||tab!=='chat'||!document.querySelector('#cloudDialog')?.open)return;
  const messages=(await api('/v1/household/chat?peer='+encodeURIComponent(chatPeer))).messages||[];
  if(!host.isConnected||tab!=='chat')return;
  log.replaceChildren();
  for(const x of messages){
   const line=E('div',null,'house-message '+(x.from===selfId()?'mine':'theirs'));
   line.append(E('p',x.text),E('small',time(x.at)));log.append(line);
  }
  log.scrollTop=log.scrollHeight;
 }
 select.addEventListener('change',()=>{chatPeer=select.value;read().catch(e=>notice(e.message))});
 const form=E('form',null,'house-chat-form'),field=F('Сообщение','text');field.maxLength=1000;
 const submit=E('button','Отправить','primary');submit.type='submit';form.append(field,submit);
 form.addEventListener('submit',e=>{e.preventDefault();const text=field.value.trim();if(!text)return;
  api('/v1/household/chat','POST',{to:chatPeer,text}).then(()=>{field.value='';return read()}).catch(err=>notice(err.message));
 });host.append(form);
 await read();
 chatTimer=setInterval(()=>read().catch(()=>{}),12000);
}
function places(host,d){
 header(host,'📍 Семейные места','Геолокация добровольная, передаётся только из открытого LifeSims и видна участникам семейного аккаунта. Отключение удаляет сохранённую точку.');
 host.append(E('p','Не работает как непрерывный трекер при закрытом приложении. Точность GPS не гарантирована. Сообщения о приходе и уходе приблизительные; push-уведомлений пока нет.','house-warning'));
 const own=d.locations.find(x=>x.id===selfId());
 const state=card(host);
 row(state,'Мой персонаж',account()?.displayName||'');
 row(state,'Статус',sharingStarted?'Передаю геопозицию в открытом приложении':own?.sharing?'Разрешено · сейчас не обновляется':'Не передаю');
 if(account()?.role==='child'&&!own?.approved)state.append(E('p','Родитель ещё не разрешил передачу геопозиции.','house-note'));
 const enable=B('📡 Начать передачу своего местоположения',async()=>{
  if(!navigator.geolocation)return notice('Браузер не поддерживает геолокацию');
  if(!confirm('Разрешить LifeSims передавать твоё местоположение семье, пока приложение открыто? Остановить можно в любой момент.'))return;
  await api('/v1/household/location/sharing','PUT',{enabled:true});
  startWatch();notice('Запрос геолокации отправлен браузеру. Показывай экран приложения для обновлений.');
 },'primary');
 if(!sharingStarted)state.append(enable);
 state.append(B('Остановить и удалить свою последнюю точку',async()=>{
  stopWatch();
  await api('/v1/household/location/sharing','PUT',{enabled:false});
  notice('Геопозиция выключена; последняя координата и история посещённых мест на сервере удалены.');await rerender();
 }));
 if(account()?.role==='adult'){
  header(host,'Разрешения детей');
  for(const x of d.locations.filter(x=>x.role==='child')){
   const line=card(host);line.append(E('strong',x.name));
   row(line,'Родитель разрешил',x.approved?'Да':'Нет');
   line.append(B(x.approved?'Запретить передачу ребёнка':'Разрешить ребёнку включить передачу',async()=>{
    if(!confirm((x.approved?'Отозвать разрешение для ':'Разрешить ребёнку самостоятельно включить геолокацию для ')+x.name+'?'))return;
    await api('/v1/household/location/approve','PUT',{childId:x.id,approved:!x.approved});
    notice('Разрешение изменено. На телефоне ребёнка передача всё равно включается отдельно.');await rerender();
   }));
  }
 }
 header(host,'Участники семьи');
 for(const p of d.locations){
  const c=card(host);
  c.append(E('strong',p.name+' · '+(p.role==='child'?'ребёнок':'взрослый')));
  if(!p.position)c.append(E('p',p.sharing?'Нет свежей позиции (в пределах 24 часов).':'Геолокация отключена.','house-note'));
  else{
   row(c,'Последний сигнал',time(p.position.at));
   row(c,'Оценка погрешности','±'+Math.round(p.position.accuracy)+' м');
   c.append(B('🗺 Открыть эту точку на карте',()=>{
    const url='https://www.openstreetmap.org/?mlat='+encodeURIComponent(p.position.lat)+'&mlon='+encodeURIComponent(p.position.lon)+'#map=16/'+p.position.lat+'/'+p.position.lon;
    if(confirm('Открыть координаты через OpenStreetMap? Координаты станут доступны этому внешнему сервису.'))window.open(url,'_blank','noopener,noreferrer');
   }));
  }
 }
 header(host,'🏠 Места: дом, школа и другое','Зоны задаются центром и радиусом от 50 до 1000 м. В тесте история хранится только 3 дня.');
 for(const p of d.places){
  const c=card(host);c.append(E('strong',p.name));
  row(c,'Радиус',p.radius+' м');
  if(account()?.role==='adult')c.append(B('Удалить место',async()=>{
   if(!confirm('Удалить зону «'+p.name+'»?'))return;
   await api('/v1/household/places','PUT',{places:d.places.filter(x=>x.id!==p.id).map(x=>({name:x.name,lat:x.lat,lon:x.lon,radius:x.radius}))});
   notice('Место удалено');await rerender();
  }));
 }
 if(account()?.role==='adult'){
  const f=E('form',null,'house-card');
  f.append(E('strong','Добавить семейное место'));
  const name=F('Название: Дом, Школа');name.maxLength=50;name.required=true;
  const lat=F('Широта','number');lat.step='any';lat.required=true;
  const lon=F('Долгота','number');lon.step='any';lon.required=true;
  const radius=F('Радиус в метрах','number','150');radius.min='50';radius.max='1000';radius.required=true;
  f.append(name,lat,lon,radius);
  f.append(B('📍 Подставить мою текущую позицию',()=>new Promise((resolve,reject)=>{
   if(!navigator.geolocation)return reject(Error('Геолокация не поддерживается'));
   navigator.geolocation.getCurrentPosition(p=>{lat.value=String(p.coords.latitude);lon.value=String(p.coords.longitude);resolve()},e=>reject(Error(e.message)),{enableHighAccuracy:true,timeout:20000});
  })));
  const submit=E('button','Сохранить зону','primary');submit.type='submit';f.append(submit);
  f.addEventListener('submit',e=>{e.preventDefault();const current=d.places.map(x=>({name:x.name,lat:x.lat,lon:x.lon,radius:x.radius}));
   current.push({name:name.value.trim(),lat:Number(lat.value),lon:Number(lon.value),radius:Number(radius.value)});
   api('/v1/household/places','PUT',{places:current}).then(()=>{notice('Место сохранено');rerender()}).catch(err=>notice(err.message));
  });host.append(f);
 }
 if(d.placeEvents?.length){
  header(host,'Последние зафиксированные события');
  for(const x of d.placeEvents.slice(0,25))
   host.append(E('p',x.name+' · '+(x.type==='arrived'?'прибыл(а)':'ушёл/ушла')+' · '+x.place+' · '+time(x.at),'house-history'));
 }
 host.append(B('↻ Обновить позиции',()=>rerender()));
}
function startWatch(){
 if(watchId!=null)navigator.geolocation.clearWatch(watchId);
 sharingStarted=true;
 watchId=navigator.geolocation.watchPosition(async p=>{
  if(!signed()||document.visibilityState!=='visible')return;
  if(Date.now()-lastSent<30000)return;
  lastSent=Date.now();
  try{
   await api('/v1/household/location/position','POST',{lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy});
   notice('📍 Геопозиция обновлена: '+new Date().toLocaleTimeString('ru-RU')+' · ±'+Math.round(p.coords.accuracy)+' м');
  }catch(err){notice('Геопозиция: '+err.message)}
 },err=>{notice('Браузер не определил позицию: '+err.message);stopWatch()}, {enableHighAccuracy:true,maximumAge:0,timeout:25000});
}
function stopWatch(){
 if(watchId!=null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);
 watchId=null;sharingStarted=false;
}
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState!=='visible'&&watchId!=null){stopWatch();notice('Передача приостановлена при сворачивании; для возобновления нажми «Начать передачу».')}
});
window.LifeSimsHousehold={render,open,refreshEffects,petAction,stopWatch};
})();
