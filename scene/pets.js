(function petsApp(){
 'use strict';
 const B=window.LifeSimsPetsBridge,layer=document.getElementById('scenePets');
 if(!B||!layer)return;
 const ids=['ginger','black'];
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 const btn=(txt,fn,cls='pet-action')=>{const b=el('button',cls,txt);b.type='button';b.addEventListener('click',fn);return b};
 let active=null,tab='care',notice='';
 // Raster sprites are cropped from the approved realistic LifeSims cat reference.
 // The original room background and pet interaction model remain unchanged.
 function artwork(id){
  return '<span class="pet-realistic-sprite pet-realistic-'+(id==='ginger'?'ginger':'black')+'" aria-hidden="true"></span>';
 }
  function snapshot(){return B.read()}
 function stampFrom(entries,match){return entries.filter(match).map(e=>Date.parse(e.at||e.date)).filter(Number.isFinite).sort((a,b)=>b-a)[0]||null}
 function fraction(ts,hours,now){return ts?Math.max(0,Math.min(1,1-Math.max(0,now-ts)/(hours*3600000))):0}
 function score(s,id){
  const now=Date.parse(s.now)||Date.now(),activity=(s.activities||[]).find(a=>a.id==='pet_feed_'+id);
  const fed=fraction(Date.parse(s.feedingTimes?.[id]||''),48,now),feed=Math.max(fed,activity?.completedToday?1:0);
  const litter=fraction(Date.parse(s.lastCatLitterAt||''),72,now);
  const pet=fraction(stampFrom(s.events||[],e=>e.kind==='pet_care'&&e.action==='pet'&&e.petId===id),36,now);
  return {value:Math.round(15+38*feed+30*litter+17*pet),fed:feed>0,litter:litter>0,pet:pet>0,fedToday:!!activity?.completedToday};
 }
 const dialog=el('dialog','pet-dialog');dialog.id='lifePetsDialog';dialog.setAttribute('aria-label','Питомцы');document.body.append(dialog);
 dialog.addEventListener('close',()=>{active=null;notice=''});
 const close=()=>{if(dialog.open)dialog.close()};
 function open(id){if(!ids.includes(id))return;active=id;tab='care';notice='';draw();if(!dialog.open)dialog.showModal()}
 function avatar(id){const a=el('span','pet-avatar');a.innerHTML=artwork(id);return a}
 function care(parent,pet,s,sc){
  const bar=el('div','pet-crystal-row');
  bar.append(el('span','pet-crystal-icon','💎'));
  const box=el('div','pet-crystal-meta');
  box.append(el('strong','',`Кристалл ${pet.name}: ${sc.value}/100`));
  const track=el('div','pet-progress'),fill=el('div','pet-progress-fill');fill.style.width=sc.value+'%';track.append(fill);box.append(track);bar.append(box);parent.append(bar);
  const info=el('div','pet-care-stats');
  info.append(el('p','',`🍽 Кормление: ${sc.fedToday?'отмечено сегодня':'сегодня не отмечено'}`));
  info.append(el('p','',`🧹 Лоток: ${sc.litter?'убирался недавно':'пора убрать'}`));
  info.append(el('p','',`❤️ Ласка: ${sc.pet?'была недавно':'котика можно погладить'}`));
  parent.append(info);
  const actions=el('div','pet-action-grid');
  actions.append(btn('❤️ Погладить',()=>{if(B.pet(pet.id)){notice='❤️ +5 XP к ресурсу «Забота» (за первые 3 поглаживания в день)';draw()}},'pet-action pet-petting'));
  actions.append(btn('🍽 Покормить',()=>{notice=B.feed(pet.id)?'Кормление учтено как ежедневная привычка':'Не удалось записать кормление';draw()}));
  actions.append(btn('🧹 Убрать общий лоток',()=>{B.cleanLitter();notice='Уборка лотка влияет на обоих котиков';draw()}));
  actions.append(btn('↗ Ресурс «Забота»',()=>{close();B.openCare()}));
  parent.append(actions);
  parent.append(el('p','pet-hint','Кристалл зависит от кормления, уборки туалета и поглаживания. Игровое состояние постепенно снижается без ухода.'));
 }
 function links(parent,pet,s){
  parent.append(el('p','pet-hint','Отметь связанные с питомцем дела, привычки и мероприятия. Изменения сохраняются.'));
  function group(title,items,key){
   const part=el('section','pet-links-group');part.append(el('h4','',title));
   const list=el('div','pet-links-list');
   for(const item of items){
    const row=el('div','pet-links-row'),label=el('label','pet-links-label');
    const cb=el('input');cb.type='checkbox';
    cb.checked=(pet[key]||[]).includes(item.id)||key==='activities'&&item.petId===pet.id;
    cb.addEventListener('change',()=>{if(B.link(pet.id,key,item.id,cb.checked)){notice='✓ Связи сохранены';draw()}else cb.checked=!cb.checked});
    label.append(cb,el('span','',item.name||item.title));row.append(label);
    const edit=btn('✎',()=>{close();key==='activities'?B.editActivity(item.id):B.editEvent(item.id)},'pet-links-edit');
    edit.setAttribute('aria-label','Редактировать '+(item.name||item.title));row.append(edit);list.append(row);
   }
   if(!items.length)list.append(el('p','pet-hint','Нет записей.'));
   part.append(list);parent.append(part);
  }
  group('☑ Дела и ◇ привычки',(s.activities||[]).filter(x=>!x.petId||x.petId===pet.id||(pet.activities||[]).includes(x.id)),'activities');
  group('📅 Мероприятия',s.schedule||[],'schedule');
  const add=el('div','pet-action-grid');
  add.append(btn('＋ Дело',()=>{close();B.addActivity('task')}));
  add.append(btn('＋ Привычка',()=>{close();B.addActivity('habit')}));
  add.append(btn('＋ Мероприятие',()=>{close();B.addEvent()}));
  parent.append(add,el('p','pet-hint','После создания новой записи открой питомца и свяжи её в этом разделе.'));
 }
 function draw(){
  if(!active)return;
  const s=snapshot(),pet=(s.animals||[]).find(a=>a.id===active);if(!pet){close();return}
  dialog.replaceChildren();
  const header=el('div','pet-dialog-head');header.append(avatar(active));
  const title=el('div','pet-dialog-title');title.append(el('strong','',pet.name),el('small','',active==='ginger'?'Рыжий пушистый кот':'Чёрный пушистый кот'));header.append(title);
  const dismiss=btn('×',close,'pet-dialog-close');dismiss.setAttribute('aria-label','Закрыть');header.append(dismiss);dialog.append(header);
  const tabs=el('div','pet-tabs');for(const id of ids){
   const other=(s.animals||[]).find(x=>x.id===id);
   tabs.append(btn((id==='ginger'?'🧡 ':'🖤 ')+(other?.name||id),()=>{active=id;notice='';draw()},'pet-tab'+(id===active?' active':'')));
  }dialog.append(tabs);
  const form=el('form','pet-name-form'),label=el('label','', 'Имя питомца'),input=el('input');
  input.required=true;input.maxLength=50;input.value=pet.name;label.append(input);form.append(label);
  const save=btn('Сохранить имя',()=>{},'pet-name-save');save.type='submit';form.append(save);
  form.addEventListener('submit',event=>{event.preventDefault();notice=B.rename(active,input.value)?'✓ Имя сохранено':'Не удалось сохранить имя';draw()});dialog.append(form);
  const views=el('div','pet-views');
  views.append(btn('💎 Уход',()=>{tab='care';draw()},'pet-view'+(tab==='care'?' active':'')));
  views.append(btn('🔗 Связи',()=>{tab='links';draw()},'pet-view'+(tab==='links'?' active':'')));
  dialog.append(views);
  const body=el('div','pet-dialog-body');dialog.append(body);
  if(tab==='care')care(body,pet,s,score(s,active));else links(body,pet,s);
  if(notice){const status=el('p','pet-status',notice);status.setAttribute('role','status');dialog.append(status)}
 }
 function render(){
  const pets=snapshot().animals||[];layer.replaceChildren();
  for(const id of ids){const pet=pets.find(x=>x.id===id);if(!pet)continue;
   const b=btn('',()=>open(id),'pet-hotspot pet-'+id);
   b.innerHTML=artwork(id);
   b.setAttribute('aria-label','Открыть питомца '+pet.name);
   b.title=pet.name+' · погладить, покормить';
   const paw=el('span','pet-paw','🐾');paw.setAttribute('aria-hidden','true');b.append(paw);layer.append(b);
  }
  if(dialog.open&&active)draw();
 }
 window.LifeSimsPets={open,render,score:id=>score(snapshot(),id).value};
 render();
})();