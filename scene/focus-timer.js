(function moduleFocusTimer(){
 'use strict';
 const api=window.LifeSimsTaskBridge;if(!api)return;
 const $=id=>document.getElementById(id);
 const root=$('tpFocusMount');if(!root)return;
 root.innerHTML=`
 <div class="tp-focus">
 <div class="tp-focus-modes"><button type="button" data-focus-mode="focus" class="active">Помо</button><button type="button" data-focus-mode="short">Короткий отдых</button><button type="button" data-focus-mode="long">Длинный отдых</button><button type="button" data-focus-mode="stopwatch">Секундомер</button></div>
 <div class="tp-focus-label">Фокус</div>
 <div class="tp-timer-ring" id="tpFocusRing"><span id="tpTime">25:00</span></div>
 <div class="tp-focus-buttons"><button id="tpFocusToggle" type="button" class="tp-primary">Начать</button>
 <button id="tpFocusReset" type="button" class="tp-minor">Сброс</button></div>
 <label class="tp-focus-linked">Для дела<select id="tpFocusTask"><option value="">Не привязывать</option></select></label>
 <details class="tp-settings"><summary>Настройки интервалов</summary>
 <div class="tp-settings-grid"><label>Работа, мин<input id="tpFocusDuration" type="number" min="1" max="120" value="25"></label>
 <label>Перерыв, мин<input id="tpShortDuration" type="number" min="1" max="120" value="5"></label>
 <label>Длинный перерыв, мин<input id="tpLongDuration" type="number" min="1" max="120" value="15"></label></div>
 <button id="tpFocusSave" type="button" class="tp-minor">Сохранить интервалы</button></details>
 <div id="tpFocusStats" class="tp-focus-stats"></div></div>`;
 const defaultSetting={focus:25,short:5,long:15};
 const duration=(f,settings)=>f.mode==='stopwatch'?0:(Number(settings[f.mode])||25)*60;
 const remaining=(f,now=Date.now())=>{
  if(f.mode==='stopwatch')return (Number(f.elapsedSec)||0)+(f.running&&f.startAt?Math.max(0,(now-f.startAt)/1000):0);
  return f.running&&f.endAt?Math.max(0,(f.endAt-now)/1000):(Number(f.remainingSec)||0);
 };
 function render(){
  const data=api.read(),f=data.focusTimer||{mode:'focus',remainingSec:1500,running:false},settings={...defaultSetting,...data.focusSettings};
  if(f.running&&f.mode!=='stopwatch'&&f.endAt&&Date.now()>=f.endAt){
   api.finishFocus();return render();
  }
  const now=Date.now(),seconds=Math.ceil(Math.max(0,remaining(f,now)));
  $('tpTime').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  $('tpFocusToggle').textContent=f.running?'Пауза':seconds===0&&f.mode!=='stopwatch'?'Заново':'Начать';
  const total=duration(f,settings);
  $('tpFocusRing').style.setProperty('--pomo-progress',f.mode==='stopwatch'?'0%':Math.max(0,Math.min(100,(1-seconds/Math.max(1,total))*100))+'%');
  for(const b of root.querySelectorAll('[data-focus-mode]'))b.classList.toggle('active',b.dataset.focusMode===f.mode);
  const today=api.today(),events=data.events.filter(x=>x.kind==='focus'&&x.date===today);
  const minutes=events.reduce((sum,e)=>sum+(Number(e.durationMin)||25),0);
  $('tpFocusStats').textContent='Сегодня: '+events.length+' завершённых помодоро · '+minutes+' мин работы';
  const select=$('tpFocusTask'),old=select.value;
  const choices=data.activities.filter(a=>a.kind==='task'&&!a.legacyDone&&!(a.completions||[]).length);
  if(select.options.length!==choices.length+1||choices.some(a=>![...select.options].some(o=>o.value===a.id))){
   select.replaceChildren();
   const empty=document.createElement('option');empty.value='';empty.textContent='Не привязывать';select.append(empty);
   choices.forEach(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.name;select.append(o)});
  }
  const wished=f.taskId||old;
  select.value=[...select.options].some(o=>o.value===wished)?wished:'';
 }
 function setMode(mode){
  const settings={...defaultSetting,...api.read().focusSettings};
  api.writeFocus({mode,running:false,remainingSec:duration({mode},settings),elapsedSec:0,startAt:null,endAt:null,taskId:''});
  render();
 }
 function toggle(){
  const data=api.read(),f={mode:'focus',remainingSec:1500,elapsedSec:0,running:false,...data.focusTimer},now=Date.now();
  if(f.running){
   if(f.mode==='stopwatch')api.writeFocus({...f,running:false,elapsedSec:Math.floor(remaining(f,now)),startAt:null});
   else api.writeFocus({...f,running:false,remainingSec:Math.ceil(remaining(f,now)),endAt:null});
  }else{
   if(f.mode==='stopwatch')api.writeFocus({...f,running:true,startAt:now,taskId:$('tpFocusTask').value});
   else{
    const current=remaining(f),seconds=current>0?current:duration(f,{...defaultSetting,...data.focusSettings});
    api.writeFocus({...f,running:true,remainingSec:seconds,endAt:now+seconds*1000,taskId:$('tpFocusTask').value});
   }
  }
  render();
 }
 root.querySelectorAll('[data-focus-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.focusMode));
 $('tpFocusToggle').onclick=toggle;
 $('tpFocusReset').onclick=()=>setMode(api.read().focusTimer?.mode||'focus');
 $('tpFocusTask').onchange=()=>api.writeFocus({...api.read().focusTimer,taskId:$('tpFocusTask').value});
 $('tpFocusSave').onclick=()=>{
  const vals={focus:Number($('tpFocusDuration').value),short:Number($('tpShortDuration').value),long:Number($('tpLongDuration').value)};
  if(Object.values(vals).some(v=>!Number.isInteger(v)||v<1||v>120)){alert('Длительность: 1–120 минут.');return}
  api.saveFocusSettings(vals);setMode(api.read().focusTimer?.mode||'focus');
 };
 const settings={...defaultSetting,...api.read().focusSettings};
 $('tpFocusDuration').value=settings.focus;$('tpShortDuration').value=settings.short;$('tpLongDuration').value=settings.long;
 window.LifeSimsFocusTimer={render};
 render();
 window.setInterval(()=>{if(!document.hidden&&api.read().focusTimer?.running)render()},1000);
 window.addEventListener('focus',render);
})();