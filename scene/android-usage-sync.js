/* LifeSims local-only Android UsageStats sync.
   No remote upload and no raw browsing history. */
(()=>{'use strict';
const B=window.LifeSimsScreenTimeBridge,panel=document.getElementById('sfImport');
if(!B||!panel)return;
const KEY='lifesims-android-usage-pairing-v1',ENABLED='lifesims-android-usage-enabled-v1';
const HOST='http://127.0.0.1:18765',INTERVAL=15*60*1000;
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node};
const get=k=>{try{return localStorage.getItem(k)||''}catch(_){return ''}};
const set=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(_){return false}};
const section=el('section','ls-android-usage');
const title=el('h3','','📲 Автоматическая синхронизация Android');
const description=el('p','sf-hint','Работает без StayFree: установленный Android-компаньон читает экранное время с разрешения системы. LifeSims получает сводку при открытии и примерно каждые 15 минут, пока страница активна. Данные остаются на устройстве.');
section.append(title,description);
const guide=el('p','sf-hint','1. Установи компаньон LifeSims Screen Time на Android. 2. Разреши «Доступ к статистике использования». 3. Включи локальную передачу и скопируй код сопряжения. 4. Вставь код сюда один раз.');
section.append(guide);
const label=el('label','sf-label','Код сопряжения с Android');
const input=el('input');input.type='password';input.placeholder='Код из Android-компаньона';input.autocomplete='off';input.maxLength=180;
label.append(input);section.append(label);
const row=el('div','ls-android-row');
const save=el('button','secondary','Сохранить код');save.type='button';
const check=el('button','secondary','Проверить сейчас');check.type='button';
row.append(save,check);section.append(row);
const enableLabel=el('label','ls-android-enable'),toggle=el('input');toggle.type='checkbox';
enableLabel.append(toggle,el('span','','Автоматически обновлять при открытии LifeSims'));
section.append(enableLabel);
const status=el('p','sf-status','Компаньон не подключён.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');section.append(status);
const top=panel.querySelector('.sf-import-options');
if(top)panel.insertBefore(section,top);else panel.append(section);
let working=false,lastAttempt=0,lastCompleted=0;
function validToken(value){return /^[A-Za-z0-9_-]{32,180}$/.test(value)}
function setStatus(t,error=false){status.textContent=t;status.classList.toggle('error',error)}
const hasConsent=()=>get(ENABLED)==='1'&&validToken(get(KEY));
toggle.checked=get(ENABLED)==='1';
input.value=get(KEY);
save.onclick=()=>{
 const token=input.value.trim();
 if(!validToken(token)){setStatus('Код сопряжения некорректен. Скопируй полный код из компаньона.',true);return}
 if(!set(KEY,token)){setStatus('Не удалось сохранить код в этом браузере.',true);return}
 setStatus('Код сохранён локально. Проверяю соединение…');
 sync(true).catch(()=>{});
};
toggle.onchange=()=>{
 if(!set(ENABLED,toggle.checked?'1':'0')){setStatus('Нет доступа к локальным настройкам браузера.',true);toggle.checked=!toggle.checked;return}
 if(toggle.checked)sync(true).catch(()=>{});
 else setStatus('Автоматическая синхронизация приостановлена.');
};
check.onclick=()=>sync(true).catch(()=>{});
async function sync(force=false){
 if(working||document.hidden||!navigator.onLine)return;
 if(!force&&!hasConsent())return;
 const token=get(KEY);
 if(!validToken(token)){if(force)setStatus('Сначала скопируй код сопряжения из Android-компаньона.',true);return}
 const now=Date.now();
 if(!force&&now-lastAttempt<INTERVAL)return;
 lastAttempt=now;working=true;check.disabled=true;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),11000);
 try{
  const response=await fetch(HOST+'/v1/usage?days=7',{
   method:'GET',mode:'cors',cache:'no-store',credentials:'omit',
   headers:{'X-LifeSims-Key':token,'Accept':'application/json'},
   signal:controller.signal
  });
  if(response.status===401){setStatus('Код сопряжения не совпадает. Скопируй новый код из Android-компаньона.',true);return}
  if(response.status===403){setStatus('В Android-компаньоне не разрешён доступ к статистике использования.',true);return}
  if(!response.ok)throw Error('Android-компаньон: HTTP '+response.status);
  const payload=await response.json();
  if(payload?.version!==1||!Array.isArray(payload.records))throw Error('Неизвестный формат ответа компаньона');
  const device=String(payload.device||'Android').slice(0,100);
  if(payload.records.length>5000)throw Error('Слишком много записей');
  const newIcons=window.LifeSimsScreenTimeLinks?.importIcons?.(payload.icons)||0;
  const entries=payload.records.map(item=>({
   date:item.date,app:item.app,packageName:item.packageName,
   device,seconds:item.seconds,source:'android'
  }));
  if(entries.length){
   const result=B.commit(entries);
   if(!result.ok)throw Error(result.error||'Не удалось сохранить данные');
   if(result.added||result.updated||newIcons)B.refresh();
   setStatus('✓ Android синхронизирован · '+entries.length+' приложений/дат · '+result.added+' новых, '+result.updated+' обновлённых · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));
  }else{if(newIcons)B.refresh();setStatus('✓ Соединение работает. Данных об использовании приложений за 7 дней пока нет.');}
  lastCompleted=Date.now();
 }catch(err){
  const details=err?.name==='AbortError'?'превышено время ожидания':err.message||'соединение недоступно';
  setStatus('⚠ Нет связи с Android-компаньоном ('+details+'). Убедись, что он установлен, запущен и разрешён доступ к экранному времени.',true);
 }finally{clearTimeout(timeout);working=false;check.disabled=false}
}
window.LifeSimsAndroidUsageSync={sync,connected:()=>hasConsent(),lastSync:()=>lastCompleted};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(()=>{})});
window.addEventListener('focus',()=>sync().catch(()=>{}));
window.addEventListener('online',()=>sync().catch(()=>{}));
window.addEventListener('pageshow',()=>sync().catch(()=>{}));
setInterval(()=>sync().catch(()=>{}),60*1000);
if(hasConsent())sync().catch(()=>{});
})();
