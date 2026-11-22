/* LifeSims mood catalog (user-supplied Period Calendar references).
   Icons are accessible emoji approximations, not copied original artwork. */
(function(){
'use strict';
const bridge=window.LifeSimsMoodBridge;
if(!bridge)return;
const CATALOG=[["😪","Сонная",-1],["😞","Депрессивная",-2],["😢","Грустная",-2],["😡","Злая",-2],["😩","Несчастная",-2],["😍","Возбужденная",2],["😰","Стресс",-2],["👿","Плохая",-2],["🥰","Удовлетворенная",2],["🤢","Вымотанная",-2],["🤩","Вдохновленная",2],["🏠","Домашняя",1],["😶","Меланхоличная",-1],["😖","Замученная",-2],["😟","Напряженная",-2],["🥺","Обеспокоенная",-1],["😤","Сварливая",-2],["🤬","Разъяренная",-3],["🎭","Эмоциональная",0],["🚫","Незащищенная",-2],["🙂","Нормальная",0],["🤸","Подвижная",2],["😘","Сексуальная",1],["🥲","Одинокая",-2],["🙁","Расстроенная",-2],["😨","Тревожная",-2],["☀️","Счастливая",3],["😱","В панике",-3],["🤒","Больная",-2],["🥳","Ликующая",3],["😊","Довольная",2],["🤔","Забывчивая",-1],["😌","Спокойная",2],["😎","Уверенная",2],["🥰","Влюбленная",3],["😇","Добрая",2],["😐","Безразличная",-1],["😲","Взволнованная",1],["😏","Вредная",-1],["🐷","Глупая",-1],["😌","Гордая",2],["😠","Грубая",-1],["🙈","Застенчивая",-1],["🤗","Игривая",2],["✝️","Мирная",2],["😇","Невинная",1],["🥺","Недоверчивая",-1],["😝","Нейтральная",0],["🕑","Нетерпеливая",-1],["😮‍💨","Огорченная",-2],["😬","Ошеломленная",-1],["😎","Пафосная",1],["😟","Слабая",-2],["🤓","Работящая",1],["😒","Ревнивая",-2],["😏","Самоуверенная",1],["🕶️","Скрытная",0],["😕","Скучающая",-1],["😣","Смущенная",-1],["😳","Стыдливая",-1],["🕵️","Таинственная",0],["😮","Удивленная",1],["🥰","Флиртующая",2],["😜","Мечтательная",1]];
const BY_NAME=new Map(CATALOG.map(([icon,label,weight])=>[label,{icon,weight}]));
const mk=(tag,cls,text)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!=null)e.textContent=String(text);return e;
};
function show(date,root){
 if(!root)return;
 const current=bridge.read(date)||{};
 const selected=new Set(Array.isArray(current.tags)?current.tags.filter(x=>typeof x==='string'):[]);
 const section=mk('section','mood-picker-panel');
 section.setAttribute('aria-label','Отметки настроения');
 section.append(mk('h4','','😊 Настроения'));
 section.append(mk('p','hint','Можно выбрать несколько вариантов. При сохранении настроение рассчитывается по выбранным отметкам; ручная шкала остаётся доступной.'));
 const summary=mk('p','mood-picker-summary');
 const message=mk('p','mood-picker-feedback');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const recent=Array.isArray(current.recent)?current.recent.filter(x=>BY_NAME.has(x)):[],seen=new Set();
 const groups=[
  ['Недавние',recent.slice(0,8)],
  ['Все настроения',CATALOG.map(x=>x[1])]
 ];
 const containers=[];
 function pick(label){
  if(selected.has(label))selected.delete(label);else selected.add(label);
  repaint();
 }
 for(const [heading,labels] of groups){
  if(!labels.length)continue;
  const wrap=mk('section','mood-picker-group'),title=mk('h5','',heading),grid=mk('div','mood-picker-grid');
  wrap.append(title,grid);section.append(wrap);containers.push({grid,labels});
 }
 function repaint(){
  for(const {grid,labels} of containers){
   grid.replaceChildren();
   for(const label of labels){
    const row=BY_NAME.get(label);
    if(!row)continue;
    const active=selected.has(label),button=mk('button','mood-picker-option'+(active?' selected':''));
    button.type='button';button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',label+(active?', выбрано':''));
    button.append(mk('span','mood-picker-icon',row.icon),mk('span','mood-picker-label',label));
    button.addEventListener('click',()=>pick(label));grid.append(button);
   }
  }
  const known=[...selected].filter(t=>BY_NAME.has(t));
  const avg=known.length?known.reduce((n,label)=>n+BY_NAME.get(label).weight,0)/known.length:null;
  const score=avg===null?null:Math.max(0,Math.min(100,Math.round(50+avg*15)));
  summary.textContent=selected.size?
    'Выбрано: '+[...selected].join(', ')+(score==null?'':' · игровая оценка '+score+'%'):
    'Настроение не выбрано';
  section.dataset.estimatedScore=score==null?'':String(score);
 }
 const extra=Array.isArray(current.tags)?current.tags.filter(x=>!BY_NAME.has(x)):[];
 if(extra.length){
  const old=mk('div','mood-picker-existing');old.append(mk('h5','','Ранее записанные'));
  for(const label of extra){
   const b=mk('button','mood-picker-option'+(selected.has(label)?' selected':''));
   b.type='button';b.textContent=label;b.onclick=()=>pick(label);old.append(b);
  }
  section.append(old);
 }
 section.append(summary);
 const actions=mk('div','mood-picker-actions');
 const clear=mk('button','secondary','Очистить выбор'),save=mk('button','primary','Сохранить настроения');
 clear.type='button';save.type='button';
 clear.onclick=()=>{selected.clear();repaint()};
 save.onclick=()=>{
  const known=[...selected].filter(t=>BY_NAME.has(t));
  const score=known.length?Math.round(Math.max(0,Math.min(100,50+15*known.reduce((n,label)=>n+BY_NAME.get(label).weight,0)/known.length))):null;
  if(bridge.write(date,[...selected],score)){
   message.textContent='✓ Настроение сохранено за '+date;
   // Refresh live meter without replacing a currently edited selection.
   const dialog=root.closest('dialog');if(dialog?.open)dialog.close();
   // Only after an actual saved selection and only when the user chose "Больная".
   // The Health dialog asks for explicit confirmation; it never sets illness itself.
   if(selected.has('Больная'))window.LifeSimsHealth?.offerMoodIllness?.(date,[...selected]);
  }else message.textContent='Не удалось сохранить. Проверь локальное хранилище LifeSims.';
 };
 actions.append(clear,save);section.append(actions,message);
 root.append(section);repaint();
}
window.LifeSimsMoodPicker={show,count:CATALOG.length};
})();
