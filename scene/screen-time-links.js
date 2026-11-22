/* LifeSims screen-time icon cache and persistent per-app associations.
   No source data is altered; no skill XP / task completion is awarded. */
(()=>{'use strict';
const B=window.LifeSimsScreenTimeBridge;
if(!B)return;
const CACHE_KEY='lifesims-android-app-icons-v1';
const $=(id)=>document.getElementById(id);
const el=(tag,cls,text)=>{
 const x=document.createElement(tag);if(cls)x.className=cls;
 if(text!==undefined)x.textContent=String(text);return x;
};
const button=(text,handler,cls)=>{
 const x=el('button',cls,text);x.type='button';x.addEventListener('click',handler);return x;
};
const safePng=x=>typeof x==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]{96,54000}$/.test(x);
let cache={};
try{
 const parsed=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
  for(const [pkg,image] of Object.entries(parsed)){
   if(/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/.test(pkg)&&safePng(image))
    cache[pkg]=image;
  }
 }
}catch(_){}
function importIcons(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return 0;
 let updates=0;
 for(const [pkg,image] of Object.entries(data).slice(0,140)){
  if(!/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/.test(pkg)||!safePng(image))continue;
  if(cache[pkg]!==image){cache[pkg]=image;updates++}
 }
 if(updates){
  try{
   const entries=Object.entries(cache);
   // An icon cache is optional; never risk overflowing the LifeSims progress store.
   while(entries.length&&JSON.stringify(Object.fromEntries(entries)).length>1_100_000)entries.shift();
   cache=Object.fromEntries(entries);
   localStorage.setItem(CACHE_KEY,JSON.stringify(cache));
  }catch(_){ /* App icons may be redrawn on next successful sync. */ }
 }
 return updates;
}
function icon(row){
 const name=String(row?.app||'Приложение');
 const pkg=String(row?.packageName||'');
 const node=el('span','sf-app-icon');
 node.setAttribute('aria-hidden','true');
 const image=cache[pkg];
 if(safePng(image)){
  const img=document.createElement('img');
  img.src=image;img.alt='';img.width=36;img.height=36;
  img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>{img.remove();node.textContent=name.slice(0,2).toUpperCase()});
  node.append(img);
 }else{
  // A real icon can be unavailable for a hidden/system package or CSV import.
  // Never invent a recognizable brand logo.
  node.textContent=(name.split(/\s+/).map(w=>w[0]).join('')||name).slice(0,2).toLocaleUpperCase('ru');
 }
 return node;
}
function selectField(parent,label,items,value,empty='— Не связывать —'){
 const wrap=el('label','sf-link-field',label),select=el('select');
 const opt=el('option','',empty);opt.value='';select.append(opt);
 const seen=new Set();
 for(const item of items){
  if(!item?.id||seen.has(item.id))continue;seen.add(item.id);
  const option=el('option','',item.name);option.value=item.id;select.append(option);
 }
 select.value=value||'';
 wrap.append(select);parent.append(wrap);
 return select;
}
const dialog=el('dialog','sf-link-dialog');dialog.id='sfLinkDialog';
const heading=el('h3','','Связать экранное время');
const sub=el('p','sf-hint');
const appHead=el('div','sf-link-app'),fields=el('div','sf-link-grid');
const explanation=el('p','sf-hint','Вся дневная длительность приложения будет отнесена к выбранным связям. Это учёт времени: выполнение дел и опыт навыков автоматически не начисляются.');
const feedback=el('p','sf-link-feedback');feedback.setAttribute('role','status');
const controls=el('div','sf-link-controls');
dialog.append(heading,appHead,sub,fields,explanation,feedback,controls);
document.body.append(dialog);
let active=null,inputs={};
function renderChoices(row){
 fields.replaceChildren();
 const existing=B.link(row),link=existing.link,opts=B.options(row.date);
 const asObjects=xs=>(xs||[]).map(name=>({id:name,name}));
 inputs.skill=selectField(fields,'Навык',asObjects(opts.skills),link.skill);
 inputs.activityId=selectField(fields,'Дело или привычка',(opts.activities||[]).map(x=>({id:x.id,name:(x.kind==='habit'?'◇ ':'☑ ')+x.name})),link.activityId);
 inputs.eventId=selectField(fields,'Мероприятие за выбранную дату',opts.events,link.eventId);
 inputs.projectId=selectField(fields,'Проект',opts.projects,link.projectId);
 inputs.tagId=selectField(fields,'Тег',opts.tags,link.tagId);
 const cats=['Работа','Учёба','Общение','Отдых','Развлечения','Быт','Здоровье','Другое'];
 inputs.category=selectField(fields,'Категория',asObjects(cats),link.category,'— Не указана —');
}
function open(row){
 active={...row};
 feedback.textContent='';
 appHead.replaceChildren();
 appHead.append(icon(row),el('strong','',row.app));
 sub.textContent='📅 '+row.date+' · '+Math.floor(row.seconds/60)+' мин · '+(row.source==='android'?'Android':'StayFree');
 renderChoices(row);
 controls.replaceChildren();
 controls.append(
  button('Сохранить по умолчанию',()=>save('default'),'primary'),
  button('Только на эту дату',()=>save('date'),'secondary'),
  button('Сбросить для даты',()=>save('clear-date'),'secondary'),
  button('Удалить правило',()=>save('clear-default'),'secondary'),
  button('Закрыть',()=>dialog.close(),'secondary')
 );
 if(!dialog.open)dialog.showModal();
}
function save(scope){
 if(!active)return;
 const link=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]));
 const result=B.saveLink(active,link,scope);
 if(!result?.ok){feedback.textContent='⚠ '+(result?.error||'Не удалось сохранить связь');return}
 dialog.close();
 if(scope==='default')window.LifeSimsToast?.('✓ Связь сохранена для всех будущих синхронизаций');
}
function label(row){return B.label(row)}
function statsForSkill(skill,day){
 // Data from the active (preferred Android / otherwise CSV) source per date.
 let total=0;
 for(let i=0;i<7;i++){
  const date=dayOffset(day,-i);
  const rows=(B.read(date)||[]),android=rows.filter(x=>x.source==='android');
  const chosen=android.length?android:rows.filter(x=>x.source==='stayfree');
  for(const row of chosen)if(B.link(row).link.skill===skill)total+=row.seconds;
 }
 return total;
}
function dayOffset(day,offset){
 const x=new Date(day+'T12:00:00');x.setDate(x.getDate()+offset);
 return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
}
window.LifeSimsScreenTimeLinks={open,icon,importIcons,label,statsForSkill};
})();
