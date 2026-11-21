(function moduleTaskPremium(){
 'use strict';
 const api=window.LifeSimsTaskBridge;if(!api)return;
 const $=id=>document.getElementById(id);
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n};
 const area=$('tasks');if(!area)return;
 const shell=el('div','life-premium');shell.id='premiumTaskUI';
 shell.innerHTML=`
 <div class="tp-head"><div><strong>Планировщик</strong><small>Входящие · проекты · приоритеты</small></div><button class="tp-minor" id="tpManage" type="button">⚙ Проекты и теги</button></div>
 <p id="tpWorkload" class="tp-note" aria-live="polite"></p>
 <div class="tp-tabs" role="tablist"><button type="button" data-tp-tab="list" class="active">☷ Дела</button><button type="button" data-tp-tab="matrix">⊞ Матрица Эйзенхауэра</button><button type="button" data-tp-tab="focus">◉ Помодоро</button></div>
 <section id="tpListView"><div class="tp-filters">
 <label>Показать<select id="tpScope"><option value="open">Активные</option><option value="inbox">Без срока</option><option value="today">Сегодня</option><option value="week">7 дней</option><option value="completed">Выполненные</option><option value="all">Все дела</option></select></label>
 <label>Проект<select id="tpProjectFilter"><option value="">Все</option></select></label>
 <label>Тег<select id="tpTagFilter"><option value="">Все</option></select></label>
 <label>Поиск<input id="tpSearch" type="search" placeholder="Найти дело"></label></div>
 <div id="tpTaskList"></div><button class="tp-primary" id="tpCreate" type="button">＋ Добавить дело</button></section>
 <section id="tpMatrixView" hidden><p class="tp-note">Срочность и важность можно менять при редактировании дела или прямо в матрице.</p><div id="tpMatrix" class="tp-matrix"></div><button class="tp-primary" id="tpMatrixCreate" type="button">＋ Добавить дело</button></section>
 <section id="tpFocusView" hidden><div id="tpFocusMount"></div></section>`;
 area.insertBefore(shell,area.querySelector('.card'));
 const legacy=area.querySelector('.card');if(legacy)legacy.classList.add('premium-hide-old');
 const manager=el('dialog','tp-dialog');manager.id='tpCatalog';
 manager.innerHTML=`<div class="tp-modal-top"><h3>Проекты и теги</h3><button id="tpCatalogClose" type="button" aria-label="Закрыть">×</button></div>
 <div class="tp-tabs"><button data-tp-catalog="project" class="active" type="button">Проекты</button><button data-tp-catalog="tag" type="button">Теги</button></div>
 <div id="tpCatalogItems"></div><form id="tpCatalogForm"><label>Новое название<input id="tpCatalogInput" required maxlength="65" placeholder="Например, Семья"></label><button class="tp-primary" type="submit">Добавить</button></form>
 <p class="tp-note">Удаление проекта или тега не удаляет сами дела и историю.</p>`;
 document.body.append(manager);
 let view='list',kind='project';
 const difficultyValue=a=>Number.isInteger(Number(a?.difficulty))&&Number(a.difficulty)>=1&&Number(a.difficulty)<=5?Number(a.difficulty):3;
 const resourceNames={resource:'◆ Ресурс',mood:'☺ Настроение',condition:'♥ Физическое состояние',hygiene:'♨ Гигиена',nutrition:'🍎 Питание',hunger:'🍽 Сытость',sleepNeed:'💤 Потребность во сне',entropy:'🌀 Энтропия',activity:'🚶 Активность'};
 const quadrants=[
  ['I','Срочно и важно','#fa6473'],
  ['II','Не срочно, но важно','#ffc24f'],
  ['III','Срочно, но не важно','#779cff'],
  ['IV','Не срочно и не важно','#4ed0a5']
 ];
 const quadrant=a=>a.urgent?(a.important?0:2):(a.important?1:3);
 const completed=a=>a.legacyDone||((a.repeat==='once'||a.repeat==='inbox')&&(a.completions||[]).length>0);
 const label=a=>a.repeat==='inbox'?'Без срока':a.repeat==='daily'?'Ежедневно':a.repeat==='weekly'?'По дням недели':a.dueDate||a.createdDate||'Без срока';
 const makeButton=(name,title,handler,cls='tp-minor')=>{const b=el('button',cls,name);b.type='button';b.setAttribute('aria-label',title);b.onclick=handler;return b};
 const sort=arr=>[...arr].sort((a,b)=>Number(completed(a))-Number(completed(b))||quadrant(a)-quadrant(b)||
  (Number(b.priority)||0)-(Number(a.priority)||0)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.name.localeCompare(b.name,'ru'));
 const collection=(name,entries,empty)=>{
  const select=$(name),last=select.value;select.replaceChildren();
  const none=el('option','',empty);none.value='';select.append(none);
  for(const item of entries){const o=el('option','',item.name);o.value=item.id;select.append(o)}
  select.value=[...select.options].some(x=>x.value===last)?last:'';
 };
 function makeRow(a,data,mat=false){
  const row=el('div','tp-task'+(completed(a)?' is-done':'')),done=completed(a);
  const check=makeButton(done?'✓':'○','Выполнить: '+a.name,()=>api.complete(a.id,api.today()),'tp-check');check.disabled=done;
  const info=el('div','tp-info');info.append(el('strong','',a.name));
  const project=data.taskProjects.find(p=>p.id===a.projectId)?.name;
  const tags=(a.tags||[]).map(id=>data.taskTags.find(x=>x.id===id)?.name).filter(Boolean).map(x=>'#'+x);
  const effect=a.resourceEffect,description=effect&&resourceNames[effect.target]?
   resourceNames[effect.target]+' '+(effect.mode==='set'?'→ '+effect.amount+'%':(effect.amount>=0?'+':'')+effect.amount+' п. п.'):'';
  const details=[label(a),project,...tags,'Сложность '+difficultyValue(a)+'/5',Number(a.priority)?'Приоритет '+a.priority:'',description].filter(Boolean);
  info.append(el('small','',details.join(' · ')));row.append(check,info);
  if(mat){
   const select=el('select','tp-quadrant-switch');select.setAttribute('aria-label','Переместить '+a.name);
   quadrants.forEach(([index,title],i)=>{const o=el('option','',index+'. '+title);o.value=String(i);select.append(o)});
   select.value=String(quadrant(a));
   select.onchange=()=>api.patch(a.id,{urgent:[0,2].includes(Number(select.value)),important:[0,1].includes(Number(select.value))});
   row.append(select);
  }
  row.append(makeButton('✎','Редактировать '+a.name,()=>api.edit(a.id)));return row;
 }
 function filtered(data){
  const scope=$('tpScope').value,project=$('tpProjectFilter').value,tag=$('tpTagFilter').value,
   search=$('tpSearch').value.trim().toLocaleLowerCase('ru'),today=api.today(),until=api.dateAdd(today,6);
  return sort(data.activities.filter(a=>{
   if(!a||a.kind==='habit'||a.legacyDone)return false;
   if(project&&a.projectId!==project)return false;
   if(tag&&!(a.tags||[]).includes(tag))return false;
   if(search&&!a.name.toLocaleLowerCase('ru').includes(search))return false;
   if(scope==='open'&&completed(a)||scope==='completed'&&!completed(a))return false;
   if(scope==='inbox'&&a.repeat!=='inbox')return false;
   if(scope==='today'&&!(a.repeat==='inbox'||api.due(a.id,today)))return false;
   if(scope==='week'&&!(a.repeat==='inbox'||a.repeat==='daily'||a.repeat==='weekly'||(a.dueDate||a.createdDate||'9999')<=until))return false;
   return true;
  }));
 }
 function renderList(data){
  const target=$('tpTaskList');target.replaceChildren();
  const list=filtered(data);
  if(!list.length)target.append(el('p','tp-note','Нет дел по выбранным фильтрам.'));
  for(const a of list)target.append(makeRow(a,data));
 }
 function renderMatrix(data){
  const target=$('tpMatrix');target.replaceChildren();
  const tasks=sort(data.activities.filter(a=>a&&a.kind==='task'&&!a.legacyDone&&!completed(a)));
  quadrants.forEach(([roman,name,color],i)=>{
   const box=el('section','tp-quadrant');box.style.setProperty('--q-color',color);
   const title=el('h4','',roman+'  '+name);title.append(el('span','tp-count',String(tasks.filter(a=>quadrant(a)===i).length)));
   const content=el('div','tp-quadrant-content');
   const items=tasks.filter(a=>quadrant(a)===i);
   if(!items.length)content.append(el('p','tp-note','Нет дел'));
   items.forEach(a=>content.append(makeRow(a,data,true)));
   box.append(title,content);target.append(box);
  });
 }
 function renderCatalog(){
  const state=api.read(),items=kind==='project'?state.taskProjects:state.taskTags,body=$('tpCatalogItems');body.replaceChildren();
  manager.querySelectorAll('[data-tp-catalog]').forEach(b=>b.classList.toggle('active',b.dataset.tpCatalog===kind));
  if(!items.length)body.append(el('p','tp-note','Список пока пуст.'));
  items.forEach(item=>{
   const row=el('div','tp-catalog-row');row.append(el('strong','',item.name));
   row.append(makeButton('✎','Переименовать '+item.name,()=>{
    const next=prompt('Новое название',item.name);if(next!==null)api.catalog(kind,'rename',{id:item.id,name:next});
   }));
   row.append(makeButton('🗑','Удалить '+item.name,()=>{
    if(confirm('Удалить «'+item.name+'» из справочника?'))api.catalog(kind,'delete',{id:item.id});
   }));body.append(row);
  });
 }
 function openManager(tab='project'){kind=tab;renderCatalog();if(!manager.open)manager.showModal()}
 function injectEditor(){
  const form=$('taskForm'),before=$('taskObject')?.closest('label');if(!form||!before)return;
  const panel=el('fieldset','tp-editor');panel.id='tpEditor';
  panel.innerHTML=`<legend>Приоритеты и организация</legend><div class="tp-editor-grid">
  <label>Проект<select id="tpEditorProject"></select></label>
  <label>Приоритет<select id="tpEditorPriority"><option value="0">Нет</option><option value="1">Низкий</option><option value="2">Средний</option><option value="3">Высокий</option></select></label>
  <label class="tp-checkbox"><input type="checkbox" id="tpEditorUrgent"> Срочно</label>
  <label class="tp-checkbox"><input type="checkbox" id="tpEditorImportant"> Важно</label></div>
  <div class="tp-tags-title">Теги <button type="button" id="tpEditorManageTags" class="tp-minor">Управление</button></div>
  <div id="tpEditorTags" class="tp-tag-picks"></div>
  <p class="tp-note">Дела «Без срока» всегда остаются во входящих до выполнения. Дата начала не является сроком.</p>`;
  form.insertBefore(panel,before);
  const effort=el('fieldset','tp-editor tp-difficulty-editor');effort.id='tpDifficultyEditor';
  effort.innerHTML=`<legend>Сложность</legend><label>Уровень усилий<select id="tpDifficulty" aria-label="Сложность дела или привычки"><option value="1">1 · Очень легко</option><option value="2">2 · Легко</option><option value="3" selected>3 · Средне</option><option value="4">4 · Сложно</option><option value="5">5 · Очень сложно</option></select></label><p class="tp-note">Опыт связанного навыка = базовый XP × сложность / 3. Без привязанного навыка опыт не начисляется. Ресурс и потребности не меняются из-за сложности.</p>`;
  form.insertBefore(effort,before);
  const nature=el('fieldset','tp-editor tp-habit-nature');nature.id='tpHabitNature';
  nature.innerHTML='<legend>Тип привычки</legend><label class="tp-checkbox tp-negative-toggle">'+
   '<input type="checkbox" id="tpNegativeHabit"> Отрицательная привычка (отмечать красным)</label>'+
   '<p class="tp-note">Например, алкоголь. Положительные привычки отмечаются обычным цветом. Это не влияет на уже записанные выполнения.</p>';
  form.insertBefore(nature,before);
  const resource=el('fieldset','tp-editor tp-resource-editor');resource.id='tpResourceEditor';
  resource.innerHTML="<legend>⚡ Влияние дела или привычки на состояние</legend>\n<label>Какой показатель меняется<select id=\"tpEffectTarget\">\n<option value=\"\">Не влияет</option>\n<option value=\"resource\">◆ Общий ресурс (кристалл)</option>\n<option value=\"mood\">☺ Настроение</option>\n<option value=\"condition\">♥ Физическое состояние</option>\n<option value=\"hygiene\">♨ Гигиена</option>\n<option value=\"nutrition\">🍎 Питание</option>\n<option value=\"hunger\">🍽 Сытость</option>\n<option value=\"sleepNeed\">💤 Потребность во сне</option>\n<option value=\"entropy\">🌀 Энтропия / беспорядок</option>\n<option value=\"activity\">🚶 Активность (игровая)</option>\n</select></label>\n<div id=\"tpEffectFields\" hidden><div class=\"tp-editor-grid\">\n<label>Как изменить<select id=\"tpEffectMode\"><option value=\"delta\">Прибавить / вычесть</option><option value=\"set\">Установить значение</option></select></label>\n<label>На сколько, п. п.<input id=\"tpEffectAmount\" type=\"number\" min=\"-100\" max=\"100\" step=\"1\" value=\"10\" required></label>\n<label>Срок действия<select id=\"tpEffectHours\">\n<option value=\"0\">Только выбранный день</option>\n<option value=\"24\">24 часа</option>\n<option value=\"72\">72 часа</option>\n<option value=\"168\">7 дней</option>\n</select></label></div>\n<p class=\"tp-note\">«+15» добавляет 15 пунктов к игровой шкале. «Установить 100» действует как отдельное событие. Каждый повтор учитывается отдельно. Измерения Oura и ручные записи не изменяются; эффекты исчезают по окончании срока.</p></div>";
  form.insertBefore(resource,before);
  const target=$('tpEffectTarget'),mode=$('tpEffectMode'),amount=$('tpEffectAmount'),settings=$('tpEffectFields');
  const reflect=()=>{
   settings.hidden=!target.value;amount.disabled=!target.value;
   amount.min=mode.value==='set'?'0':'-100';amount.max='100';
   if(mode.value==='set'&&Number(amount.value)<0)amount.value='0';
  };
  target.onchange=reflect;mode.onchange=reflect;reflect();
  const repeat=$('taskRepeat');if(repeat&&!repeat.querySelector('[value="inbox"]')){
   const opt=el('option','','Без срока');opt.value='inbox';repeat.prepend(opt);
  }
  $('tpEditorManageTags').onclick=()=>openManager('tag');
  $('taskKind').addEventListener('change',e=>{
   panel.hidden=e.target.value==='habit';
   $('tpHabitNature').hidden=e.target.value!=='habit';
  });
 }
 function fillForm(a,formKind){
  const panel=$('tpEditor');if(!panel)return;
  const data=api.read(),project=$('tpEditorProject');project.replaceChildren();
  const no=el('option','','Без проекта');no.value='';project.append(no);
  for(const x of data.taskProjects){const opt=el('option','',x.name);opt.value=x.id;project.append(opt)}
  project.value=a?.projectId||'';
  $('tpEditorPriority').value=String(a?.priority||0);
  $('tpDifficulty').value=String(difficultyValue(a));
  $('tpEditorUrgent').checked=!!a?.urgent;
  $('tpEditorImportant').checked=!!a?.important;
  const choices=$('tpEditorTags');choices.replaceChildren();
  for(const x of data.taskTags){
   const label=el('label','tp-tag-choice'),check=el('input');check.type='checkbox';check.name='tpTagChoice';check.value=x.id;
   check.checked=(a?.tags||[]).includes(x.id);label.append(check,document.createTextNode(' #'+x.name));choices.append(label);
  }
  panel.hidden=formKind==='habit';
  $('tpHabitNature').hidden=formKind!=='habit';
  $('tpNegativeHabit').checked=a?.negative===true||
   (a?.negative!==false&&(Number(a?.xp)<0||String(a?.name||'').trim().toLocaleLowerCase('ru')==='алкоголь'));
  const effect=a?.resourceEffect||null;
  $('tpEffectTarget').value=effect?.target||'';
  $('tpEffectMode').value=effect?.mode==='set'?'set':'delta';
  $('tpEffectAmount').value=effect?.amount!=null&&Number.isFinite(Number(effect.amount))?String(effect.amount):'10';
  $('tpEffectHours').value=[0,24,72,168].includes(Number(effect?.hours))?String(effect.hours):'24';
  $('tpEffectTarget').onchange();
 }
 function readForm(){
  const resourceEffect=$('tpEffectTarget')?.value?{
   target:$('tpEffectTarget').value,mode:$('tpEffectMode').value,
   amount:Number($('tpEffectAmount').value),hours:Number($('tpEffectHours').value)
  }:null;
  const difficulty=difficultyValue({difficulty:$('tpDifficulty')?.value});
  if($('taskKind').value==='habit')return {resourceEffect,difficulty,negative:!!$('tpNegativeHabit').checked};
  if(!$('tpEditor')||$('tpEditor').hidden)return {resourceEffect,difficulty};
  return {resourceEffect,difficulty,projectId:$('tpEditorProject').value||null,
   priority:Number($('tpEditorPriority').value)||0,
   urgent:$('tpEditorUrgent').checked,important:$('tpEditorImportant').checked,
   tags:[...document.querySelectorAll('[name="tpTagChoice"]:checked')].map(x=>x.value)};
 }
 function renderEffort(data){
  const date=api.today();
  const dueToday=data.activities.filter(a=>a&&!a.legacyDone&&a.repeat!=='inbox'&&api.due(a.id,date));
  const planned=dueToday.reduce((sum,a)=>sum+difficultyValue(a),0);
  const done=dueToday.filter(a=>(a.completions||[]).some(c=>c?.date===date)).reduce((sum,a)=>sum+difficultyValue(a),0);
  $('tpWorkload').textContent='Сегодня: '+done+' из '+planned+' баллов сложности выполнено (запланированные дела и привычки).';
 }
 function render(){
  const data=api.read();
  renderEffort(data);
  collection('tpProjectFilter',data.taskProjects,'Все проекты');
  collection('tpTagFilter',data.taskTags,'Все теги');
  renderList(data);renderMatrix(data);
  for(const btn of shell.querySelectorAll('[data-tp-tab]'))btn.classList.toggle('active',btn.dataset.tpTab===view);
  $('tpListView').hidden=view!=='list';$('tpMatrixView').hidden=view!=='matrix';$('tpFocusView').hidden=view!=='focus';
  if(manager.open)renderCatalog();
 }
 injectEditor();
 shell.querySelectorAll('[data-tp-tab]').forEach(b=>b.onclick=()=>{view=b.dataset.tpTab;render()});
 for(const id of ['tpScope','tpProjectFilter','tpTagFilter'])$(id).addEventListener('change',()=>renderList(api.read()));
 $('tpSearch').addEventListener('input',()=>renderList(api.read()));
 $('tpManage').onclick=()=>openManager();
 $('tpCatalogClose').onclick=()=>manager.close();
 manager.querySelectorAll('[data-tp-catalog]').forEach(b=>b.onclick=()=>{kind=b.dataset.tpCatalog;renderCatalog()});
 $('tpCatalogForm').onsubmit=e=>{e.preventDefault();if(api.catalog(kind,'add',{name:$('tpCatalogInput').value}))$('tpCatalogInput').value=''};
 $('tpCreate').onclick=() =>api.create('task');
 $('tpMatrixCreate').onclick=() =>api.create('task');
 manager.addEventListener('click',e=>{if(e.target===manager)manager.close()});
 window.LifeSimsTaskPremium={render,fillForm,readForm};
 render();
})();