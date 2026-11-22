/* LifeSims cycle and medication diary. No medical advice or contraceptive claims. */
(function(){
'use strict';
const B=window.LifeSimsHealthBridge, root=document.getElementById('lifesims-health-mount');
if(!B||!root)return;
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const format=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=d=>{const a=String(d).split('-').map(Number);return new Date(a[0],a[1]-1,a[2],12)};
const add=(d,n)=>{const x=parse(d);x.setDate(x.getDate()+n);return format(x)};
const diff=(a,b)=>Math.round((parse(b)-parse(a))/86400000);
const nowDay=()=>format(new Date());
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&format(parse(d))===d;
const dayLabel=d=>parse(d).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const uid=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2);
const SYMPTOM_OPTIONS=[
 ['🌡️','Боль внизу живота'],['💢','Боль в пояснице'],['🤕','Головная боль'],['💗','Боль в груди'],
 ['🫧','Вздутие'],['🤢','Тошнота'],['🪫','Усталость'],['🥱','Сонливость'],
 ['🍽️','Повышенный аппетит'],['💧','Отёчность'],['🪞','Акне'],['🌪️','Перепады настроения'],
 ['😣','Раздражительность'],['😴','Нарушение сна'],['🦵','Мышечная боль']
];
const MOOD_OPTIONS=[
 ['😌','Спокойствие'],['😊','Радость'],['😢','Грусть'],['😟','Тревога'],
 ['😠','Раздражение'],['⚡','Энергичность'],['😶','Апатия'],['🥹','Чувствительность']
];
const FLOWS={none:'Нет кровотечения',spotting:'Мажущие выделения',light:'Слабые',medium:'Умеренные',heavy:'Обильные'};
const CONTRACEPTIVE_TYPES=[['pill','Противозачаточные таблетки'],['ring','Контрацептивное кольцо'],['patch','Контрацептивный пластырь'],['injection','Контрацептивная инъекция']];
let date=nowDay(), month=date.slice(0,7), editingMed='', section='cycle', flash='',draftMood='',draftSymptoms=new Set(),showAllLegacy=false,legacyEdit=null;
function data(){
 const h=B.read()||{};
 return {
  cycleDays:h.cycleDays&&typeof h.cycleDays==='object'&&!Array.isArray(h.cycleDays)?h.cycleDays:{},
  medications:Array.isArray(h.medications)?h.medications:[],
  medicationLog:Array.isArray(h.medicationLog)?h.medicationLog:[],
  legacyMedicationEdits:h.legacyMedicationEdits&&typeof h.legacyMedicationEdits==='object'&&!Array.isArray(h.legacyMedicationEdits)?h.legacyMedicationEdits:{},
  settings:{cycleLength:28,periodLength:5,reminders:false,periodReminder:false,contraceptionEnabled:false,pmsLeadDays:7,dischargeEnabled:false,...(h.settings||{})}
 };
}
function change(fn){
 const state=data();fn(state);
 if(!B.write(state)){flash='Не удалось сохранить: проверь сохранения LifeSims.';render();return false}
 flash='✓ Записано в LifeSims';render();return true;
}
function el(tag,cls,textValue){
 const n=document.createElement(tag);if(cls)n.className=cls;if(textValue!=null)n.textContent=textValue;return n;
}
function button(label,fn,cls='secondary'){
 const n=el('button',cls,label);n.type='button';n.addEventListener('click',fn);return n;
}
function periods(h){
 const entries=Object.entries(h.cycleDays).filter(([d,v])=>validDay(d)&&v&&(v.cycleStart===true||['light','medium','heavy'].includes(v.flow))).map(([d])=>d).sort();
 const starts=[];for(const d of entries)if(!starts.length||diff(starts[starts.length-1],d)>0){
  const previous=entries[entries.indexOf(d)-1];if(!previous||diff(previous,d)>1)starts.push(d);
 }
 return starts;
}
function forecast(h){
 const starts=periods(h);
 const cycles=starts.slice(1).map((s,i)=>diff(starts[i],s)).filter(n=>n>=15&&n<=90);
 const sorted=[...cycles].sort((a,b)=>a-b);
 const mean=sorted.length?sorted[Math.floor(sorted.length/2)]:Math.max(15,Math.min(90,Number(h.settings.cycleLength)||28));
 const last=starts[starts.length-1];
 if(!last)return {starts,mean,cycles,expected:null,confidence:'нет записей'};
 if(diff(last,nowDay())>mean*2)return {starts,mean,cycles,expected:null,confidence:'старая дата, нужна новая отметка'};
 let expected=add(last,mean);
 while(expected<add(nowDay(),-5)&&diff(expected,nowDay())>mean/2)expected=add(expected,mean);
 return {starts,mean,cycles,expected,confidence:cycles.length>=2?'по истории':cycles.length?'мало истории':'по заданной длительности'};
}
function isScheduled(m,d){
 if(!m.active||m.startDate&&d<m.startDate||m.endDate&&d>m.endDate)return false;
 const days=Array.isArray(m.weekdays)?m.weekdays:[0,1,2,3,4,5,6];
 return days.includes(parse(d).getDay());
}
function legacyMeds(h,d){
 const raw=B.legacyMeds?.()?.[d];
 if(typeof raw!=='string'||!raw.trim())return [];
 return raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,80).map((line,index)=>{
  const id='legacy-meds:'+d+':'+index,edited=h.legacyMedicationEdits?.[id]||{};
  return {id,name:typeof edited.name==='string'&&edited.name.trim()?edited.name:line,
   dose:typeof edited.dose==='string'?edited.dose:'',archived:true,legacy:true,sourceDate:d,sourceLine:line};
 });
}
function slots(h,d){
 const map=new Map();
 for(const m of h.medications.filter(m=>isScheduled(m,d)))for(const time of (m.times||[]))
  map.set(m.id+'@'+time,{m,time,entry:null});
 for(const legacy of legacyMeds(h,d))map.set(legacy.id+'@--:--',{m:legacy,time:'--:--',entry:null});
 // Logged doses stay visible after schedule edits or medication deletion.
 for(const entry of h.medicationLog.filter(x=>x.date===d)){
  const over=h.legacyMedicationEdits?.[entry.medicationId]||{};
  const m=h.medications.find(x=>x.id===entry.medicationId)||
   {id:entry.medicationId,name:over.name||entry.medicationName||'Препарат из архива',
    dose:over.dose??entry.dose??'',archived:true,legacy:entry.medicationId.startsWith('legacy-meds:')};
  const key=m.id+'@'+entry.time;
  if(map.has(key))map.get(key).entry=entry;else map.set(key,{m,time:entry.time,entry});
 }
 return [...map.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.m.name.localeCompare(b.m.name,'ru'));
}
function copyYesterday(){
 if(date>nowDay()){flash='Нельзя переносить приёмы на будущую дату.';renderMessage();return}
 const d=date,prior=add(d,-1),old=slots(data(),prior);
 if(!old.length){flash='На предыдущий день лекарств нет.';renderMessage();return}
 let added=0;
 const saved=change(h=>{
  for(const s of old){
   const m=h.medications.find(x=>x.id===s.m.id);
   if(m&&!m.active)continue;
   if(slots(h,d).some(x=>(x.m.id===s.m.id||x.m.name===s.m.name)&&x.time===s.time))continue;
   const id=m?m.id:'legacy-copy:'+d+':'+s.m.id;
   h.medicationLog.push({id:uid(),medicationId:id,medicationName:s.m.name,
    dose:s.m.dose||'',date:d,time:s.time,status:'planned',recordedAt:new Date().toISOString()});
   added++;
  }
 });
 if(saved){flash=added?'Добавлено как вчера: '+added+'. Галочки не проставлены.':'Препараты уже есть в расписании.';renderMessage()}
}
function editLegacyMedication(m,d,time){
 legacyEdit={id:m.id,date:d,time};$('healthLegacyName').value=m.name;
 $('healthLegacyDose').value=m.dose||'';$('healthLegacyEditor').hidden=false;
 $('healthLegacyEditor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function saveLegacyMedication(e){
 e.preventDefault();if(!legacyEdit)return;
 const name=$('healthLegacyName').value.trim(),dose=$('healthLegacyDose').value.trim();
 if(!name){flash='Укажи название лекарства.';renderMessage();return}
 const target=legacyEdit;
 const saved=change(h=>{
  h.legacyMedicationEdits[target.id]={name,dose};
  const entry=h.medicationLog.find(x=>x.medicationId===target.id&&x.date===target.date&&x.time===target.time);
  if(entry){entry.medicationName=name;entry.dose=dose}
 });
 if(saved){legacyEdit=null;$('healthLegacyEditor').hidden=true}
}
function setMedicationStatus(m,d,time,status){
 if(d>nowDay()){flash='Нельзя заранее отмечать приём выполненным.';render();return}
 change(h=>{
  h.medicationLog=h.medicationLog.filter(x=>!(x.medicationId===m.id&&x.date===d&&x.time===time));
  if(status)h.medicationLog.push({id:uid(),medicationId:m.id,medicationName:m.name,dose:m.dose||'',date:d,time,status,recordedAt:new Date().toISOString()});
 });
}
function fillUi(){
 root.innerHTML=[
 '<div class="health-head"><div><h2>🌸 Дневник здоровья</h2><p>Цикл, лекарства, настроение и симптомы</p></div></div>',
 '<div class="health-switch"><button id="healthCycleTab" type="button">🌸 Цикл</button><button id="healthPillsTab" type="button">💊 Лекарства</button></div>',
 '<div id="healthNotice" class="health-notice" role="status" aria-live="polite"></div>',
 '<div id="healthCycleView">',
 '<div class="health-panel"><h3 id="healthCycleSummary">Менструация</h3><p id="healthForecastInfo" class="hint"></p><h3>Предполагаемое окно ПМС</h3><p id="healthPmsInfo" class="hint"></p><p class="health-warning">Прогнозы приблизительные. Календарь не определяет наличие ПМС. Прямая синхронизация цикла с Oura недоступна.</p></div>',
 '<div class="health-panel"><div class="health-month-head"><button id="healthPrevMonth" type="button" aria-label="Предыдущий месяц">‹</button><strong id="healthMonthLabel"></strong><button id="healthNextMonth" type="button" aria-label="Следующий месяц">›</button></div><div id="healthMonthGrid" class="health-calendar"></div><p class="health-legend">● менструация &nbsp; ◌ прогноз &nbsp; ◇ возможный ПМС</p></div>',
 '<form id="healthQuickStart" class="health-panel"><h3>Начало менструации</h3><label>Дата начала<input id="healthQuickDate" type="date" required></label><button type="submit" class="primary">Записать начало</button><button id="healthQuickRemove" type="button" class="secondary">Убрать отметку</button><p class="hint">Для прогноза достаточно дат начала месячных. Все прежние записи сохранены.</p></form>',
 '<form id="healthCycleForm" class="health-panel"><h3>😊 Настроение и симптомы</h3><label>Дата<input id="healthDate" type="date" required></label>',
 '<p class="health-group-title">Настроение · выбери одно</p><div id="healthMoodChoices" class="health-choice-grid" role="group" aria-label="Настроение"></div>',
 '<p class="health-group-title">Симптомы · можно несколько</p><div id="healthSymptoms" class="health-choice-grid" role="group" aria-label="Симптомы"></div>',
 '<label>Заметка<textarea id="healthCycleNote" rows="2" maxlength="1000" placeholder="Что ещё отметить сегодня?"></textarea></label>',
 '<div id="healthDischargeFields" hidden><label>Характер выделений<select id="healthMucus"><option value="">Не отмечено</option><option value="dry">Нет, сухо</option><option value="sticky">Липкие</option><option value="creamy">Кремообразные</option><option value="watery">Водянистые</option><option value="eggwhite">Тягучие и прозрачные</option><option value="other">Другие</option></select></label></div>',
 '<div class="health-actions"><button type="submit" class="primary">Сохранить день</button><button id="healthDeleteCycle" type="button" class="secondary">Очистить настроение и симптомы</button></div></form>',
 '<details class="health-panel health-advanced"><summary>Настройки цикла</summary><form id="healthCycleSettings"><h3>Параметры прогноза</h3><label>Окно ПМС, за дней до месячных<input id="healthPmsLead" type="number" min="1" max="14" required></label><div class="health-cols"><label>Длина цикла, дней<input id="healthCycleLength" type="number" min="15" max="90" required></label><label>Менструация, дней<input id="healthPeriodLength" type="number" min="1" max="15" required></label></div><label class="health-inline"><input id="healthPeriodReminder" type="checkbox"> Напомнить за 2 дня до ожидаемого начала</label><label class="health-inline"><input id="healthDischargeEnabled" type="checkbox"> Включить учёт выделений и их характера</label><button type="submit" class="secondary">Сохранить</button></form></details>',
 '</div>',
 '<div id="healthPillsView" hidden>',
 '<div class="health-panel"><h3>💊 Таблетки по дням</h3><label>Дата<input id="healthPillsDate" type="date"></label><div class="health-actions"><button id="healthCopyYesterday" type="button" class="secondary">↺ Как вчера</button><button id="healthAddMedication" type="button" class="primary">+ Добавить лекарство</button></div><div id="healthTodaySlots" class="health-med-checklist"></div><p class="hint">Галочка означает фактический приём. Записи прошлых дней можно исправить.</p></div>',
 '<div class="health-panel" id="healthOldMedsPanel" hidden><h3>🗂️ Прежние записи лекарств</h3><p class="hint">Найдены в старом дневнике LifeSims. Исходный текст сохранён. Отметь принятые таблетки галочкой.</p><div id="healthOldMedsList"></div><button id="healthLegacyMore" type="button" class="secondary">Показать все прежние записи</button></div>',
 '<form id="healthLegacyEditor" class="health-panel health-legacy-form" hidden><h3>✎ Редактировать прежнее лекарство</h3><label>Название<input id="healthLegacyName" type="text" required maxlength="120"></label><label>Дозировка<input id="healthLegacyDose" type="text" maxlength="80" placeholder="Если известна"></label><div class="health-actions"><button type="submit" class="primary">Сохранить исправление</button><button id="healthLegacyCancel" type="button" class="secondary">Отмена</button></div></form>',
 '<div class="health-panel"><h3>Схема приёма</h3><div id="healthMedicationList"></div></div>',
 '<form id="healthMedicationForm" class="health-panel"><h3 id="healthMedicationTitle">Добавить препарат</h3>',
 '<label>Название<input id="healthMedName" type="text" maxlength="100" required autocomplete="off"></label>',
 '<div class="health-cols"><label>Доза (как назначено)<input id="healthMedDose" type="text" maxlength="65" placeholder="Например, 1 таблетка"></label><label>Время через запятую<input id="healthMedTimes" type="text" required placeholder="09:00, 21:00"></label></div>',
 '<label>Дни приёма<select id="healthMedRepeat"><option value="daily">Ежедневно</option><option value="weekdays">По будням</option><option value="custom">Выбранные дни недели</option></select></label>',
 '<fieldset id="healthMedDays" hidden><legend>Дни недели</legend><div class="health-chips"><label><input type="checkbox" value="1">Пн</label><label><input type="checkbox" value="2">Вт</label><label><input type="checkbox" value="3">Ср</label><label><input type="checkbox" value="4">Чт</label><label><input type="checkbox" value="5">Пт</label><label><input type="checkbox" value="6">Сб</label><label><input type="checkbox" value="0">Вс</label></div></fieldset>',
 '<label>Тип<select id="healthMedType"><option value="medication">Лекарство</option><option value="supplement">Витамины / добавки</option></select></label>',
 '<div class="health-cols"><label>Начало<input id="healthMedStart" type="date" required></label><label>Окончание (необязательно)<input id="healthMedEnd" type="date"></label></div>',
 '<label>Примечание<textarea id="healthMedNote" rows="2" maxlength="400"></textarea></label>',
 '<div class="health-actions"><button type="submit" class="primary">Сохранить препарат</button><button id="healthMedCancel" type="button" class="secondary">Очистить форму</button></div></form>',
 '<details class="health-panel health-advanced"><summary>Дополнительные настройки лекарств</summary><label class="health-inline"><input id="healthContraception" type="checkbox"> Показывать способы контрацепции</label><p class="hint">По умолчанию скрыты. При включении появятся дополнительные варианты в поле «Тип».</p></details>',
 '<div class="health-panel"><h3>Напоминания</h3><label class="health-inline"><input type="checkbox" id="healthReminders"> Напоминать о приёме таблеток</label><button id="healthNotifyPermission" type="button" class="secondary">Разрешить уведомления</button><p id="healthNotifyStatus" class="hint"></p><p class="hint">Веб-версия проверяет время только пока страница открыта. Для надёжных фоновых уведомлений потребуется Android-приложение или серверная push-система. Не меняй схему лечения на основании этого журнала.</p></div>',
 '<div class="health-panel"><h3>История приёма · 30 дней</h3><div id="healthAdherence"></div><div id="healthMedicationHistory"></div></div>',
 '</div>',
 '<div class="health-panel"><p class="hint">Данные сохраняются в локальном JSON LifeSims, включая резервные копии. Хранение в браузере не зашифровано отдельно: не используй общий телефон для чувствительных записей.</p></div>'
 ].join('');
 $('healthCycleTab').onclick=()=>{section='cycle';render()};
 $('healthPillsTab').onclick=()=>{section='pills';render()};
 $('healthPrevMonth').onclick=()=>{month=add(month+'-15',-31).slice(0,7);render()};
 $('healthNextMonth').onclick=()=>{month=add(month+'-15',31).slice(0,7);render()};
 $('healthDate').onchange=()=>{if(validDay($('healthDate').value)){date=$('healthDate').value;month=date.slice(0,7);render()}};
 $('healthPillsDate').onchange=()=>{if(validDay($('healthPillsDate').value)){date=$('healthPillsDate').value;month=date.slice(0,7);render()}};
 $('healthQuickStart').onsubmit=e=>{
  e.preventDefault();
  const d=$('healthQuickDate').value;
  if(!validDay(d)||d>nowDay()){flash='Выбери сегодняшнюю или прошедшую дату.';renderMessage();return}
  date=d;month=d.slice(0,7);
  change(h=>{h.cycleDays[d]={...(h.cycleDays[d]||{}),cycleStart:true}});
 };
 $('healthQuickRemove').onclick=()=>change(h=>{
  const d=$('healthQuickDate').value,v=h.cycleDays[d];if(!v)return;
  delete v.cycleStart;if(Object.keys(v).length===0)delete h.cycleDays[d];
 });
 $('healthCycleForm').onsubmit=saveCycle;
 $('healthDeleteCycle').onclick=()=>change(h=>{
  const v=h.cycleDays[date];if(!v)return;
  delete v.mood;delete v.symptoms;delete v.note;
  if(!Object.keys(v).length)delete h.cycleDays[date];
 });
 $('healthCycleSettings').onsubmit=e=>{e.preventDefault();change(h=>{h.settings.cycleLength=+$('healthCycleLength').value;h.settings.periodLength=+$('healthPeriodLength').value;h.settings.periodReminder=$('healthPeriodReminder').checked;h.settings.pmsLeadDays=+$('healthPmsLead').value;h.settings.dischargeEnabled=$('healthDischargeEnabled').checked})};
 $('healthMedRepeat').onchange=()=>{$('healthMedDays').hidden=$('healthMedRepeat').value!=='custom'};
 $('healthMedicationForm').onsubmit=saveMedication;
 $('healthCopyYesterday').onclick=copyYesterday;
 $('healthLegacyEditor').onsubmit=saveLegacyMedication;
 $('healthLegacyCancel').onclick=()=>{legacyEdit=null;$('healthLegacyEditor').hidden=true};
 $('healthLegacyMore').onclick=()=>{showAllLegacy=!showAllLegacy;renderMedications(data())};
 $('healthAddMedication').onclick=()=>{resetMedicationForm();$('healthMedicationForm').scrollIntoView({behavior:'smooth',block:'start'});$('healthMedName').focus()};
 $('healthMedCancel').onclick=resetMedicationForm;
 $('healthReminders').onchange=e=>change(h=>{h.settings.reminders=!!e.target.checked});
 $('healthContraception').onchange=e=>change(h=>{h.settings.contraceptionEnabled=!!e.target.checked});
 $('healthNotifyPermission').onclick=requestPermission;
}
function chooseMood(v){draftMood=draftMood===v?'':v;showChoices()}
function chooseSymptom(v){if(draftSymptoms.has(v))draftSymptoms.delete(v);else draftSymptoms.add(v);showChoices()}
function showChoices(){
 const moods=$('healthMoodChoices'),symptoms=$('healthSymptoms');
 moods.replaceChildren();symptoms.replaceChildren();
 for(const [emoji,name] of MOOD_OPTIONS){
  const selected=draftMood===name,b=button(emoji+' '+name,()=>chooseMood(name),'health-choice'+(selected?' chosen':''));
  b.setAttribute('aria-pressed',String(selected));moods.append(b);
 }
 for(const [emoji,name] of SYMPTOM_OPTIONS){
  const selected=draftSymptoms.has(name),b=button(emoji+' '+name,()=>chooseSymptom(name),'health-choice'+(selected?' chosen':''));
  b.setAttribute('aria-pressed',String(selected));symptoms.append(b);
 }
}
function saveCycle(e){
 e.preventDefault();const d=$('healthDate').value;
 if(!validDay(d)||d>nowDay()){flash='Выбери сегодняшнюю или прошедшую дату.';renderMessage();return}
 date=d;month=date.slice(0,7);
 change(h=>{
  const prev=h.cycleDays[d]||{};
  h.cycleDays[d]={...prev,mood:draftMood,symptoms:[...draftSymptoms],note:$('healthCycleNote').value.trim(),
    ...(h.settings.dischargeEnabled?{mucus:$('healthMucus').value}:{})};
 });
}
function setCycleFields(h){
 const v=h.cycleDays[date]||{};
 $('healthDate').value=date;
 draftMood=v.mood||'';draftSymptoms=new Set(Array.isArray(v.symptoms)?v.symptoms:[]);
 $('healthCycleNote').value=v.note||'';
 $('healthMucus').value=v.mucus||'';
 $('healthDischargeFields').hidden=!h.settings.dischargeEnabled;
 $('healthDischargeEnabled').checked=!!h.settings.dischargeEnabled;
 $('healthDeleteCycle').disabled=!v.mood&&!(v.symptoms?.length)&&!v.note;
 showChoices();
}
function renderCycle(h){
 const p=forecast(h);
 $('healthQuickDate').value=date;$('healthQuickRemove').disabled=!h.cycleDays[date]?.cycleStart;
 const pmsLead=Math.max(1,Math.min(14,Number(h.settings.pmsLeadDays)||7));
 $('healthPmsInfo').textContent=p.expected?('Возможное окно: '+dayLabel(add(p.expected,-pmsLead))+' — '+dayLabel(add(p.expected,-1))+' (за '+pmsLead+' дн. до месячных)'):'Для оценки нужны даты начала месячных';
 $('healthPmsLead').value=pmsLead;
 $('healthCycleSummary').textContent=p.starts.length?
  'Начало последней менструации: '+dayLabel(p.starts[p.starts.length-1]):'Начни отмечать менструацию в календаре';
 $('healthForecastInfo').textContent=p.expected?
  (p.expected<nowDay()?'Предполагаемое начало ожидалось: ':'Следующее предполагаемое начало: ')+dayLabel(p.expected)+' · средний цикл '+p.mean+' дн. · '+p.confidence:
  'Появится прогноз после записи хотя бы одной менструации';
 $('healthCycleLength').value=h.settings.cycleLength;
 $('healthPeriodLength').value=h.settings.periodLength;
 $('healthPeriodReminder').checked=!!h.settings.periodReminder;
 const first=month+'-01',start=parse(first),length=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
 const grid=$('healthMonthGrid');grid.replaceChildren();
 $('healthMonthLabel').textContent=start.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
 for(const w of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])grid.append(el('span','health-weekday',w));
 const offset=(start.getDay()+6)%7;for(let i=0;i<offset;i++)grid.append(el('span','health-blank',''));
 for(let i=1;i<=length;i++){
  const d=month+'-'+pad(i),v=h.cycleDays[d],bleed=!!(v&&(v.cycleStart||v.flow&&v.flow!=='none'));
  const pms=!!(p.expected&&d>=add(p.expected,-pmsLead)&&d<p.expected);
  const predicted=!bleed&&p.expected&&Array.from({length:h.settings.periodLength||5},(_,j)=>add(p.expected,j)).includes(d);
  const hasPills=slots(h,d).some(x=>x.entry?.status==='taken');
  const b=button(String(i),()=>{date=d;render()},'health-day'+(date===d?' selected':'')+(bleed?' bleeding':'')+(predicted?' predicted':'')+(pms?' pms':''));
  if(bleed)b.append(el('span','health-day-icon','●'));
  if(predicted)b.append(el('span','health-day-icon','◌'));
  if(pms)b.append(el('span','health-day-icon','◇'));
  if(hasPills)b.append(el('span','health-day-med','💊'));
  if(v?.mood)b.append(el('span','health-day-mood',(MOOD_OPTIONS.find(x=>x[1]===v.mood)||['🫶'])[0]));
  if(d===nowDay())b.classList.add('today');
  b.setAttribute('aria-label',d+(bleed?' менструация':'')+(predicted?' прогноз':'')+(pms?' предполагаемый ПМС':'')+(hasPills?' лекарство принято':''));
  grid.append(b);
 }
 setCycleFields(h);
}
function renderMedicationTypes(h){
 const select=$('healthMedType'),current=select.value;
 for(const opt of [...select.options])if(opt.dataset.optional==='contraception')opt.remove();
 const edited=h.medications.find(m=>m.id===editingMed);
 const allow=!!h.settings.contraceptionEnabled||CONTRACEPTIVE_TYPES.some(([type])=>type===edited?.type);
 if(allow)for(const [value,label] of CONTRACEPTIVE_TYPES){
  const option=document.createElement('option');option.value=value;option.textContent=label;option.dataset.optional='contraception';select.append(option);
 }
 select.value=[...select.options].some(o=>o.value===current)?current:'medication';
}
function resetMedicationForm(){
 editingMed='';$('healthMedicationForm').reset();renderMedicationTypes(data());$('healthMedStart').value=nowDay();
 $('healthMedDays').hidden=true;$('healthMedicationTitle').textContent='Добавить препарат';
}
function editMedication(m){
 editingMed=m.id;renderMedicationTypes(data());$('healthMedicationTitle').textContent='Изменить: '+m.name;
 $('healthMedName').value=m.name||'';$('healthMedDose').value=m.dose||'';
 $('healthMedType').value=m.type||'medication';
 $('healthMedTimes').value=(m.times||[]).join(', ');
 const w=Array.isArray(m.weekdays)?m.weekdays:[0,1,2,3,4,5,6];
 const all=w.length===7,weekday=w.length===5&&[1,2,3,4,5].every(d=>w.includes(d));
 $('healthMedRepeat').value=all?'daily':weekday?'weekdays':'custom';$('healthMedDays').hidden=all||weekday;
 for(const cb of $('healthMedDays').querySelectorAll('input'))cb.checked=w.includes(Number(cb.value));
 $('healthMedStart').value=m.startDate||nowDay();$('healthMedEnd').value=m.endDate||'';
 $('healthMedNote').value=m.note||'';$('healthMedicationForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function saveMedication(e){
 e.preventDefault();
 const name=$('healthMedName').value.trim(),times=[...new Set($('healthMedTimes').value.split(/[,\s;]+/).map(t=>t.trim()).filter(Boolean))].sort();
 const rep=$('healthMedRepeat').value;
 let weekdays=rep==='daily'?[0,1,2,3,4,5,6]:rep==='weekdays'?[1,2,3,4,5]:
 [...$('healthMedDays').querySelectorAll('input:checked')].map(x=>Number(x.value));
 const startDate=$('healthMedStart').value,endDate=$('healthMedEnd').value;
 if(!name||!times.length||times.length>8||times.some(t=>!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t))||!weekdays.length||!validDay(startDate)||endDate&&( !validDay(endDate)||endDate<startDate)){
  flash='Проверь время в формате ЧЧ:ММ, дни недели и даты лечения.';renderMessage();return;
 }
 const med={id:editingMed||uid(),name,type:$('healthMedType').value,dose:$('healthMedDose').value.trim(),times,weekdays,
 startDate,endDate:endDate||null,note:$('healthMedNote').value.trim(),active:true};
 if(change(h=>{
  const i=h.medications.findIndex(x=>x.id===med.id);
  if(i>=0)h.medications[i]={...h.medications[i],...med,active:h.medications[i].active};else h.medications.push(med);
 }))resetMedicationForm();
}
function renderMedicationList(h){
 const panel=$('healthMedicationList');panel.replaceChildren();
 if(!h.medications.length)panel.append(el('p','hint','Препараты пока не добавлены. Добавь название, дозу и расписание приёма.'));
 for(const m of h.medications){
  const item=el('div','health-med-row'),desc=el('div','health-med-info');
  desc.append(el('strong','',m.name+(m.dose?' · '+m.dose:'')));
  desc.append(el('small','',m.times.join(', ')+' · '+(m.active?'по расписанию':'приостановлено')+(m.note?' · '+m.note:'')));
  const controls=el('div','health-actions');
  controls.append(button('Изменить',()=>editMedication(m)));
  controls.append(button(m.active?'Пауза':'Возобновить',()=>change(state=>{state.medications.find(x=>x.id===m.id).active=!m.active})));
  controls.append(button('Удалить',()=>{
   if(!confirm('Удалить схему «'+m.name+'»? История отметок сохранится в архиве.'))return;
   change(state=>{state.medications=state.medications.filter(x=>x.id!==m.id)});
  },'secondary'));
  item.append(desc,controls);panel.append(item);
 }
}
function medicationSlotLine(s,d,compact=false){
 const row=el('div','health-dose-row health-dose-checkrow'),left=el('div','health-dose-main');
 const status=s.entry?.status||'',taken=status==='taken';
 const label=el('label','health-dose-checklabel'),cb=el('input','health-taken-check');
 cb.type='checkbox';cb.checked=taken;cb.disabled=d>nowDay();
 cb.setAttribute('aria-label','Принято: '+s.m.name+' '+s.time+' '+dayLabel(d));
 cb.addEventListener('change',()=>setMedicationStatus(s.m,d,s.time,cb.checked?'taken':(s.entry?'planned':null)));
 label.append(cb);
 const desc=el('span','health-dose-description');
 desc.append(el('strong','',s.m.name+((s.entry?.dose||s.m.dose)?' · '+(s.entry?.dose||s.m.dose):'')));
 desc.append(el('small','',(s.time==='--:--'?'время не записано':s.time)+' · '+(taken?'Принято':status==='skipped'?'Пропущено':status==='planned'?'Добавлено как вчера':'Не отмечено')));
 label.append(desc);left.append(label);row.append(left);
 if(!compact){
  const controls=el('div','health-dose-actions');
  if(!s.m.archived||s.m.legacy||s.m.id.startsWith('legacy-copy:')){
   const e=button('✎',()=>s.m.archived?editLegacyMedication(s.m,d,s.time):editMedication(s.m),'health-inline-edit');
   e.setAttribute('aria-label','Редактировать лекарство и дозировку '+s.m.name);controls.append(e);
  }
  if(d<=nowDay()&&status!=='skipped')controls.append(button('Пропуск',()=>setMedicationStatus(s.m,d,s.time,'skipped'),'health-inline-edit'));
  row.append(controls);
 }
 return row;
}
function renderMedications(h){
 $('healthPillsDate').value=date;$('healthReminders').checked=!!h.settings.reminders;
 $('healthContraception').checked=!!h.settings.contraceptionEnabled;renderMedicationTypes(h);
 const slotPanel=$('healthTodaySlots');slotPanel.replaceChildren();
 const todaySlots=slots(h,date);
 if(!todaySlots.length)slotPanel.append(el('p','hint','На эту дату приёмов нет. Добавь лекарство или перенеси список со вчера.'));
 for(const s of todaySlots)slotPanel.append(medicationSlotLine(s,date));
 renderMedicationList(h);
 const history=$('healthMedicationHistory');history.replaceChildren();
 // Show planned and unmarked historical doses as well as those already logged.
 const scheduled=[];
 for(let i=0;i<30;i++){const d=add(nowDay(),-i);scheduled.push(...slots(h,d).map(slot=>({...slot,date:d})))}
 const taken=scheduled.filter(x=>x.entry?.status==='taken').length;
 $('healthAdherence').textContent='По расписанию за 30 дней: '+taken+' принятых отметок из '+scheduled.length+' запланированных. Пропуски, которые не отмечены, не приравниваются к пропущенным дозам.';
 for(const dose of scheduled.filter(s=>s.date<nowDay()).slice(0,120)){
   const item=el('div','health-history-row');
   item.append(el('span','',dayLabel(dose.date)+' · '));
   item.append(medicationSlotLine(dose,dose.date,true));
   history.append(item);
  }
  if(!scheduled.some(x=>x.date<nowDay()))history.append(el('p','hint','В истории пока нет запланированных или записанных приёмов.'));
 if(!('Notification' in window))$('healthNotifyStatus').textContent='Уведомления недоступны в этом браузере. Используй журнал приёмов.';
 else $('healthNotifyStatus').textContent='Разрешение браузера: '+(Notification.permission==='granted'?'предоставлено':Notification.permission==='denied'?'запрещено':'не запрашивалось')+'. Надёжной фоновой доставки нет.';
}
function renderMessage(){const out=$('healthNotice');if(out)out.textContent=flash}
function render(){
 const h=data();
 $('healthCycleView').hidden=section!=='cycle';$('healthPillsView').hidden=section!=='pills';
 $('healthCycleTab').classList.toggle('active',section==='cycle');$('healthPillsTab').classList.toggle('active',section==='pills');
 renderCycle(h);renderMedications(h);renderMessage();
}
async function requestPermission(){
 if(!('Notification' in window)){flash='Уведомления не поддерживаются.';renderMessage();return}
 try{const p=await Notification.requestPermission();flash=p==='granted'?'✓ Уведомления разрешены для открытой страницы.':'Уведомления не разрешены.';render()}
 catch(e){flash='Браузер не разрешил запрос уведомлений.';renderMessage()}
}
function checkReminders(){
 if(document.hidden||!('Notification' in window)||Notification.permission!=='granted')return;
 const h=data();if(!h.settings.reminders&&!h.settings.periodReminder)return;
 const d=nowDay(),now=new Date(),minutes=now.getHours()*60+now.getMinutes();
 if(h.settings.periodReminder){
  const next=forecast(h).expected;
  if(next&&diff(d,next)===2&&minutes>=9*60){
   const periodKey='lifesims-period-reminder-'+d;
   try{if(!sessionStorage.getItem(periodKey)){
    sessionStorage.setItem(periodKey,'1');
    new Notification('LifeSims · напоминание',{body:'Скоро запланированное событие календаря',tag:periodKey});
   }}catch(_){}
  }
 }
 if(!h.settings.reminders)return;
 for(const s of slots(h,d)){
  if(s.m.archived||!/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(s.time))continue;
  const [hh,mm]=s.time.split(':').map(Number),due=hh*60+mm;
  if(s.entry||minutes<due||minutes-due>119)continue;
  const key='lifesims-health-notified-'+s.m.id+'-'+d+'-'+s.time;
  try{if(sessionStorage.getItem(key))continue;sessionStorage.setItem(key,'1')}catch(_){}
  try{new Notification('LifeSims · напоминание',{body:'Пора отметить запланированный приём',tag:key})}catch(_){}
 }
}
function openAt(d,tab='cycle'){
 date=validDay(d)?d:nowDay();month=date.slice(0,7);section=tab;render();B.openHealthResource?.();
}
function appendAgenda(d,body){
 const h=data(),v=h.cycleDays[d],s=slots(h,d);
 if(!v&&!s.length)return;
 body.append(el('div','agenda-group-title','🌸 Здоровье и лекарства'));
 if(v){
  const tags=Array.isArray(v.symptoms)?v.symptoms.join(', '):'';
  const summary=v.cycleStart?'Начало менструации':(FLOWS[v.flow]||'Запись о цикле');
  body.append(button('🌸 '+summary+' · Изменить',()=>openAt(d,'cycle'),'health-agenda-link'));
 }
 for(const slot of s){const line=medicationSlotLine(slot,d);body.append(line)}
}
function appendHistory(d,panel){
 const h=data(),entry=h.cycleDays[d],entries=slots(h,d);
 let count=0;
 if(entry){
  const line=el('div','history-activity-line');
  const info=el('div','','🌸 Цикл: '+(entry.cycleStart?'Начало менструации':FLOWS[entry.flow]||'Нет кровотечения')+
   (entry.mood?' · '+entry.mood:'')+
   (entry.symptoms?.length?' · '+entry.symptoms.join(', '):''));
  line.append(info,button('Изменить',()=>openAt(d,'cycle')));
  panel.append(line);count++;
 }
 for(const s of entries){
  const line=el('div','history-activity-line'),status=s.entry?.status==='taken'?'✓ принято':
   s.entry?.status==='skipped'?'× пропущено':'запланировано';
  line.append(el('div','','💊 '+s.time+' · '+s.m.name+' · '+status),
   button('Открыть',()=>openAt(d,'pills')));
  panel.append(line);count++;
 }
 return count;
}
function markCalendar(container){
 const h=data(),buttons=container.querySelectorAll('.calendar button');
 for(const b of buttons){
  const d=(b.getAttribute('aria-label')||'').slice(0,10);if(!validDay(d))continue;
  const v=h.cycleDays[d],med=slots(h,d).some(x=>x.entry?.status==='taken');
  if(v?.cycleStart||v?.flow&&v.flow!=='none'||med){
   const tag=el('span','health-calendar-marker',(v?.cycleStart||v?.flow&&v.flow!=='none'?'🌸':'')+(med?'💊':''));
   tag.setAttribute('aria-hidden','true');b.append(tag);
  }
 }
}
window.LifeSimsHealth={render,openAt,appendAgenda,markCalendar,forecast};
fillUi();resetMedicationForm();render();
window.setInterval(checkReminders,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkReminders();render()}});
window.addEventListener('focus',checkReminders);
})();