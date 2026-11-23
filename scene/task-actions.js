/* Shared task actions for LifeSims scene, calendar, skills and planner. */
(function moduleTaskActions(){
 'use strict';
 const api=window.LifeSimsTaskBridge;
 if(!api)return;
 const dlg=document.createElement('dialog');
 dlg.id='lifeTaskActionsDialog';
 dlg.setAttribute('aria-labelledby','lifeTaskActionsTitle');
 dlg.innerHTML='<div class="single-metric-head"><h3 id="lifeTaskActionsTitle"></h3><button type="button" class="secondary" id="lifeTaskActionsClose" aria-label="Закрыть">×</button></div><p class="hint" id="lifeTaskActionsInfo"></p><div class="row" style="flex-wrap:wrap;gap:10px"><button type="button" class="primary" id="lifeTaskActionsFocus">◉ Помодоро</button><button type="button" class="secondary" id="lifeTaskActionsDone">✓ Отметить выполненным</button><button type="button" class="secondary" id="lifeTaskActionsEdit">✎ Изменить</button></div>';
 document.body.append(dlg);
 const $=id=>document.getElementById(id);
 const finished=(a,date)=>a.legacyDone||((a.completions||[]).length>0&&
  (a.repeat==='once'||a.repeat==='inbox'||(a.completions||[]).some(c=>c.date===date)));
 function open(id,date=api.today()){
  const task=api.read().activities.find(a=>a?.id===id&&a.kind==='task');
  if(!task)return false;
  const done=typeof api.done==='function'?api.done(id,date):finished(task,date),scheduled=task.repeat==='inbox'||api.due(id,date);
  $('lifeTaskActionsTitle').textContent='☑ '+task.name;
  $('lifeTaskActionsInfo').textContent=done?'Дело уже выполнено.':!scheduled?
   'Дело не запланировано на '+date+'. Можно запустить помодоро или изменить расписание.':
   'Выбери действие. Помодоро не отмечает дело выполненным автоматически.';
  const button=$('lifeTaskActionsDone');
  button.disabled=done||!scheduled||date>api.today();
  $('lifeTaskActionsFocus').onclick=()=>{
   dlg.close();
   if(!window.LifeSimsTaskPremium?.showFocusForTask?.(id))
    alert('Открой «Дела → Помодоро», чтобы начать фокус-сессию.');
  };
  button.onclick=()=>{
   dlg.close();
   api.complete(id,date);
  };
  $('lifeTaskActionsEdit').onclick=()=>{dlg.close();api.edit(id)};
  if(!dlg.open)dlg.showModal();
  return true;
 }
 $('lifeTaskActionsClose').onclick=()=>dlg.close();
 dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
 window.LifeSimsTaskActions={open};
})();