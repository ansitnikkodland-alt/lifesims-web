/* LifeSims v46: chat-like meal logger, remembered recipes, recents and favorites. */
(function(){
 'use strict';
 const bridge=window.LifeSimsFoodBridge,legacy=window.LifeSimsFood;
 if(!bridge||!legacy||typeof legacy.estimate!=='function'||typeof bridge.listTemplates!=='function')return;
 const originalOpen=legacy.open,originalClose=legacy.close;
 const node=document.createElement('div');node.id='mealChat';node.className='meal-chat-mask';node.hidden=true;
 node.innerHTML=[
 '<section class="meal-chat-sheet" role="dialog" aria-modal="true" aria-labelledby="mealChatTitle">',
 '<div class="meal-chat-grab" aria-hidden="true"></div>',
 '<div class="meal-chat-head"><button id="mealChatBack" type="button" aria-label="Закрыть">‹</button>',
 '<h2 id="mealChatTitle">🍽 Питание</h2><input id="mealChatDate" type="date" aria-label="Дата приёма пищи">',
 '<button type="button" class="meal-chat-details" id="mealChatDetailed" aria-label="Подробный журнал питания" title="Подробный журнал">☷</button></div>',
 '<div class="meal-chat-tabs" role="tablist" aria-label="Режим записи еды">',
 '<button type="button" role="tab" id="mealChatTabText" aria-selected="true" data-meal-tab="text">Ввод</button>',
 '<button type="button" role="tab" id="mealChatTabRecent" aria-selected="false" data-meal-tab="recent">Недавние</button>',
 '<button type="button" role="tab" id="mealChatTabFavorites" aria-selected="false" data-meal-tab="favorite">Избранное</button></div>',
 '<div class="meal-chat-contents" id="mealChatContent" aria-live="polite"></div>',
 '<div class="meal-chat-compose"><p class="meal-chat-hint">Один раз укажи «Название: ингредиенты» — дальше достаточно названия.</p>',
 '<div id="mealChatSuggestions" class="meal-chat-suggestions" aria-label="Подсказки сохранённых блюд" hidden></div>',
 '<form id="mealChatForm" class="meal-chat-composer">',
 '<textarea id="mealChatInput" rows="2" maxlength="850" aria-label="Что ты съела или выпила" placeholder="Что ты съела? Например: Омлет: 2 яйца, молоко, сыр"></textarea>',
 '<button id="mealChatSend" type="submit" aria-label="Отправить и записать еду" title="Записать еду">➤</button></form>',
 '<p id="mealChatStatus" role="status" class="meal-chat-status" hidden></p></div>',
 '<p class="meal-chat-note">Калории и БЖУ — приблизительная оценка, не данные лабораторного анализа.</p>',
 '</section>'
 ].join('');
 document.body.append(node);
 const $=id=>document.getElementById(id);
 let currentTab='text',editingId=null,bodyScrollBefore='',lastFocus=null;
 const norm=text=>String(text||'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
 const templates=()=>bridge.listTemplates().sort((a,b)=>String(b.lastUsedAt||'').localeCompare(String(a.lastUsedAt||'')));
 const meals=()=>bridge.list().filter(m=>m.date===$('mealChatDate').value).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
 const create=(tag,className,content)=>{
  const el=document.createElement(tag);if(className)el.className=className;
  if(content!=null)el.textContent=String(content);return el;
 };
 function status(message){
  const el=$('mealChatStatus');el.hidden=!message;el.textContent=message||'';
 }
 function currentDate(){return $('mealChatDate').value||bridge.today()}
 function tabChanged(tab){
  currentTab=tab;
  for(const item of node.querySelectorAll('[data-meal-tab]')){
   const selected=item.dataset.mealTab===tab;item.setAttribute('aria-selected',selected?'true':'false');
  }
  renderContent();renderSuggestions();
 }
 function renderContent(){
  const root=$('mealChatContent');root.replaceChildren();
  if(currentTab!=='text'){
   const items=templates().filter(t=>currentTab!=='favorite'||t.favorite);
   root.append(create('p','meal-chat-prompt',currentTab==='recent'?'Недавние блюда':'Избранные блюда'));
   root.append(create('p','meal-chat-subtitle','Выбери блюдо — сохранённые ингредиенты и порция подставятся при отправке.'));
   const list=create('div','meal-chat-list');
   for(const t of items.slice(0,70))list.append(templateRow(t));
   if(!items.length)list.append(create('p','meal-chat-empty',currentTab==='favorite'?'Нажми ☆ рядом с блюдом во вкладке «Недавние», чтобы добавить его в избранное.':'Пока нет сохранённых блюд. Запиши первый приём пищи.'));
   root.append(list);return;
  }
  const entries=meals(),known=entries.filter(m=>m.kcal!=null),total=known.reduce((sum,m)=>sum+Number(m.kcal),0);
  root.append(create('p','meal-chat-prompt','Что ты ела в этот день?'));
  const header=create('div','meal-chat-summary');
  const title=create('strong','',known.length?'≈ '+Math.round(total)+' ккал':'Нет данных о калориях');
  const note=create('span','',entries.length+' '+(entries.length===1?'приём пищи':'приёмов пищи')+' · '+currentDate());
  header.append(title,note);root.append(header);
  const thread=create('div','meal-chat-thread');
  if(!entries.length)thread.append(create('p','meal-chat-empty','Напиши название блюда и состав или выбери уже знакомое из подсказок. После отправки запись сохранится за выбранную дату.'));
  for(const m of entries){
   const wrapper=create('div','meal-chat-entry');
   wrapper.append(create('div','meal-chat-message',m.title+(m.ingredients?': '+m.ingredients:'')));
   const reply=create('div','meal-chat-response');
   reply.append(create('strong','',m.kcal!=null?'≈ '+m.kcal+' ккал':'Калории не указаны'));
   reply.append(create('div','meal-chat-macro','Б '+(m.protein??'—')+' г · Ж '+(m.fat??'—')+' г · У '+(m.carbs??'—')+' г'));
   reply.append(create('div','meal-chat-uncertainty',m.time+' · '+(m.estimate!==false?'Ориентировочная оценка':'Ручные значения')));
   const buttons=create('div','meal-chat-actions');
   const edit=create('button','','Изменить');edit.type='button';edit.onclick=()=>startEdit(m);
   const detail=create('button','','Подробнее');detail.type='button';detail.onclick=()=>openDetailed(currentDate(),m.id);
   const star=create('button','',isFavorite(m.title)?'★':'☆');star.type='button';
   star.title='В избранное';star.setAttribute('aria-label',isFavorite(m.title)?'Убрать из избранного':'Добавить в избранное');
   star.onclick=()=>toggleFavorite(m.title);
   buttons.append(edit,detail,star);reply.append(buttons);wrapper.append(reply);thread.append(wrapper);
  }
  root.append(thread);root.scrollTop=root.scrollHeight;
 }
 function isFavorite(title){return templates().some(t=>norm(t.title)===norm(title)&&t.favorite)}
 function toggleFavorite(title){
  try{bridge.setTemplateFavorite(title,!isFavorite(title));renderContent();renderSuggestions();status('Избранное обновлено.')}
  catch(e){status('⚠ '+e.message)}
 }
 function templateRow(t){
  const row=create('div','meal-chat-item'),pick=create('button','meal-chat-pick');pick.type='button';
  const name=create('b','',t.title),detail=create('small','',t.ingredients||'Сохранённое название, состав не указан');
  pick.append(name,detail);pick.onclick=()=>chooseTemplate(t);
  const star=create('button','meal-chat-star',t.favorite?'★':'☆');star.type='button';
  star.setAttribute('aria-label',t.favorite?'Убрать из избранного':'Добавить в избранное');
  star.setAttribute('aria-pressed',t.favorite?'true':'false');star.onclick=()=>toggleFavorite(t.title);
  row.append(pick,star);return row;
 }
 function chooseTemplate(t){
  $('mealChatInput').value=t.title;editingId=null;
  tabChanged('text');renderSuggestions();status('Сохранённый состав: '+(t.ingredients||'не указан')+'. Нажми ➤, чтобы записать.');
  $('mealChatInput').focus();
 }
 function renderSuggestions(){
  const root=$('mealChatSuggestions');root.replaceChildren();
  const input=$('mealChatInput').value.trim();
  if(currentTab!=='text'||input.length<1){root.hidden=true;return}
  const term=norm(input.split(/[:—\n]/,1)[0]),items=templates()
   .filter(t=>norm(t.title).includes(term)||norm(t.ingredients).includes(term)).slice(0,6);
  root.hidden=!items.length;
  for(const t of items){
   const btn=create('button','',t.title+(t.favorite?' ★':''));btn.type='button';
   btn.onclick=()=>chooseTemplate(t);root.append(btn);
  }
 }
 function parseInput(source){
  const raw=source.trim(),parts=raw.match(/^([^:\n—]{1,110})\s*(?::|—)\s*([\s\S]{2,700})$/);
  return {title:parts?parts[1].trim():raw,ingredients:parts?parts[2].trim():''};
 }
 function startEdit(meal){
  editingId=meal.id;$('mealChatInput').value=meal.title+(meal.ingredients?': '+meal.ingredients:'');
  tabChanged('text');renderSuggestions();
  status('Редактируется запись от '+meal.date+' · '+meal.time+'. Отправка сохранит изменения без дубликата.');
  $('mealChatInput').focus();
 }
 function logMeal(event){
  event.preventDefault();const input=$('mealChatInput').value.trim();
  if(!input){status('Введи, что ты съела или выпила.');return}
  const parsed=parseInput(input);
  if(!parsed.title){status('Укажи название блюда.');return}
  const existing=editingId?bridge.list().find(m=>m.id===editingId):null;
  if(editingId&&!existing){status('⚠ Редактируемая запись больше не существует.');return}
  const match=templates().find(t=>norm(t.title)===norm(parsed.title));
  const hasNewIngredients=!!parsed.ingredients;
  const ingredientText=hasNewIngredients?parsed.ingredients:
   (match?.ingredients||(existing&&norm(existing.title)===norm(parsed.title)?existing.ingredients:'')||'');
  const canonicalTitle=!hasNewIngredients&&match?.title?match.title:parsed.title;
  const estimate=legacy.estimate(canonicalTitle+(ingredientText?', '+ingredientText:''),(!hasNewIngredients&&match?.grams)||existing?.grams||null);
  const usePrevious=!!match&&!hasNewIngredients&&match.kcal!=null;
  const nutrition=usePrevious?match:estimate;
  const now=new Date(),time=existing?.time||String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  try{
   bridge.upsert({
    id:existing?.id,date:currentDate(),time,title:canonicalTitle,ingredients:ingredientText,
    grams:nutrition.grams??estimate.grams,kcal:nutrition.kcal??estimate.kcal,
    protein:nutrition.protein??estimate.protein,fat:nutrition.fat??estimate.fat,carbs:nutrition.carbs??estimate.carbs,
    estimate:true,method:'text',remember:true,templateTitle:canonicalTitle
   });
   $('mealChatInput').value='';editingId=null;tabChanged('text');renderSuggestions();
   status('✓ '+canonicalTitle+' сохранено за '+currentDate()+'. '+(usePrevious?'Использована сохранённая порция.':estimate.confidence+'.'));
  }catch(e){status('⚠ '+e.message)}
 }
 function closeChat(){
  if(node.hidden)return;
  node.hidden=true;document.body.style.overflow=bodyScrollBefore;
  if(lastFocus&&lastFocus.isConnected&&typeof lastFocus.focus==='function')lastFocus.focus({preventScroll:true});
  editingId=null;
 }
 function openDetailed(date=currentDate(),mealId=null){
  closeChat();if(typeof originalOpen==='function')originalOpen(date,mealId);
 }
 function openChat(date=bridge.today(),mealId=null){
  if(typeof originalClose==='function')originalClose();
  lastFocus=document.activeElement;bodyScrollBefore=document.body.style.overflow;document.body.style.overflow='hidden';
  $('mealChatDate').value=/^\d{4}-\d{2}-\d{2}$/.test(String(date))?date:bridge.today();
  editingId=null;$('mealChatInput').value='';status('');node.hidden=false;tabChanged('text');
  const meal=mealId?bridge.list().find(m=>m.id===mealId):null;
  if(meal)startEdit(meal);else $('mealChatInput').focus({preventScroll:true});
 }
 node.addEventListener('click',e=>{if(e.target===node)closeChat()});
 $('mealChatBack').onclick=closeChat;
 $('mealChatDetailed').onclick=()=>openDetailed(currentDate(),editingId);
 $('mealChatDate').addEventListener('change',()=>{editingId=null;$('mealChatInput').value='';status('');tabChanged('text')});
 $('mealChatForm').addEventListener('submit',logMeal);
 $('mealChatInput').addEventListener('input',()=>{renderSuggestions();if($('mealChatStatus').textContent.startsWith('⚠'))status('')});
 $('mealChatInput').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('mealChatForm').requestSubmit()}
 });
 for(const button of node.querySelectorAll('[data-meal-tab]'))button.addEventListener('click',()=>tabChanged(button.dataset.mealTab));
 document.addEventListener('keydown',e=>{if(!node.hidden&&e.key==='Escape')closeChat()});
 window.LifeSimsFood={...legacy,open:openChat,close:()=>{
  closeChat();if(typeof originalClose==='function')originalClose();
 },openDetailed};
 window.LifeSimsMealChat={open:openChat,close:closeChat};
})();
