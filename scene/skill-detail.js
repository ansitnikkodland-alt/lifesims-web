/* LifeSims v69: inspect saved skill progress and navigate linked activities. */
(function skillDetailsModule(){
 'use strict';
 const bridge=window.LifeSimsSkillBridge;
 if(!bridge)return;
 const fmt=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});
 const $=id=>document.getElementById(id);
 const make=(tag,cls,txt)=>{
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(txt!==undefined&&txt!==null)node.textContent=String(txt);
  return node;
 };
 const dialog=make('dialog','skill-detail-dialog');dialog.id='skillDetailDialog';
 dialog.setAttribute('aria-labelledby','skillDetailTitle');
 dialog.innerHTML='<div class="skill-detail-heading"><h3 id="skillDetailTitle"></h3><button id="skillDetailClose" type="button" aria-label="Закрыть">×</button></div><div id="skillDetailBody"></div>';
 document.body.append(dialog);
 let selected=null,linkDraft=null,keepPickerOpen=false;
 function skillEvents(name,data){
  const activities=new Map(data.activities.filter(a=>a?.id).map(a=>[a.id,a]));
  const defaults=new Map((data.defaults||[]).filter(a=>a?.id).map(a=>[a.id,a]));
  return data.events.filter(event=>{
   if(event?.kind!=='complete'||!event.date||event.date>bridge.today?.())return false;
   // Preserve the skill recorded on completion; never rewrite history after editing an activity.
   const savedSkill=Object.prototype.hasOwnProperty.call(event,'skill')?event.skill:(activities.get(event.activityId)?.skill||defaults.get(event.activityId)?.skill);
   return savedSkill===name;
  }).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.at||'').localeCompare(String(a.at||'')));
 }
 function skillPoints(event){
  const value=Object.prototype.hasOwnProperty.call(event,'points')?Number(event.points):Object.prototype.hasOwnProperty.call(event,'skillXp')?Number(event.skillXp):Number(event.xp);
  return Number.isFinite(value)?value:null;
 }
 function repeatLabel(a){
  if(a.repeat==='inbox')return 'Без срока';
  if(a.repeat==='daily')return 'Ежедневно';
  if(a.repeat==='weekly')return 'По дням недели';
  return 'Однократно';
 }
 // The picker links existing records in one transaction; it does not recreate records.
 function linkEditor(name,data){
  const activities=(data.activities||[]).filter(a=>a?.id&&!a.legacyDone);
  const events=(data.schedule||[]).filter(e=>e?.id);
  if(!linkDraft||linkDraft.skill!==name){
   linkDraft={skill:name,activityIds:new Set(activities.filter(a=>a.skill===name).map(a=>a.id)),
    eventIds:new Set(events.filter(e=>e.skill===name).map(e=>e.id)),
    expectedActivities:Object.fromEntries(activities.map(a=>[a.id,a.skill||null])),
    expectedEvents:Object.fromEntries(events.map(e=>[e.id,e.skill||null])),
    query:'',open:keepPickerOpen};
  }
  keepPickerOpen=false;
  const picker=make('details','skill-existing-picker');picker.id='skillLinkPicker';
  picker.open=linkDraft.open;
  picker.append(make('summary','skill-existing-toggle','🔗 Связать существующие дела, привычки и мероприятия'));
  const content=make('div','skill-existing-content');
  content.append(make('p','skill-detail-note',
   'Выбирай уже созданные записи. Одно дело, привычка или мероприятие может относиться к одному навыку: новый выбор перенесёт связь с другого навыка. История выполнений и прежние XP сохраняются.'));
  const query=make('input','skill-existing-search');query.type='search';query.id='skillExistingSearch';
  query.placeholder='Поиск по названию';query.autocomplete='off';query.value=linkDraft.query;
  query.setAttribute('aria-label','Найти существующее дело, привычку или мероприятие');
  content.append(query);
  const allRows=[];
  function renderGroup(title,items,key){
   const section=make('section','skill-existing-group'),heading=make('h5','',title+' ('+items.length+')');
   section.append(heading);
   if(!items.length){section.append(make('p','skill-detail-note','Пока нет записей.'));content.append(section);return}
   const list=make('div','skill-existing-options');
   for(const entry of items.slice().sort((a,b)=>String(a.name||a.title).localeCompare(String(b.name||b.title),'ru'))){
    const row=make('label','skill-existing-row');
    const input=make('input');input.type='checkbox';
    input.checked=(key==='eventIds'?linkDraft.eventIds:linkDraft.activityIds).has(entry.id);
    const info=make('span','skill-existing-info'),titleText=make('strong','',entry.name||entry.title);
    const current=entry.skill&&entry.skill!==name?'Сейчас: ↗ '+entry.skill:
     entry.skill===name?'Сейчас связан с этим навыком':'Без навыка';
    const extra=key==='eventIds'&&Object.values(entry.overrides||{}).some(o=>o?.skill===name)&&entry.skill!==name
     ?' · Отдельное повторение уже связано с этим навыком':'';
    const details=make('small','',current+extra);
    info.append(titleText,details);
    row.append(input,info);
    input.addEventListener('change',()=>{
     const chosen=key==='eventIds'?linkDraft.eventIds:linkDraft.activityIds;
     if(input.checked)chosen.add(entry.id);else chosen.delete(entry.id);
     updateCounter();
    });
    row.dataset.search=(entry.name||entry.title||'').toLocaleLowerCase('ru');
    allRows.push(row);list.append(row);
   }
   section.append(list);content.append(section);
  }
  renderGroup('☑ Дела',activities.filter(a=>a.kind!=='habit'),'activityIds');
  renderGroup('◇ Привычки',activities.filter(a=>a.kind==='habit'),'activityIds');
  renderGroup('📅 Мероприятия',events,'eventIds');
  const counter=make('p','skill-existing-count');
  const actions=make('div','skill-existing-buttons');
  const submit=make('button','skill-detail-edit','Сохранить связи'),reset=make('button','skill-detail-edit','Сбросить выбор');
  submit.type='button';reset.type='button';
  function updateCounter(){
   counter.textContent='Выбрано: '+linkDraft.activityIds.size+' дел и привычек, '+linkDraft.eventIds.size+' мероприятий';
  }
  function filter(){
   const q=linkDraft.query.trim().toLocaleLowerCase('ru');
   for(const row of allRows)row.hidden=!!q&&!row.dataset.search.includes(q);
  }
  query.addEventListener('input',()=>{linkDraft.query=query.value;filter()});
  reset.addEventListener('click',()=>{
   linkDraft=null;keepPickerOpen=true;render();
  });
  const status=make('p','skill-existing-status');status.id='skillLinkStatus';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  submit.addEventListener('click',()=>{
   const latest=bridge.read();
   const chosenActivities=latest.activities.filter(a=>a&&!a.legacyDone&&linkDraft.activityIds.has(a.id));
   const chosenEvents=(latest.schedule||[]).filter(e=>e&&linkDraft.eventIds.has(e.id));
   const moved=[...chosenActivities,...chosenEvents].filter(a=>a.skill&&a.skill!==name);
   if(moved.length){
    const preview=moved.slice(0,4).map(a=>'«'+(a.name||a.title)+'» ('+a.skill+')').join(', ');
    const warning='Перенести '+moved.length+' записей с других навыков на «'+name+'»? '+
      preview+(moved.length>4?' и ещё '+(moved.length-4):'')+
      '. Ранее полученный опыт останется за прежними навыками.';
    if(!window.confirm(warning))return;
   }
   try{
    const request={activityIds:[...linkDraft.activityIds],eventIds:[...linkDraft.eventIds],
     expectedActivities:linkDraft.expectedActivities,expectedEvents:linkDraft.expectedEvents};
    // Preserve the open picker when the main app re-renders its metrics and skills.
    linkDraft=null;keepPickerOpen=true;
    const result=bridge.linkExisting(name,request);
    if(result.changed===0){render();$('skillLinkStatus').textContent='Изменений нет.'}
    else $('skillLinkStatus').textContent='✓ Сохранено связей: '+result.changed+
      ' (дел и привычек: '+result.activities+', мероприятий: '+result.events+').';
   }catch(error){
    // A changed calendar should never silently overwrite newer data.
    linkDraft=null;keepPickerOpen=true;render();
    $('skillLinkStatus').textContent='⚠ '+String(error?.message||'Не удалось сохранить связи');
   }
  });
  actions.append(submit,reset);
  content.append(counter,actions,status);picker.append(content);
  picker.addEventListener('toggle',()=>{if(linkDraft&&linkDraft.skill===name)linkDraft.open=picker.open});
  updateCounter();filter();
  return picker;
 }
 function render(){
  if(!selected)return;
  const skill=bridge.scores().find(s=>s.name===selected);
  if(!skill){dialog.close();return}
  const data=bridge.read();
  const actions=data.activities.filter(a=>a?.skill===selected)
   .sort((a,b)=>(a.kind==='habit'?1:0)-(b.kind==='habit'?1:0)||String(a.name).localeCompare(String(b.name),'ru'));
  const linkedEvents=(data.schedule||[]).filter(e=>e?.skill===selected||Object.values(e?.overrides||{}).some(o=>o?.skill===selected));
  const history=typeof bridge.history==='function'?bridge.history().filter(e=>{
   const activities=new Map(data.activities.filter(a=>a?.id).map(a=>[a.id,a]));
   const defaults=new Map((data.defaults||[]).filter(a=>a?.id).map(a=>[a.id,a]));
   const savedSkill=Object.prototype.hasOwnProperty.call(e,'skill')?e.skill:(activities.get(e.activityId)?.skill||defaults.get(e.activityId)?.skill);
   return savedSkill===selected;
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.at||'').localeCompare(String(a.at||''))):skillEvents(selected,data);
  $('skillDetailTitle').textContent='↗ '+selected;
  const body=$('skillDetailBody');body.replaceChildren();
  const summary=make('div','skill-detail-summary');
  const stats=[
   ['Уровень',Math.floor(skill.score/100)+1],
   ['Текущий опыт',fmt.format(skill.score)+' XP'],
   ['Накоплено',fmt.format(skill.earned)+' XP'],
   ['Снижение от паузы','−'+fmt.format(skill.loss)+' XP'],
   ['Снижение от отрицательных привычек','−'+fmt.format(skill.harm||0)+' XP'],
   ['До следующего уровня',fmt.format(100-(skill.score%100))+' XP'],
   ['Последняя практика',skill.last||'Нет записей'],
   ['Связанные действия',actions.length+linkedEvents.length],
   ['Связанные мероприятия',linkedEvents.length],
   ['Записанные выполнения',history.length]
  ];
  for(const [label,value] of stats){
   const card=make('div','skill-detail-stat');
   card.append(make('span','',label),make('strong','',value));summary.append(card);
  }
  body.append(summary);
  const bar=make('div','skill-detail-progress'),fill=make('b');
  fill.style.width=(skill.score%100)+'%';bar.append(fill);body.append(bar);
  body.append(make('p','skill-detail-note',
   'Начальные значения из прежних данных включены в итог. Положительные действия развивают навык, отрицательные привычки его снижают. Количество из таблицы привычек пересчитывает эффект без двойного учёта. После 14 дней без полезной практики действует снижение на 1% в неделю.'));
  body.append(linkEditor(selected,data));
  body.append(make('h4','','Связанные дела и привычки'));
  const list=make('div','skill-detail-actions');
  for(const activity of actions){
   const row=make('div','skill-detail-action'),info=make('div','skill-detail-action-info');
   info.append(make('strong','',(activity.kind==='habit'?'◇ Привычка':'☑ Дело')+' · '+activity.name));
   const completed=Array.isArray(activity.completions)?activity.completions.length:0;
   const n=Number(activity.difficulty),difficulty=Number.isInteger(n)&&n>=1&&n<=5?n:3;
   const xp=Number.isFinite(Number(activity.xp))?Number(activity.xp):0;
   const details=[repeatLabel(activity),'сложность '+difficulty+'/5','базовый XP '+xp,completed+' выполнений'];
   if(activity.legacyDone)details.push('архивное');
   if(activity.resourceEffect?.target)details.push('влияет на '+activity.resourceEffect.target);
   info.append(make('small','',details.join(' · ')));
   const btn=make('button','skill-detail-edit','Изменить');
   btn.type='button';btn.setAttribute('aria-label','Редактировать '+activity.name);
   btn.onclick=()=>{dialog.close();bridge.edit(activity.id)};
   row.append(info,btn);list.append(row);
  }
  if(!actions.length)list.append(make('p','skill-detail-note','Нет дел или привычек, привязанных к этому навыку.'));
  body.append(list);
  body.append(make('h4','','Связанные мероприятия'));
  const eventsList=make('div','skill-detail-actions');
  for(const event of linkedEvents){
   const row=make('div','skill-detail-action'),info=make('div','skill-detail-action-info');
   info.append(make('strong','','📅 '+event.title));
   const labels=[event.repeat&&event.repeat!=='none'?'Повторяющееся':'Однократное',
    event.location||'',event.skill===selected?'Навык: '+event.skill:'Навык указан в отдельном повторении'];
   if(event.linkedTaskId)labels.push('Связано с делом');
   if(event.linkedHabitId)labels.push('Связано с привычкой');
   info.append(make('small','',labels.filter(Boolean).join(' · ')));
   const button=make('button','skill-detail-edit','Изменить');
   button.type='button';button.onclick=()=>{dialog.close();bridge.editEvent?.(event.id)};
   row.append(info,button);eventsList.append(row);
  }
  if(!linkedEvents.length)eventsList.append(make('p','skill-detail-note','Нет мероприятий, привязанных к этому навыку.'));
  body.append(eventsList);
  const controls=make('div','skill-detail-create');
  for(const kind of ['task','habit']){
   const button=make('button','skill-detail-edit',kind==='task'?'＋ Дело':'＋ Привычка');
   button.type='button';
   button.onclick=()=>{
    const skillName=selected;
    dialog.close();bridge.create(kind);
    const input=$('taskSkill');if(input)input.value=skillName||'';
   };
   controls.append(button);
  }
  body.append(controls);
  body.append(make('h4','','История изменений навыка'));
  const historyList=make('div','skill-detail-history');
  for(const event of history){
   const row=make('div','skill-detail-history-row'),info=make('div');
   const tm=typeof event.at==='string'&&/T\d{2}:\d{2}/.test(event.at)?' · '+event.at.slice(11,16):'';
   info.append(make('strong','',event.name||'Выполненное действие'));
   info.append(make('small','',event.date+tm));
   const points=skillPoints(event);
   const pointsLabel=points==null?'XP не указаны':(points>0?'+':'')+fmt.format(points)+' XP';
   row.append(info,make('b','',pointsLabel));historyList.append(row);
  }
  if(!history.length)historyList.append(make('p','skill-detail-note','История изменений пока отсутствует.'));
  body.append(historyList);
 }
 function open(name){
  if(typeof name!=='string'||!name.trim())return;
  if(selected!==name)linkDraft=null;
  selected=name;render();
  if(!dialog.open)dialog.showModal();
 }
 $('skillDetailClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{selected=null;linkDraft=null;keepPickerOpen=false});
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
 });
 window.LifeSimsSkillDetail={open,refresh:()=>{if(dialog.open)render()}};
})();