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
 let selected=null;
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
  const value=Object.prototype.hasOwnProperty.call(event,'skillXp')?Number(event.skillXp):Number(event.xp);
  return Number.isFinite(value)?value:null;
 }
 function repeatLabel(a){
  if(a.repeat==='inbox')return 'Без срока';
  if(a.repeat==='daily')return 'Ежедневно';
  if(a.repeat==='weekly')return 'По дням недели';
  return 'Однократно';
 }
 function render(){
  if(!selected)return;
  const skill=bridge.scores().find(s=>s.name===selected);
  if(!skill){dialog.close();return}
  const data=bridge.read();
  const actions=data.activities.filter(a=>a?.skill===selected)
   .sort((a,b)=>(a.kind==='habit'?1:0)-(b.kind==='habit'?1:0)||String(a.name).localeCompare(String(b.name),'ru'));
  const history=skillEvents(selected,data);
  $('skillDetailTitle').textContent='↗ '+selected;
  const body=$('skillDetailBody');body.replaceChildren();
  const summary=make('div','skill-detail-summary');
  const stats=[
   ['Уровень',Math.floor(skill.score/100)+1],
   ['Текущий опыт',fmt.format(skill.score)+' XP'],
   ['Накоплено',fmt.format(skill.earned)+' XP'],
   ['Снижение от паузы','−'+fmt.format(skill.loss)+' XP'],
   ['До следующего уровня',fmt.format(100-(skill.score%100))+' XP'],
   ['Последняя практика',skill.last||'Нет записей'],
   ['Связанные действия',actions.length],
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
   'Начальные значения из прежних данных включены в итог, если они были импортированы. История показывает сохранённые выполнения; опыт навыка определяется на дату выполнения. После 14 дней без практики действует снижение на 1% в неделю.'));
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
  body.append(make('h4','','История практики'));
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
  if(!history.length)historyList.append(make('p','skill-detail-note','История практики пока отсутствует.'));
  body.append(historyList);
 }
 function open(name){
  if(typeof name!=='string'||!name.trim())return;
  selected=name;render();
  if(!dialog.open)dialog.showModal();
 }
 $('skillDetailClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{selected=null});
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
 });
 window.LifeSimsSkillDetail={open,refresh:()=>{if(dialog.open)render()}};
})();