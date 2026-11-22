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
const SYMPTOMS=['Боль внизу живота','Боль в груди','Головная боль','Вздутие','Тошнота','Усталость','Акне','Перепады настроения','Боль в пояснице','Отёчность','Повышенный аппетит','Раздражительность','Сонливость'];
const MOODS=['','Спокойствие','Радость','Грусть','Тревога','Раздражение','Энергичность','Апатия'];
const FLOWS={none:'Нет кровотечения',spotting:'Мажущие выделения',light:'Слабые',medium:'Умеренные',heavy:'Обильные'};
const CONTRACEPTIVE_TYPES=[['pill','Противозачаточные таблетки'],['ring','Контрацептивное кольцо'],['patch','Контрацептивный пластырь'],['injection','Контрацептивная инъекция']];
let date=nowDay(), month=date.slice(0,7), editingMed='', section='cycle', flash='';
function data(){
 const h=B.read()||{};
 return {
  cycleDays:h.cycleDays&&typeof h.cycleDays==='object'&&!Array.isArray(h.cycleDays)?h.cycleDays:{},
  medications:Array.isArray(h.medications)?h.medications:[],
  medicationLog:Array.isArray(h.medicationLog)?h.medicationLog:[],
  settings:{cycleLength:28,periodLength:5,reminders:false,periodReminder:false,contraceptionEnabled:false,...(h.settings||{})}
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
 const entries=Object.entries(h.cycleDays).filter(([d,v])=>validDay(d)&&v&&['light','medium','heavy'].includes(v.flow)).map(([d])=>d).sort();
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
 let expected=add(last,mean);
 while(expected<add(nowDay(),-5)&&diff(expected,nowDay())>mean/2)expected=add(expected,mean);
 return {starts,mean,cycles,expected,confidence:cycles.length>=2?'по истории':cycles.length?'мало истории':'по заданной длительности'};
}
function isScheduled(m,d){
 if(!m.active||m.startDate&&d<m.startDate||m.endDate&&d>m.endDate)return false;
 const days=Array.isArray(m.weekdays)?m.weekdays:[0,1,2,3,4,5,6];
 return days.includes(parse(d).getDay());
}
function slots(h,d){
 return h.medications.filter(m=>isScheduled(m,d)).flatMap(m=>(m.times||[]).map(time=>{
  const entry=h.medicationLog.find(x=>x.medicationId===m.id&&x.date===d&&x.time===time);
  return {m,time,entry};
 })).sort((a,b)=>a.time.localeCompare(b.time));
}
function setMedicationStatus(m,d,time,status){
 if(d>nowDay()){flash='Нельзя заранее отмечать приём выполненным.';render();return}
 change(h=>{
  h.medicationLog=h.medicationLog.filter(x=>!(x.medicationId===m.id&&x.date===d&&x.time===time));
  if(status)h.medicationLog.push({id:uid(),medicationId:m.id,date:d,time,status,recordedAt:new Date().toISOString()});
 });
}
function fillUi(){
 root.innerHTML=[
 '<div class="health-head"><div><h2>🌸 Цикл и 💊 лекарства</h2><p>Журнал здоровья в календаре LifeSims</p></div></div>',
 '<div class="health-switch"><button id="healthCycleTab" type="button">🌸 Цикл</button><button id="healthPillsTab" type="button">💊 Лекарства</button></div>',
 '<div id="healthNotice" class="health-notice" role="status" aria-live="polite"></div>',
 '<div id="healthCycleView">',
 '<div class="health-panel"><h3 id="healthCycleSummary">Цикл</h3><p id="healthForecastInfo" class="hint"></p><p class="health-warning">Прогноз ориентировочный. Он не определяет безопасные дни и не подходит для контрацепции.</p></div>',
 '<div class="health-panel"><div class="health-month-head"><button id="healthPrevMonth" type="button" aria-label="Предыдущий месяц">‹</button><strong id="healthMonthLabel"></strong><button id="healthNextMonth" type="button" aria-label="Следующий месяц">›</button></div><div id="healthMonthGrid" class="health-calendar"></div><p class="health-legend">● кровотечение &nbsp; ◌ предполагаемые дни &nbsp; 💊 приём лекарства</p></div>',
 '<form id="healthCycleForm" class="health-panel"><h3>Запись за день</h3>',
 '<label>Дата<input id="healthDate" type="date" required></label>',
 '<label>Кровотечение<select id="healthFlow"><option value="none">Нет</option><option value="spotting">Мажущие выделения</option><option value="light">Слабые</option><option value="medium">Умеренные</option><option value="heavy">Обильные</option></select></label>',
 '<label>Боль, 0–10<input id="healthPain" type="number" min="0" max="10" step="1" placeholder="Неизвестно"></label>',
 '<label>Настроение<select id="healthMood"></select></label>',
 '<label>Базальная температура, °C<input id="healthTemperature" type="number" min="30" max="43" step="0.01" inputmode="decimal" placeholder="Неизвестно"></label>',
 '<label>Цервикальная слизь<select id="healthMucus"><option value="">Не отмечено</option><option value="dry">Сухо</option><option value="sticky">Липкая</option><option value="creamy">Кремовая</option><option value="watery">Водянистая</option><option value="eggwhite">Как яичный белок</option></select></label>',
 '<label>Тест на овуляцию<select id="healthOvTest"><option value="">Не проводился</option><option value="negative">Отрицательный</option><option value="positive">Положительный</option></select></label>',
 '<label>Тест на беременность<select id="healthPregTest"><option value="">Не проводился</option><option value="negative">Отрицательный</option><option value="positive">Положительный</option></select></label>',
 '<label>Интимная близость<select id="healthIntimacy"><option value="">Не отмечено</option><option value="yes">Да</option><option value="no">Нет</option></select></label>',
 '<div><strong>Симптомы</strong><div id="healthSymptoms" class="health-chips"></div></div>',
 '<label>Заметка<textarea id="healthCycleNote" rows="2" maxlength="1000"></textarea></label>',
 '<div class="health-actions"><button type="submit" class="primary">Сохранить день</button><button id="healthDeleteCycle" type="button" class="secondary">Очистить запись дня</button></div></form>',
 '<form id="healthCycleSettings" class="health-panel"><h3>Параметры прогноза</h3><div class="health-cols"><label>Длина цикла, дней<input id="healthCycleLength" type="number" min="15" max="90" required></label><label>Менструация, дней<input id="healthPeriodLength" type="number" min="1" max="15" required></label></div><label class="health-inline"><input id="healthPeriodReminder" type="checkbox"> Напомнить за 2 дня до ожидаемого начала</label><button type="submit" class="secondary">Сохранить</button></form>',
 '</div>',
 '<div id="healthPillsView" hidden>',
 '<div class="health-panel"><h3>Приёмы за выбранный день</h3><label>Дата<input id="healthPillsDate" type="date"></label><div id="healthTodaySlots"></div></div>',
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
 for(const m of MOODS){const op=document.createElement('option');op.value=m;op.textContent=m||'Не отмечено';$('healthMood').append(op)}
 for(const s of SYMPTOMS){const label=el('label');const cb=document.createElement('input');cb.type='checkbox';cb.value=s;label.append(cb,document.createTextNode(s));$('healthSymptoms').append(label)}
 $('healthCycleTab').onclick=()=>{section='cycle';render()};
 $('healthPillsTab').onclick=()=>{section='pills';render()};
 $('healthPrevMonth').onclick=()=>{month=add(month+'-15',-31).slice(0,7);render()};
 $('healthNextMonth').onclick=()=>{month=add(month+'-15',31).slice(0,7);render()};
 $('healthDate').onchange=()=>{if(validDay($('healthDate').value)){date=$('healthDate').value;month=date.slice(0,7);render()}};
 $('healthPillsDate').onchange=()=>{if(validDay($('healthPillsDate').value)){date=$('healthPillsDate').value;month=date.slice(0,7);render()}};
 $('healthCycleForm').onsubmit=saveCycle;
 $('healthDeleteCycle').onclick=()=>change(h=>{delete h.cycleDays[date]});
 $('healthCycleSettings').onsubmit=e=>{e.preventDefault();change(h=>{h.settings.cycleLength=+$('healthCycleLength').value;h.settings.periodLength=+$('healthPeriodLength').value;h.settings.periodReminder=$('healthPeriodReminder').checked})};
 $('healthMedRepeat').onchange=()=>{$('healthMedDays').hidden=$('healthMedRepeat').value!=='custom'};
 $('healthMedicationForm').onsubmit=saveMedication;
 $('healthMedCancel').onclick=resetMedicationForm;
 $('healthReminders').onchange=e=>change(h=>{h.settings.reminders=!!e.target.checked});
 $('healthContraception').onchange=e=>change(h=>{h.settings.contraceptionEnabled=!!e.target.checked});
 $('healthNotifyPermission').onclick=requestPermission;
}
function saveCycle(e){
 e.preventDefault();
 const row={flow:$('healthFlow').value,pain:$('healthPain').value===''?null:Number($('healthPain').value),
 mood:$('healthMood').value,temperature:$('healthTemperature').value===''?null:Number($('healthTemperature').value),
 mucus:$('healthMucus').value,ovulationTest:$('healthOvTest').value,pregnancyTest:$('healthPregTest').value,
 intimacy:$('healthIntimacy').value,symptoms:[...$('healthSymptoms').querySelectorAll('input:checked')].map(x=>x.value),
 note:$('healthCycleNote').value.trim()};
 if(!validDay(date)||row.pain!=null&&(row.pain<0||row.pain>10)||row.temperature!=null&&(row.temperature<30||row.temperature>43))return;
 change(h=>{h.cycleDays[date]=row});
}
function setCycleFields(h){
 const v=h.cycleDays[date]||{};
 $('healthDate').value=date;
 $('healthFlow').value=v.flow||'none';$('healthPain').value=v.pain??'';
 $('healthMood').value=v.mood||'';$('healthTemperature').value=v.temperature??'';
 $('healthMucus').value=v.mucus||'';$('healthOvTest').value=v.ovulationTest||'';
 $('healthPregTest').value=v.pregnancyTest||'';$('healthIntimacy').value=v.intimacy||'';
 $('healthCycleNote').value=v.note||'';
 for(const cb of $('healthSymptoms').querySelectorAll('input'))cb.checked=(v.symptoms||[]).includes(cb.value);
 $('healthDeleteCycle').disabled=!h.cycleDays[date];
}
function renderCycle(h){
 const p=forecast(h);
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
  const d=month+'-'+pad(i),v=h.cycleDays[d],bleed=v&&v.flow&&v.flow!=='none';
  const predicted=!v&&p.expected&&Array.from({length:h.settings.periodLength||5},(_,j)=>add(p.expected,j)).includes(d);
  const hasPills=slots(h,d).some(x=>x.entry?.status==='taken');
  const b=button(String(i),()=>{date=d;render()},'health-day'+(date===d?' selected':'')+(bleed?' bleeding':'')+(predicted?' predicted':''));
  if(bleed)b.append(el('span','health-day-icon','●'));
  if(predicted)b.append(el('span','health-day-icon','◌'));
  if(hasPills)b.append(el('span','health-day-med','💊'));
  if(d===nowDay())b.classList.add('today');
  b.setAttribute('aria-label',d+(bleed?' менструация':'')+(predicted?' прогноз':'')+(hasPills?' лекарство принято':''));
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
  if(i>=0)h.medications[i]={...h.medications[i],...med};else h.medications.push(med);
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
 const row=el('div','health-dose-row'),left=el('div','health-dose-main');
 const state=s.entry?.status||'';
 left.append(el('strong','',s.time+' · '+s.m.name+(s.m.dose?' · '+s.m.dose:'')));
 left.append(el('small','health-status'+(state?' '+state:''),state==='taken'?'✓ Принято':state==='skipped'?'× Пропущено':d>nowDay()?'Запланировано':'Ожидает отметки'));
 const controls=el('div','health-actions');
 if(!compact){
  controls.append(button('✓',()=>setMedicationStatus(s.m,d,s.time,'taken'),state==='taken'?'health-active':'secondary'));
  controls.append(button('Пропущено',()=>setMedicationStatus(s.m,d,s.time,'skipped'),state==='skipped'?'health-active':'secondary'));
  if(state)controls.append(button('↺',()=>setMedicationStatus(s.m,d,s.time,null)));
  if(d>nowDay())for(const b of controls.querySelectorAll('button'))b.disabled=true;
 }
 row.append(left,controls);return row;
}
function renderMedications(h){
 $('healthPillsDate').value=date;$('healthReminders').checked=!!h.settings.reminders;
 $('healthContraception').checked=!!h.settings.contraceptionEnabled;renderMedicationTypes(h);
 const slotPanel=$('healthTodaySlots');slotPanel.replaceChildren();
 const todaySlots=slots(h,date);
 if(!todaySlots.length)slotPanel.append(el('p','hint','На выбранную дату приёмов нет.'));
 for(const s of todaySlots)slotPanel.append(medicationSlotLine(s,date));
 renderMedicationList(h);
 const history=$('healthMedicationHistory');history.replaceChildren();
 const recent=h.medicationLog.filter(x=>x.date<=nowDay()&&x.date>=add(nowDay(),-29)).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
 const scheduled=[];
 for(let i=0;i<30;i++)scheduled.push(...slots(h,add(nowDay(),-i)));
 const taken=scheduled.filter(x=>x.entry?.status==='taken').length;
 $('healthAdherence').textContent='По расписанию за 30 дней: '+taken+' принятых отметок из '+scheduled.length+' запланированных. Пропуски, которые не отмечены, не приравниваются к пропущенным дозам.';
 for(const entry of recent.slice(0,100)){
  const m=h.medications.find(x=>x.id===entry.medicationId);
  const item=el('div','health-history-row');
  item.textContent=dayLabel(entry.date)+' · '+entry.time+' · '+(m?.name||'Удалённый препарат')+' · '+(entry.status==='taken'?'✓ принято':'× пропущено');
  history.append(item);
 }
 if(!recent.length)history.append(el('p','hint','История появится после отметок приёма.'));
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
  const [hh,mm]=s.time.split(':').map(Number),due=hh*60+mm;
  if(s.entry||minutes<due||minutes-due>119)continue;
  const key='lifesims-health-notified-'+s.m.id+'-'+d+'-'+s.time;
  try{if(sessionStorage.getItem(key))continue;sessionStorage.setItem(key,'1')}catch(_){}
  try{new Notification('LifeSims · напоминание',{body:'Пора отметить запланированный приём',tag:key})}catch(_){}
 }
}
function openAt(d,tab='cycle'){
 date=validDay(d)?d:nowDay();month=date.slice(0,7);section=tab;render();B.openTab('health',true);
}
function appendAgenda(d,body){
 const h=data(),v=h.cycleDays[d],s=slots(h,d);
 if(!v&&!s.length)return;
 body.append(el('div','agenda-group-title','🌸 Здоровье и лекарства'));
 if(v){
  const tags=Array.isArray(v.symptoms)?v.symptoms.join(', '):'';
  const summary=(FLOWS[v.flow]||'Цикл')+(v.mood?' · '+v.mood:'')+(tags?' · '+tags:'');
  body.append(button('🌸 '+summary+' · Изменить',()=>openAt(d,'cycle'),'health-agenda-link'));
 }
 for(const slot of s){const line=medicationSlotLine(slot,d);body.append(line)}
}
function appendHistory(d,panel){
 const h=data(),entry=h.cycleDays[d],entries=slots(h,d);
 let count=0;
 if(entry){
  const line=el('div','history-activity-line');
  const info=el('div','','🌸 Цикл: '+(FLOWS[entry.flow]||'Нет кровотечения')+
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
  if(v?.flow&&v.flow!=='none'||med){
   const tag=el('span','health-calendar-marker',(v?.flow&&v.flow!=='none'?'🌸':'')+(med?'💊':''));
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