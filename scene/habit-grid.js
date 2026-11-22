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
 <p id="tpHabitDayCount" class="tp-note"></p>
 <div class="tp-habit-quantity"><label id="tpHabitQuantityLabel" for="tpHabitQuantity">Количество за день</label><div class="tp-habit-quantity-actions"><input id="tpHabitQuantity" type="number" min="0" max="100000" step="any" inputmode="decimal"><button id="tpHabitDaySet" class="tp-minor" type="button">Сохранить значение</button></div></div>
 <div class="tp-habit-actions">
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
  if(dialog.open)dialog.close();
  api.edit(habit.id);
 };
 const weekday=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
 const count=(habit,date)=>api.habitAmount(habit.id,date);
 const has=(habit,date)=>api.habitHasAmount(habit.id,date);
 const unit=habit=>habit.habitUnit||'раз';
 const format=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
 const coffeeLimit=habit=>habit.habitGoal?.type==='max'&&habit.habitGoal.value!=null&&
  Number.isFinite(Number(habit.habitGoal.value))&&Number(habit.habitGoal.value)>=0?
  Number(habit.habitGoal.value):5;
 const normText=habit=>habit.id==='coffee_habit'?'не больше '+format(coffeeLimit(habit))+' '+unit(habit):
  habit.habitGoal?.type==='max'?'не больше '+format(habit.habitGoal.value)+' '+unit(habit):
  habit.habitGoal?.type==='min'?'не меньше '+format(habit.habitGoal.value)+' '+unit(habit):'';
 const badOn=(habit,date)=>{
  if(!has(habit,date))return false;
  const n=count(habit,date);
  if(habit.id==='coffee_habit')return n>coffeeLimit(habit);
  const goal=habit.habitGoal;
  if(goal&&['min','max'].includes(goal.type)&&Number.isFinite(Number(goal.value)))
   return goal.type==='max'?n>Number(goal.value):n<Number(goal.value);
  return negative(habit);
 };
 const button=(txt,fn,cls='tp-minor')=>{const x=el('button',cls,txt);x.type='button';x.onclick=fn;return x};
 const selectedDate=()=>activeDate||api.today();
 function openDay(habit,date){
  active=habit;activeDate=date;
  $('tpHabitDayTitle').textContent=habit.name;
  const n=count(habit,date);
  $('tpHabitDayCount').textContent=date+' · '+(has(habit,date)?format(n)+' '+unit(habit):'нет записи')+(normText(habit)?' · '+normText(habit)+(badOn(habit,date)?' · ❗ вне нормы':''):'');
  $('tpHabitDayRemove').disabled=api.habitHistoryCount(habit.id,date)===0||date>api.today();
  $('tpHabitDayAdd').disabled=date>api.today();
  $('tpHabitDaySet').disabled=date>api.today();
  $('tpHabitQuantityLabel').textContent=habit.habitQuestion||'Количество за день ('+unit(habit)+')';
  $('tpHabitQuantity').value=has(habit,date)?String(n):'';
  $('tpHabitDayEdit').hidden=false;
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
  // Coffee is now a persisted editable habit, backed by the original espresso-event history.
  const table=el('table','tp-habit-table'),header=el('thead'),headRow=el('tr');
  headRow.append(el('th','tp-habit-name','Привычка'));
  for(const date of days){const dt=new Date(date+'T12:00:00');headRow.append(el('th','',weekday[dt.getDay()]+'\n'+dt.getDate()))}
  header.append(headRow);table.append(header);
  const tbody=el('tbody');
  const list=$('tpHabitRows');list.replaceChildren();
  for(const habit of habits){
   const row=el('tr'),title=el('th','tp-habit-name');
   const bad=negative(habit)&&habit.id!=='coffee_habit';
   const dot=el('span','tp-habit-dot');dot.style.background=bad&&!habit.habitGoal?'#fa6a77':(/^#[\da-f]{6}$/i.test(habit.habitColor||'')?habit.habitColor:shade(habit.name));
   const titleButton=button(habit.name,()=>openHabitEditor(habit),'tp-habit-edit-name');
   titleButton.title='Изменить привычку «'+habit.name+'»';
   titleButton.setAttribute('aria-label','Редактировать привычку '+habit.name);
   if(bad)titleButton.classList.add('negative');
   title.append(dot,titleButton);
   title.append(el('small','tp-habit-resource','Сложность '+difficultyValue(habit)+'/5'+(normText(habit)?' · '+normText(habit):'')));
   if(habit.resourceEffect?.target){
    const related=el('small','tp-habit-resource','⚡ '+({
     mood:'Настроение',condition:'Физическое состояние',hygiene:'Гигиена',resource:'Ресурс',
     nutrition:'Питание',hunger:'Сытость',sleepNeed:'Сон',entropy:'Порядок',activity:'Активность'
    }[habit.resourceEffect.target]||habit.resourceEffect.target));
    title.append(related);
   }
   row.append(title);
   for(const date of days){
    const n=count(habit,date),recorded=has(habit,date),badToday=badOn(habit,date),cell=el('td');
    const label=recorded?(habit.habitGoal||habit.habitUnit||habit.id==='coffee_habit'?format(n):n>1?format(n)+'×':n?'✓':'0'):'?';
    const b=button(label,()=>openDay(habit,date),'tp-habit-day'+(recorded?' was-done':'')+(badToday?' is-negative':''));
    b.setAttribute('aria-label',habit.name+' · '+date+' · '+(recorded?format(n)+' '+unit(habit):'без записи')+(badToday?' · вне нормы':''));
    if(recorded)b.style.color=badToday?'#ff7281':(/^#[\da-f]{6}$/i.test(habit.habitColor||'')?habit.habitColor:shade(habit.name));
    cell.append(b);row.append(cell);
   }
   tbody.append(row);
   const line=el('div','tp-task'+(badOn(habit,anchor)?' tp-negative-habit':'')),info=el('div','tp-info'),name=el('strong','',habit.name),note=el('small','',days.reduce((sum,d)=>sum+count(habit,d),0)+' '+unit(habit)+' за неделю · сложность '+difficultyValue(habit)+'/5'+(normText(habit)?' · '+normText(habit):''));
   info.append(name,note);line.append(info);
   line.append(button('＋',()=>openDay(habit,anchor)));
   line.append(button('✎',()=>api.edit(habit.id)));
   list.append(line);
  }
  // Read-only measured/history metrics, as in the supplied habit-tracker reference.
  // Never invent a check-in or mark missing Oura readings as zero.
  const observed=document.createElement('tr');observed.className='tp-habit-subheading';
  const observedLabel=el('th','tp-habit-name','Показатели дня');observedLabel.colSpan=8;
  observed.append(observedLabel);tbody.append(observed);
  const lastMeal=date=>(saved.foodMeals||[]).filter(m=>m&&m.date===date&&/^\d{2}:\d{2}$/.test(m.time||''))
   .sort((a,b)=>String(a.time).localeCompare(String(b.time))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id||'').localeCompare(String(b.id||''))).at(-1)||null;
  const editLastMeal=date=>{
   const meal=lastMeal(date);if(!meal)return;
   if(typeof window.LifeSimsFood?.openDetailed==='function')window.LifeSimsFood.openDetailed(date,meal.id);
   else if(typeof window.LifeSimsFood?.open==='function')window.LifeSimsFood.open(date,meal.id);
  };
  const metrics=[
   {name:'Шаги',get:d=>Number.isFinite(saved.days?.[d]?.steps)?
    saved.days[d].steps.toLocaleString('ru-RU'):'?'},
   {name:'Сон',get:d=>Number.isFinite(saved.days?.[d]?.sleepHours)?
    saved.days[d].sleepHours.toLocaleString('ru-RU',{maximumFractionDigits:1})+' ч':'?'},
   {name:'Readiness',get:d=>Number.isFinite(saved.days?.[d]?.ouraScores?.readiness)?
    saved.days[d].ouraScores.readiness+'%':'?'},
   {name:'Последний приём пищи',meal:true,get:d=>lastMeal(d)?.time||'?'}
  ];
  for(const metric of metrics){
   const tr=el('tr','tp-habit-observed'),name=el('th','tp-habit-name');
   const dot=el('span','tp-habit-dot');dot.style.background=shade(metric.name);
   if(metric.meal){
    const label=el('button','tp-habit-metric-link',metric.name);label.type='button';
    label.setAttribute('aria-label','Редактировать последний приём пищи за '+anchor);
    label.onclick=()=>editLastMeal(anchor);
    name.append(dot,label);
   }else name.append(dot,document.createTextNode(metric.name));
   tr.append(name);
   for(const date of days){
    const td=el('td'),value=metric.get(date);
    if(metric.meal&&value!=='?'){
     const meal=lastMeal(date),btn=el('button','tp-habit-readonly tp-habit-meal-edit',value);
     btn.type='button';btn.title='Изменить: '+meal.title+' · '+date+' · '+meal.time;
     btn.setAttribute('aria-label','Редактировать '+meal.title+' за '+date+' в '+meal.time);
     btn.onclick=()=>editLastMeal(date);
     td.append(btn);
    }else{
     const txt=el('span','tp-habit-readonly'+(value==='?'?' unknown':''),value);
     txt.title='Запись показателя за '+date;td.append(txt);
    }
    tr.append(td);
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
  api.recordHabit(active.id,selectedDate());
  dialog.close();render();
 };
 $('tpHabitDayRemove').onclick=()=>{
  if(!active)return;
  api.undoHabit(active.id,selectedDate());
  dialog.close();render();
 };
 $('tpHabitDaySet').onclick=()=>{
  if(!active||$('tpHabitQuantity').value.trim()==='')return;
  if(api.setHabitAmount(active.id,selectedDate(),$('tpHabitQuantity').value)){dialog.close();render()}
 };
 $('tpHabitDayEdit').onclick=()=>{if(active)openHabitEditor(active)};
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 window.LifeSimsHabitGrid={render};
 render();
})();