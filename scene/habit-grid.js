(function moduleHabitGrid(){
 'use strict';
 const api=window.LifeSimsTaskBridge;if(!api)return;
 const $=id=>document.getElementById(id);
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=String(txt);return n};
 const area=$('habits');if(!area)return;
 const shell=el('div','life-premium');shell.id='premiumHabitsUI';
 shell.innerHTML=`
 <div class="tp-head"><div><strong>История привычек</strong><small>Выполнения по дням · можно несколько раз</small></div></div>
 <div class="tp-habit-toolbar"><div class="tp-tabs"><button type="button" data-tp-habit="grid" class="active">▦ Таблица</button><button type="button" data-tp-habit="list">☷ Список</button></div>
 <div class="tp-week-arrows"><button id="tpHabitPrev" type="button" aria-label="На неделю назад">‹</button><span id="tpHabitRange"></span><button id="tpHabitNext" type="button" aria-label="На неделю вперёд">›</button></div></div>
 <div id="tpHabitGrid" class="tp-habit-scroll"></div><div id="tpHabitRows" hidden></div>
 <div class="tp-habit-footer"><button id="tpHabitCreate" type="button" class="tp-primary">＋ Новая привычка</button><button id="tpHabitBackdate" type="button" class="tp-minor">📅 За прошлую дату</button></div>`;
 area.insertBefore(shell,area.querySelector('.card'));
 const old=area.querySelector('.card');if(old)old.classList.add('premium-hide-old');
 const dialog=el('dialog','tp-dialog');dialog.id='tpHabitDayDialog';
 dialog.innerHTML=`<div class="tp-modal-top"><h3 id="tpHabitDayTitle">Привычка</h3><button id="tpHabitDayClose" type="button" aria-label="Закрыть">×</button></div>
 <p id="tpHabitDayCount" class="tp-note"></p><div class="tp-habit-actions">
 <button id="tpHabitDayAdd" class="tp-primary" type="button">＋ Записать выполнение</button>
 <button id="tpHabitDayRemove" class="tp-minor" type="button">− Убрать одно выполнение</button>
 <button id="tpHabitDayEdit" class="tp-minor" type="button">✎ Редактировать привычку</button></div>`;
 document.body.append(dialog);
 let view='grid',anchor=api.today(),active=null,activeDate=null;
 const shades=['#84d8c0','#77b5f6','#d1afff','#ffcf76','#ff9ba5'];
 const shade=text=>{let n=0;for(const c of text)n=(n*33+c.charCodeAt(0))|0;return shades[Math.abs(n)%shades.length]};
 // Existing negative-XP habits and the legacy “Алкоголь” entry are treated
 // as negative unless the user explicitly changes their classification.
 const difficultyValue=a=>Number.isInteger(Number(a?.difficulty))&&Number(a.difficulty)>=1&&Number(a.difficulty)<=5?Number(a.difficulty):3;
 const negative=habit=>habit.negative===true||
  (habit.negative!==false&&(Number(habit.xp)<0||String(habit.name||'').trim().toLocaleLowerCase('ru')==='алкоголь'));
 const openHabitEditor=habit=>{
  if(habit.id==='__coffee')return;
  if(dialog.open)dialog.close();
  api.edit(habit.id);
 };
 const weekday=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
 const count=(habit,date)=>habit.id==='__coffee'?api.coffeeCount(date):(habit.completions||[]).filter(x=>x.date===date).length;
 const button=(txt,fn,cls='tp-minor')=>{const x=el('button',cls,txt);x.type='button';x.onclick=fn;return x};
 const selectedDate=()=>activeDate||api.today();
 function openDay(habit,date){
  active=habit;activeDate=date;
  $('tpHabitDayTitle').textContent=habit.name;
  const n=count(habit,date);
  $('tpHabitDayCount').textContent=date+' · '+n+(n===1?' выполнение':' выполнений');
  $('tpHabitDayRemove').disabled=n===0;
  $('tpHabitDayEdit').hidden=habit.id==='__coffee';
  if(!dialog.open)dialog.showModal();
 }
 function render(){
  const d=$('topHabitsDate')?.value;
  if(d&&d!==anchor)anchor=d;
  if(anchor>api.today())anchor=api.today();
  const days=Array.from({length:7},(_,i)=>api.dateAdd(anchor,-i));
  $('tpHabitRange').textContent=days[6].slice(5)+' — '+days[0].slice(5);
  const saved=api.read();
  const habits=saved.activities.filter(x=>x&&x.kind==='habit'&&!x.legacyDone);
  habits.push({id:'__coffee',name:'Кофе',kind:'habit',completions:[]});
  const table=el('table','tp-habit-table'),header=el('thead'),headRow=el('tr');
  headRow.append(el('th','tp-habit-name','Привычка'));
  for(const date of days){const dt=new Date(date+'T12:00:00');headRow.append(el('th','',weekday[dt.getDay()]+'\n'+dt.getDate()))}
  header.append(headRow);table.append(header);
  const tbody=el('tbody');
  const list=$('tpHabitRows');list.replaceChildren();
  for(const habit of habits){
   const row=el('tr'),title=el('th','tp-habit-name');
   const bad=negative(habit);
   const dot=el('span','tp-habit-dot');dot.style.background=bad?'#fa6a77':shade(habit.name);
   const titleButton=button(habit.name,()=>openHabitEditor(habit),'tp-habit-edit-name');
   titleButton.title='Изменить привычку «'+habit.name+'»';
   titleButton.setAttribute('aria-label','Редактировать привычку '+habit.name);
   if(bad)titleButton.classList.add('negative');
   title.append(dot,titleButton);
   if(habit.id!=='__coffee')title.append(el('small','tp-habit-resource','Сложность '+difficultyValue(habit)+'/5'));
   if(habit.resourceEffect?.target){
    const related=el('small','tp-habit-resource','⚡ '+({
     mood:'Настроение',condition:'Физическое состояние',hygiene:'Гигиена',resource:'Ресурс',
     nutrition:'Питание',hunger:'Сытость',sleepNeed:'Сон',entropy:'Энтропия',activity:'Активность'
    }[habit.resourceEffect.target]||habit.resourceEffect.target));
    title.append(related);
   }
   row.append(title);
   for(const date of days){
    const n=count(habit,date),cell=el('td'),b=button(n>1?n+'×':n?'✓':'?',()=>openDay(habit,date),'tp-habit-day'+(n?' was-done':'')+(n&&bad?' is-negative':''));
    b.setAttribute('aria-label',habit.name+' · '+date+' · '+n+' выполнений');
    if(n)b.style.color=bad?'#ff7281':shade(habit.name);
    cell.append(b);row.append(cell);
   }
   tbody.append(row);
   const line=el('div','tp-task'+(bad?' tp-negative-habit':'')),info=el('div','tp-info'),name=el('strong','',habit.name),note=el('small','',days.reduce((sum,d)=>sum+count(habit,d),0)+' раз за неделю'+(habit.id==='__coffee'?'':' · сложность '+difficultyValue(habit)+'/5'));
   info.append(name,note);line.append(info);
   line.append(button('＋',()=>openDay(habit,anchor)));
   if(habit.id!=='__coffee')line.append(button('✎',()=>api.edit(habit.id)));
   list.append(line);
  }
  // Read-only measured/history metrics, as in the supplied habit-tracker reference.
  // Never invent a check-in or mark missing Oura readings as zero.
  const observed=document.createElement('tr');observed.className='tp-habit-subheading';
  const observedLabel=el('th','tp-habit-name','Показатели дня');observedLabel.colSpan=8;
  observed.append(observedLabel);tbody.append(observed);
  const metrics=[
   {name:'Шаги',get:d=>Number.isFinite(saved.days?.[d]?.steps)?
    saved.days[d].steps.toLocaleString('ru-RU'):'?'},
   {name:'Сон',get:d=>Number.isFinite(saved.days?.[d]?.sleepHours)?
    saved.days[d].sleepHours.toLocaleString('ru-RU',{maximumFractionDigits:1})+' ч':'?'},
   {name:'Readiness',get:d=>Number.isFinite(saved.days?.[d]?.ouraScores?.readiness)?
    saved.days[d].ouraScores.readiness+'%':'?'},
   {name:'Последний приём пищи',get:d=>{
    const meals=(saved.foodMeals||[]).filter(m=>m.date===d&&typeof m.time==='string');
    return meals.length?meals.map(m=>m.time).sort().pop():'?';
   }}
  ];
  for(const metric of metrics){
   const tr=el('tr','tp-habit-observed'),name=el('th','tp-habit-name');
   const dot=el('span','tp-habit-dot');dot.style.background=shade(metric.name);
   name.append(dot,document.createTextNode(metric.name));tr.append(name);
   for(const date of days){
    const td=el('td'),value=metric.get(date);
    const txt=el('span','tp-habit-readonly'+(value==='?'?' unknown':''),value);
    txt.title='Запись показателя за '+date;
    td.append(txt);tr.append(td);
   }
   tbody.append(tr);
  }
  table.append(tbody);
  $('tpHabitGrid').replaceChildren(table);
  $('tpHabitGrid').hidden=view!=='grid';list.hidden=view!=='list';
  for(const b of shell.querySelectorAll('[data-tp-habit]'))b.classList.toggle('active',b.dataset.tpHabit===view);
 }
 shell.querySelectorAll('[data-tp-habit]').forEach(b=>b.onclick=()=>{view=b.dataset.tpHabit;render()});
 $('tpHabitPrev').onclick=()=>{anchor=api.dateAdd(anchor,-7);$('topHabitsDate').value=anchor;render()};
 $('tpHabitNext').onclick=()=>{anchor=api.dateAdd(anchor,7);if(anchor>api.today())anchor=api.today();$('topHabitsDate').value=anchor;render()};
 $('tpHabitCreate').onclick=()=>api.create('habit');
 $('tpHabitBackdate').onclick=()=>api.backdate('__hair_wash',anchor);
 $('tpHabitDayClose').onclick=()=>dialog.close();
 $('tpHabitDayAdd').onclick=()=>{
  if(!active)return;
  if(active.id==='__coffee')api.coffeeAdd(selectedDate());else api.recordHabit(active.id,selectedDate());
  dialog.close();render();
 };
 $('tpHabitDayRemove').onclick=()=>{
  if(!active)return;
  if(active.id==='__coffee')api.coffeeUndo(selectedDate());else api.undoHabit(active.id,selectedDate());
  dialog.close();render();
 };
 $('tpHabitDayEdit').onclick=()=>{if(active)openHabitEditor(active)};
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 window.LifeSimsHabitGrid={render};
 render();
})();