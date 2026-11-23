/* LifeSims cloud family accounts (prototype).
 * Uses authenticated, versioned saves. Existing local data is never uploaded without consent.
 * Render Free PostgreSQL expires 2026-12-23: DO NOT use as a durable child data store.
 */
(function(){
'use strict';
const API=(location.hostname==='127.0.0.1'||location.hostname==='localhost')?'http://127.0.0.1:8766':'https://lifesims-family-test-api.onrender.com';
const SESSION='lifesims-cloud-auth-v1';
const DEADLINE='23 декабря 2026';
function readSession(){
 try{const x=JSON.parse(sessionStorage.getItem(SESSION)||'null');if(!x||!x.token||!x.account?.id||!/^[0-9a-f-]{36}$/i.test(x.account.id))return null;return x}catch(_){return null}
}
let session=readSession(),revision=null,remote=null,syncArmed=false,queued=null,saving=false,timer=0,bonus=0,bonusAsOf=0,dialog,section=session?.account?.role==='adult'?'children':'save',status='',children=[],familyMetrics={},familyAsOf=0;
const isActive=()=>!!session,activeId=()=>session?.account?.id||null;
function activeStore(){return session?'lifesims-cloud-'+session.account.id:null}
function setFamilyEffects(metrics){familyMetrics=metrics&&typeof metrics==='object'?metrics:{};familyAsOf=Date.now();window.LifeSimsCloudBridge?.refresh?.()}
function metricBonus(metric,day){
 const now=new Date();
 const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 const key=metric==='condition'?'physical':metric;
 return session&&day===today&&Date.now()-familyAsOf<600000?Math.max(0,Number(familyMetrics[key])||0):0;
}
function openSection(name){
 section=name||'save';
 if(!dialog)return;
 render();if(!dialog.open)dialog.showModal();
}
function resourceBonus(d){
 const now=new Date();
 const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 return (session&&d===today&&Date.now()-bonusAsOf<600000?bonus:0)+metricBonus('resource',d);
}
window.LifeSimsCloud={isActive,activeId,activeStore,resourceBonus,onLocalSave,request,account:()=>session?.account||null,openSection,metricBonus,setFamilyEffects};
async function request(path,method='GET',payload){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch(API+path,{method,headers:{
   ...(payload!==undefined?{'Content-Type':'application/json'}:{}),
   ...(session?{Authorization:'Bearer '+session.token}:{})
  },body:payload===undefined?undefined:JSON.stringify(payload),signal:controller.signal});
  const data=await response.json().catch(()=>({error:'Не удалось прочитать ответ сервера'}));
  if(!response.ok){const err=new Error(data.error||'Ошибка HTTP '+response.status);err.status=response.status;throw err}
  return data;
 }finally{clearTimeout(timeout)}
}
function setStatus(message){status=message;const el=document.getElementById('cloudStatus');if(el)el.textContent=message}
function onLocalSave(raw){
 if(!session||!syncArmed)return;
 queued=raw;
 clearTimeout(timer);timer=setTimeout(flush,900);
}
async function flush(){
 if(saving||!session||!syncArmed||revision==null||!queued)return;
 saving=true;
 const raw=queued;queued=null;
 try{
  const result=await request('/v1/me/save','PUT',{revision,payload:JSON.parse(raw)});
  revision=result.revision;
  setStatus('✓ Сохранено в тестовом облаке · ревизия '+revision+' · база истекает '+DEADLINE);
 }catch(err){
  syncArmed=false;queued=raw;
  setStatus(err.status===409?'⚠ На другом устройстве есть более новая версия. Автосинхронизация остановлена. Сначала сохраните JSON и разрешите конфликт.':'⚠ Не удалось сохранить в облако: '+err.message+'. Локальная версия сохранена.');
 }finally{saving=false;if(queued&&syncArmed)setTimeout(flush,1000)}
}
function el(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e}
function btn(text,cb,cls='secondary'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',cb);return b}
function input(placeholder,type='text',value=''){
 const e=document.createElement('input');e.type=type;e.placeholder=placeholder;e.value=value;e.required=true;e.className='cloud-input';e.setAttribute('aria-label',placeholder);return e;
}
function formSubmit(parent,submit){
 parent.addEventListener('submit',ev=>{ev.preventDefault();submit().catch(err=>setStatus('⚠ '+err.message))});
}
function warning(){return el('p','⚠ Это тестовая облачная база до '+DEADLINE+'. Не загружайте в неё реальные сведения о здоровье детей или фотографии, пока не подключено постоянное хранилище и не проверена политика обработки детских данных.','cloud-warning')}
function updateHeader(){
 if(!session)return;
 const title=document.querySelector('.topbar .person strong'),portrait=document.getElementById('portraitBtn');
 if(title)title.textContent='LifeSims · '+session.account.displayName;
 if(portrait){
  portrait.title='Облачный персонаж: '+session.account.displayName;
  portrait.style.backgroundImage=session.account.avatar?'url('+session.account.avatar+')':'none';
  portrait.textContent=session.account.avatar?'':'👤';
  portrait.style.backgroundSize='cover';
 }
}
function open(){render();if(!dialog.open)dialog.showModal()}
async function load(){
 if(!session)return;
 try{
  const me=await request('/v1/me');
  if(me.account.id!==session.account.id)throw new Error('Аккаунт не совпадает');
  session.account=me.account;
  sessionStorage.setItem(SESSION,JSON.stringify(session));
  updateHeader();
  const [data,effects]=await Promise.all([request('/v1/me/save'),request('/v1/me/effects')]);
  revision=data.revision;remote=data.payload;bonus=effects.resourceBonus||0;bonusAsOf=Date.now();
  window.LifeSimsCloudBridge?.refresh?.();
  window.LifeSimsHousehold?.refreshEffects?.().catch?.(()=>{});
  if(revision===0&&!localStorage.getItem(activeStore())){
   syncArmed=true;setStatus('Облачное сохранение пока пусто. Новые записи будут сохраняться автоматически в тестовую базу.');
  }else{
   syncArmed=false;
   setStatus('Сохранение найдено. Открой вкладку «Прогресс» и выбери нужную версию, прежде чем включать синхронизацию.');
  }
  render();
 }catch(e){syncArmed=false;setStatus('⚠ Сервер недоступен или сеанс истёк: '+e.message+'. Локальные записи остаются на устройстве.');render()}
}
function render(){
 if(!dialog)return;
 const body=dialog.querySelector('#cloudBody'),nav=dialog.querySelector('#cloudNav');
 body.replaceChildren();nav.replaceChildren();
 if(!['pets','care','chat','places'].includes(section))window.LifeSimsHousehold?.leave?.();
 if(!session){guest(body);return}
 const me=session.account;
 body.append(el('p','Мой персонаж: '+me.displayName+' · '+(me.role==='child'?'детский аккаунт':'взрослый аккаунт'),'cloud-muted'));
 body.append(warning());
 const tabs=[['children','Участники'],['save','Прогресс'],['links','Связи'],['appearance','Фото'],['pets','Котики'],['care','Забота'],['chat','Чат'],['places','Места']];
 for(const [id,label] of tabs){
  if(id==='children'&&me.role!=='adult')continue;
  const b=btn(label,()=>{section=id;render()},section===id?'primary':'secondary');nav.append(b);
 }
 if(section==='save')progress(body);
 if(section==='children'&&me.role==='adult')family(body);
 if(section==='links')connections(body);
 if(section==='appearance')appearance(body);
 if(['pets','care','chat','places'].includes(section)){
  if(window.LifeSimsHousehold?.render)window.LifeSimsHousehold.render(section,body).catch(err=>setStatus('⚠ Семья: '+err.message));
  else body.append(el('p','Семейные функции ещё загружаются.','cloud-muted'));
 }
 const deletion=el('details',null,'cloud-delete-section');
 deletion.append(el('summary','Удалить мой облачный аккаунт'));
 deletion.append(el('p',session.account.role==='adult'?'Удаление взрослого аккаунта также удалит все управляемые детские аккаунты и их облачные записи.':'Удаление уничтожит облачное сохранение и связи этого персонажа.','cloud-warning'));
 const confirmation=input('Пароль для подтверждения удаления','password');
 deletion.append(confirmation,btn('Безвозвратно удалить облачный аккаунт',async()=>{
  if(!confirmation.value)return setStatus('Сначала укажи пароль');
  if(!confirm('Безвозвратно удалить этот аккаунт, все облачные сохранения и связанные детские аккаунты?'))return;
  await request('/v1/me/account','DELETE',{password:confirmation.value});
  sessionStorage.removeItem(SESSION);location.reload();
 },'cloud-delete'));
 body.append(deletion);
 body.append(btn('Выйти из аккаунта',async()=>{
  if(queued||saving){if(!confirm('Есть несохранённые в облаке изменения. Локальные данные останутся на устройстве. Выйти?'))return}
  try{await request('/v1/auth/logout','POST',{})}catch(e){setStatus('Выход на сервере не подтверждён: '+e.message)}
  sessionStorage.removeItem(SESSION);location.reload();
 },'cloud-logout'));
}
function guest(body){
 body.append(el('p','Один аккаунт — один персонаж. У каждого свой прогресс, фото и комната. Родитель создаёт детям отдельные входы без email.','cloud-muted'));
 body.append(warning());
 const login=el('form',null,'cloud-card');
 login.append(el('strong','Войти в LifeSims'));
 const email=input('Email или логин ребёнка');email.autocomplete='username';
 const password=input('Пароль','password');password.autocomplete='current-password';
 const submit=el('button','Войти','primary');submit.type='submit';
 login.append(email,password,submit);
 formSubmit(login,async()=>{
  const data=await request('/v1/auth/login','POST',{login:email.value,password:password.value});
  session={token:data.token,account:data.account};
  sessionStorage.setItem(SESSION,JSON.stringify(session));
  location.reload();
 });
 body.append(login);
 const register=el('form',null,'cloud-card');
 register.append(el('strong','Создать взрослый аккаунт'));
 const name=input('Имя');name.maxLength=60;
 const mail=input('Ваш email','email');mail.autocomplete='email';
 const secret=input('Пароль не менее 12 символов','password');secret.minLength=12;secret.autocomplete='new-password';
 const btnReg=el('button','Зарегистрироваться','primary');btnReg.type='submit';
 register.append(name,mail,secret,btnReg);
 formSubmit(register,async()=>{
  const data=await request('/v1/auth/register','POST',{displayName:name.value,email:mail.value,password:secret.value});
  session={token:data.token,account:data.account};
  sessionStorage.setItem(SESSION,JSON.stringify(session));location.reload();
 });
 body.append(register);
 body.append(el('p','Email пока не подтверждается письмом. Это ограничение тестового режима. Не используйте для восстановления пароля или платных подписок.','cloud-muted'));
 const legacy=el('details',null,'cloud-legacy'),summary=el('summary','Ранее созданные локальные персонажи');
 legacy.append(summary,el('p','Локальные персонажи из предыдущих версий сохранены на этом устройстве, но это не облачные аккаунты. Этот раздел оставлен только для работы со старыми данными.','cloud-muted'));
 legacy.append(btn('Открыть старые локальные персонажи',()=>{
  dialog.close();
  window.LifeSimsFamily?.open?.('people');
 }));
 body.append(legacy);
}
function saveMeta(obj){
 if(!obj)return 'данных нет';
 return [Object.keys(obj.days||{}).length+' дней',(obj.events||[]).length+' событий',(obj.activities||[]).length+' дел и привычек'].join(' · ');
}
function canImport(obj){return obj?.schema===2&&obj.days&&Array.isArray(obj.activities)&&Array.isArray(obj.events)}
function progress(body){
 const localString=localStorage.getItem(activeStore());
 let local;try{local=JSON.parse(localString)}catch(_){}
 body.append(el('p','Локально: '+saveMeta(local),'cloud-muted'));
 body.append(el('p','В тестовом облаке: '+saveMeta(remote)+' · ревизия '+(revision??'не загружена'),'cloud-muted'));
 if(revision==null){body.append(btn('Перепроверить сервер',load));return}
 if(remote&&canImport(remote))body.append(btn('⬇ Открыть облачное сохранение',()=>{
  if(!confirm('Сохранить текущую локальную копию отдельно и открыть облачную версию? Изменения, ещё не отправленные в облако, останутся только в резервной копии.'))return;
  const done=window.LifeSimsCloudBridge?.apply?.(remote);
  if(!done)return setStatus('Не удалось открыть облачное сохранение. Старые данные сохранены.');
  syncArmed=true;queued=null;
  setStatus('✓ Облачный прогресс открыт. Следующие изменения сохраняются автоматически.');render();
 }));
 if(!remote&&local===null)body.append(el('p','Начни пользоваться LifeSims: после первой записи появится облачное сохранение.','cloud-muted'));
 if(canImport(local))body.append(btn(remote?'⬆ Отправить текущую версию вместо облачной':'⬆ Сохранить текущую версию в облако',async()=>{
  if(!confirm('Отправить локальные записи в тестовую базу?'+(remote?' Это заменит облачную версию.':'')+' Обязательно сохраняйте свои JSON-копии.'))return;
  const last=window.LifeSimsCloudBridge?.export?.();
  if(!last)return setStatus('Локальные данные недоступны');
  const result=await request('/v1/me/save','PUT',{revision,payload:JSON.parse(last)});
  revision=result.revision;remote=JSON.parse(last);syncArmed=true;queued=null;
  setStatus('✓ Текущая версия отправлена. Далее сохраняется автоматически.');render();
 }));
 if(session.account.role==='adult'){
  let legacy;
  try{legacy=JSON.parse(localStorage.getItem('lifesims-visual-v1')||'null')}catch(_){}
  if(canImport(legacy)&&(!canImport(local)||saveMeta(legacy)!==saveMeta(local))){
   body.append(el('p','Найден прежний локальный прогресс: '+saveMeta(legacy),'cloud-muted'));
   body.append(btn('📦 Перенести прежний LifeSims в этот аккаунт',async()=>{
    if(!confirm('Скопировать прежнее сохранение в текущий аккаунт и загрузить в облако? Оригинал останется в браузере.'))return;
    const done=window.LifeSimsCloudBridge?.apply?.(legacy);if(!done)return setStatus('Импорт остановлен — прежние данные не изменены.');
    try{
     const result=await request('/v1/me/save','PUT',{revision,payload:legacy});
     revision=result.revision;remote=legacy;syncArmed=true;queued=null;
     setStatus('✓ Данные скопированы в облако. Старый локальный профиль не изменён.');render();
    }catch(err){syncArmed=false;setStatus('Копия на устройстве готова, но отправить в облако не удалось: '+err.message)}
   }));
  }
 }
 body.append(btn('⬇ Скачать JSON облачного прогресса',async()=>{
  const data=await request('/v1/me/save');
  if(!data.payload)return setStatus('В облаке пока нет сохранения');
  const blob=new Blob([JSON.stringify(data.payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='LifeSims-cloud-'+session.account.id+'.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  setStatus('JSON выгружен. В файле могут быть личные сведения — храните его приватно.');
 }));
 body.append(btn('↻ Проверить облачную версию',load));
 body.append(el('p','При конфликте синхронизация останавливается, пока пользователь не выберет нужную версию. Никакого автоматического объединения дневника, медицинских записей или мероприятий нет.','cloud-muted'));
}
async function family(body){
 body.append(el('p','Каждый участник — отдельный аккаунт и отдельный персонаж, с личным прогрессом и общей семейной жизнью.','cloud-muted'));
 const own=el('div',null,'cloud-card'),ownHead=el('strong','👤 '+session.account.displayName+' · я');
 own.append(ownHead,el('p','Этот персонаж связан с текущим аккаунтом. Фото и комната находятся во вкладке «Фото».','cloud-muted'));
 body.append(own);
 const create=el('form',null,'cloud-card');
 create.append(el('strong','Новый детский аккаунт'));
 const name=input('Имя ребёнка');name.maxLength=60;
 const password=input('Пароль ребёнка, от 12 символов','password');password.minLength=12;
 const submit=el('button','Создать аккаунт ребёнка','primary');submit.type='submit';
 create.append(name,password,submit);
 const result=el('p','', 'cloud-result');
 formSubmit(create,async()=>{
  if(!confirm('Создать ребёнку отдельный аккаунт в тестовой облачной базе? Не загружайте реальные сведения о здоровье.'))return;
  const data=await request('/v1/children','POST',{displayName:name.value,password:password.value});
  result.textContent='Создан аккаунт '+data.child.displayName+' · логин: '+data.child.login+'. Сохраните логин и пароль, иначе ребёнок не войдёт.';
  name.value='';password.value='';await refreshChildren();render();
  setStatus(result.textContent);
 });
 create.append(result);body.append(create);
 if(!children.length)body.append(btn('Показать детские аккаунты',refreshChildren));
 for(const c of children){
  const card=el('div',null,'cloud-card');card.append(el('strong',c.displayName),el('p','Логин: '+c.login,'cloud-muted'));
  card.append(btn('Копировать логин',()=>navigator.clipboard?.writeText(c.login).then(()=>setStatus('Логин скопирован')).catch(()=>setStatus('Скопируй логин вручную.'))));
  const deletion=el('details');const summary=el('summary','Удалить аккаунт ребёнка');deletion.append(summary);
  const pass=input('Пароль родителя для удаления','password');
  deletion.append(pass,btn('Удалить аккаунт и все сохранения ребёнка',async()=>{
   if(!pass.value)return setStatus('Укажите пароль родителя');
   if(!confirm('Безвозвратно удалить аккаунт «'+c.displayName+'» и его облачный прогресс?'))return;
   await request('/v1/children','DELETE',{childId:c.id,yourPassword:pass.value});
   setStatus('Аккаунт ребёнка и его облачный прогресс удалены.');await refreshChildren();
  },'cloud-delete'));
  card.append(deletion);
  body.append(card);
 }
}
async function refreshChildren(){
 if(!session||session.account.role!=='adult')return;
 try{children=(await request('/v1/children')).children;render()}catch(e){setStatus('Дети: '+e.message)}
}
async function connections(body){
 const [connectionsList,kids]=await Promise.all([
  request('/v1/connections').then(x=>x.connections).catch(()=>[]),
  session.account.role==='adult'?request('/v1/children').then(x=>x.children).catch(()=>[]):Promise.resolve([])
 ]);
 body.append(el('p','Приглашения передаются лично кодом, действуют 48 часов и требуют подтверждения принимающей стороны. Дети не могут сами создавать или принимать внешние приглашения; это делает родитель.','cloud-muted'));
 for(const x of connectionsList){
  const row=el('div',null,'cloud-card');row.append(el('strong',x.peer.displayName+' · '+({parent:'семья',friend:'друзья',relative:'родственные связи',colleague:'коллеги',sibling:'брат/сестра'}[x.kind]||x.kind)));
  if(x.kind!=='parent')row.append(btn('Удалить связь',async()=>{if(!confirm('Удалить эту связь?'))return;await request('/v1/connections','DELETE',{connectionId:x.id});setStatus('Связь удалена');render()}));
  if(x.peer.id!==session.account.id){
   const select=el('select');select.className='cloud-input';
   for(const [v,label] of [['time','Провести время вместе'],['help','Помочь'],['support','Поддержать'],['home','Позаботиться о быте']]){
    const o=el('option',label);o.value=v;select.append(o);
   }
   row.append(select,btn('❤️ Записать заботу',async()=>{
    const key=(crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36)).replace(/[^A-Za-z0-9_-]/g,'');
    await request('/v1/care','POST',{to:x.peer.id,action:select.value,requestId:key});
    await loadEffects();setStatus('❤️ Забота сохранена на сервере · тебе +3, близкому +5 игровых пунктов на 24 часа.');
   }));
  }
  body.append(row);
 }
 if(session.account.role!=='adult')return;
 const invitation=el('form',null,'cloud-card');invitation.append(el('strong','Пригласить пользователя'));
 const who=el('select');who.className='cloud-input';who.setAttribute('aria-label','От какого аккаунта связь');
 const myself=el('option','От моего аккаунта');myself.value=session.account.id;who.append(myself);
 for(const c of kids){const opt=el('option','От ребёнка: '+c.displayName);opt.value=c.id;who.append(opt)}
 const kind=el('select');kind.className='cloud-input';kind.setAttribute('aria-label','Тип связи');
 for(const [value,label]of [['friend','Дружеская'],['relative','Родственная'],['colleague','Коллегиальная']]){
  const o=el('option',label);o.value=value;kind.append(o);
 }
 const code=el('p','', 'cloud-code');
 invitation.append(who,kind);
 const submit=el('button','Создать приглашение','primary');submit.type='submit';invitation.append(submit,code);
 formSubmit(invitation,async()=>{
  const data=await request('/v1/invites','POST',{fromAccountId:who.value,kind:kind.value});
  code.textContent='Код приглашения (действует 48 часов): '+data.code;
  invitation.append(btn('Копировать код',()=>navigator.clipboard?.writeText(data.code).then(()=>setStatus('Код скопирован'))));
 });
 body.append(invitation);
 const accept=el('form',null,'cloud-card');accept.append(el('strong','Принять приглашение'));
 const entry=input('Код приглашения');entry.autocomplete='off';
 const target=el('select');target.className='cloud-input';target.setAttribute('aria-label','Кому установить связь');
 const opt=el('option','Мне');opt.value=session.account.id;target.append(opt);
 for(const c of kids){const o=el('option','Ребёнку: '+c.displayName);o.value=c.id;target.append(o)}
 const ok=el('button','Принять','primary');ok.type='submit';
 accept.append(entry,target,ok);
 formSubmit(accept,async()=>{
  if(!confirm('Подтвердить установление связи для выбранного аккаунта?'))return;
  await request('/v1/invites/accept','POST',{code:entry.value,forChildId:target.value});
  setStatus('Связь подтверждена');render();
 });
 body.append(accept);
}
async function loadEffects(){
 if(!session)return;
 try{
  const r=await request('/v1/me/effects');
  bonus=r.resourceBonus||0;bonusAsOf=Date.now();
  window.LifeSimsCloudBridge?.refresh?.();
 }catch(e){setStatus('Ресурс семьи: '+e.message)}
}
async function photoToJpeg(file,max){
 if(!file||!file.type?.startsWith('image/')||file.size>12000000)throw Error('Выбери фото до 12 МБ');
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Не удалось открыть фото'));img.src=url});
  const c=document.createElement('canvas'),factor=Math.min(1,max/Math.max(img.width,img.height));
  c.width=Math.max(1,Math.round(img.width*factor));c.height=Math.max(1,Math.round(img.height*factor));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',max>300?.68:.7);
 }finally{URL.revokeObjectURL(url)}
}
function appearance(body){
 body.append(el('p','Это фотография персонажа текущего аккаунта. Она загружается в тестовую базу только с твоего подтверждения.','cloud-muted'));
 body.append(btn('🏠 Моя комната по фото',()=>{
  dialog.close();
  window.LifeSimsFamily?.open?.('room');
 }));
 const label=el('label','📷 Выбрать фотографию персонажа','cloud-upload');
 const file=document.createElement('input');file.type='file';file.accept='image/*';file.setAttribute('aria-label','Фото моего персонажа');
 file.addEventListener('change',async()=>{
  try{
   const photo=await photoToJpeg(file.files?.[0],256);
   if(!confirm('Отправить этот портрет в тестовую базу LifeSims?'))return;
   await request('/v1/me/avatar','PUT',{avatar:photo});
   session.account.avatar=photo;sessionStorage.setItem(SESSION,JSON.stringify(session));updateHeader();setStatus('Портрет сохранён в тестовом аккаунте.');
  }catch(e){setStatus('Портрет: '+e.message)}
 });
 label.append(file);body.append(label);
 body.append(btn('Удалить облачный портрет',async()=>{
  if(!confirm('Удалить портрет из облачного аккаунта?'))return;
  await request('/v1/me/avatar','PUT',{avatar:null});
  session.account.avatar=null;sessionStorage.setItem(SESSION,JSON.stringify(session));updateHeader();setStatus('Облачный портрет удалён.');
 }));
 body.append(el('p','Комната по фото может оставаться локальной. Для передачи между устройствами доступны отдельные действия:','cloud-muted'));
 body.append(btn('⬆ Загрузить локальную комнату в облако',async()=>{
  const room=await window.LifeSimsFamily?.exportRoom?.();
  if(!room?.image)return setStatus('В локальном профиле нет фотографии комнаты.');
  if(!confirm('Передать фотографию комнаты и расположение предметов на тестовый сервер?'))return;
  await request('/v1/me/room','PUT',{image:room.image,markers:room.markers||{}});
  setStatus('Комната скопирована в тестовое облако.');
 }));
 body.append(btn('⬇ Восстановить облачную комнату на устройстве',async()=>{
  const r=await request('/v1/me/room');
  if(!r.room?.image)return setStatus('В облаке нет комнаты.');
  if(!confirm('Заменить локальную фотографию комнаты фотографией из облака?'))return;
  const ok=await window.LifeSimsFamily?.importRoom?.(r.room);
  setStatus(ok?'Комната восстановлена. Открой «Моя комната» для просмотра.':'Не удалось восстановить комнату.');
 }));
}
function start(){
 dialog=document.createElement('dialog');dialog.id='cloudDialog';dialog.className='cloud-dialog';
 dialog.innerHTML='<header class="cloud-heading"><strong>👨‍👩‍👧 LifeSims · Семья</strong><button type="button" id="cloudClose" aria-label="Закрыть">×</button></header><div class="cloud-tabs" id="cloudNav"></div><div id="cloudBody"></div><p class="cloud-status" id="cloudStatus" role="status"></p>';
 document.body.append(dialog);
 dialog.querySelector('#cloudClose').onclick=()=>dialog.close();
 const top=document.querySelector('.topbar .stats');
 if(top){
  const single=btn('👨‍👩‍👧 Семья',open,'chip');
  single.id='familyOpen';single.setAttribute('aria-label','Семья: аккаунт и персонажи');
  top.prepend(single);
 }
 updateHeader();render();setStatus(status);
 if(session){load();if(session.account.role==='adult')refreshChildren()}
}
document.addEventListener('DOMContentLoaded',start);
})();
