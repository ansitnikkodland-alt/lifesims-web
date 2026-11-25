/* LifeSims v47: chat meal logger with optional photo and package scanning. */
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
 '<div id="mealChatPhotoActions" class="meal-chat-photo-actions">',
 '<button id="mealChatCamera" type="button">📷 Камера</button><button id="mealChatGallery" type="button">🖼 Галерея</button>',
 '<input id="mealChatCameraInput" type="file" accept="image/*" capture="environment" hidden>',
 '<input id="mealChatGalleryInput" type="file" accept="image/*" hidden>',
 '</div>',
 '<div class="meal-chat-photo-panel" id="mealChatPhotoPanel" hidden>',
 '<div class="meal-chat-photo-top"><img id="mealChatPhotoPreview" alt="Прикреплённая еда или упаковка">',
 '<div><strong>Фото прикреплено</strong><button type="button" id="mealChatPhotoRemove">× Убрать</button>',
 '<p>Распознавание автоматически</p><div class="meal-chat-photo-mode">',
 '<button type="button" id="mealChatAnalyzeFood">🍽 Готовое блюдо</button>',
 '<button type="button" id="mealChatAnalyzePackage">📦 Упаковка / этикетка</button></div></div></div>',
 '<div id="mealChatPhotoFeedback" class="meal-chat-photo-feedback" role="status">Проверяю содержимое снимка.</div>',
 '<div id="mealChatPhotoCandidates" class="meal-chat-photo-candidates" hidden></div>',
 '<label class="meal-chat-photo-portion">Сколько съела, г <input id="mealChatPhotoGrams" type="number" min="1" max="10000" step="1" value="200"></label>',
 '<div id="mealChatPhotoBarcode" hidden><label>Штрихкод (если не удалось считать с фото) <input id="mealChatBarcodeValue" type="text" inputmode="numeric" maxlength="14" placeholder="8–14 цифр"></label>',
 '<button type="button" id="mealChatFindBarcode">Найти товар по штрихкоду</button></div>',
 '</div>',
 '<div id="mealChatSuggestions" class="meal-chat-suggestions" aria-label="Подсказки сохранённых блюд" hidden></div>',
 '<div class="meal-chat-time-row"><label for="mealChatTime">🕒 Время приёма пищи</label>',
 '<input id="mealChatTime" type="time" required aria-label="Время приёма пищи">',
 '<small>Можно указать фактическое время, включая прошлые часы.</small></div>',
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
 let photoFile=null,photoData=null,photoPreviewURL=null,photoThumbnail=null,photoBusy=false,photoRevision=0,photoMode=null;
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
 function localClock(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
 function resetTime(){ $('mealChatTime').value=localClock() }
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
  header.append(title,note);
  const rolling=bridge.getRollingBalance?.();
  if(rolling){
   const balance=rolling.balance==null?'—':(rolling.balance>0?'+':'')+rolling.balance+' ккал';
   const eaten=rolling.eaten==null?'нет данных':'≈'+rolling.eaten+' ккал';
   const spent=rolling.spent==null?'нет полного дня Oura':'≈'+rolling.spent+' ккал';
   const line=create('div','meal-chat-rolling',
    'Последние 24 ч: баланс '+balance+' · съедено '+eaten+' · расход '+spent+
    (rolling.estimatedFrom?' (оценка по '+rolling.source+' за '+rolling.estimatedFrom+')':''));
   header.append(line);
  }
  root.append(header);
  const thread=create('div','meal-chat-thread');
  if(!entries.length)thread.append(create('p','meal-chat-empty','Напиши название блюда и состав или выбери уже знакомое из подсказок. После отправки запись сохранится за выбранную дату.'));
  for(const m of entries){
   const wrapper=create('div','meal-chat-entry');
   if(m.photoThumb){const img=create('img','meal-chat-entry-photo');img.src=m.photoThumb;img.alt='Фото приёма пищи';wrapper.append(img)}
   wrapper.append(create('div','meal-chat-message',m.title+(m.ingredients?': '+m.ingredients:'')));
   const reply=create('div','meal-chat-response');
   reply.append(create('strong','',m.kcal!=null?'≈ '+m.kcal+' ккал':'Калории не указаны'));
   reply.append(create('div','meal-chat-macro','Б '+(m.protein??'—')+' г · Ж '+(m.fat??'—')+' г · У '+(m.carbs??'—')+' г'));
   if(m.barcode&&/^\d{8,14}$/.test(m.barcode)){
    const ref=create('a','meal-chat-source-link','Смотреть карточку Open Food Facts');
    ref.href='https://world.openfoodfacts.org/product/'+encodeURIComponent(m.barcode);
    ref.target='_blank';ref.rel='noopener noreferrer';reply.append(ref);
   }
   reply.append(create('div','meal-chat-uncertainty',m.time+' · '+(m.photoSource?'Источник: '+m.photoSource:m.estimate!==false?'Источник: ориентировочный расчёт LifeSims':'Источник: ручные значения')));
   const timeLink=create('button','meal-chat-time-edit','🕒 '+m.time+' · Изменить время');
   timeLink.type='button';timeLink.setAttribute('aria-label','Изменить время приёма пищи: '+m.title);
   timeLink.onclick=()=>{startEdit(m);$('mealChatTime').focus({preventScroll:true})};
   reply.append(timeLink);
   const buttons=create('div','meal-chat-actions');
   const edit=create('button','','Изменить');edit.type='button';edit.onclick=()=>startEdit(m);
   const detail=create('button','','Подробнее');detail.type='button';detail.onclick=()=>openDetailed(currentDate(),m.id);
   const star=create('button','',isFavorite(m.title)?'★':'☆');star.type='button';
   star.title='В избранное';star.setAttribute('aria-label',isFavorite(m.title)?'Убрать из избранного':'Добавить в избранное');
   star.onclick=()=>toggleFavorite(m.title);
   const del=create('button','','Удалить');del.type='button';del.className='meal-chat-delete';
   del.setAttribute('aria-label','Удалить запись о еде: '+m.title);
   del.onclick=()=>{
    if(!confirm('Удалить «'+m.title+'» за '+m.date+'?'))return;
    try{
     bridge.remove(m.id);
     if(editingId===m.id){editingId=null;$('mealChatInput').value='';resetPhoto()}
     renderContent();legacy.render?.();
     status('✓ Запись о еде удалена. Калории и сытость пересчитаны.');
    }catch(error){status('⚠ Не удалось удалить: '+error.message)}
   };
   buttons.append(edit,detail,star,del);reply.append(buttons);wrapper.append(reply);thread.append(wrapper);
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
  resetPhoto();editingId=meal.id;$('mealChatInput').value=meal.title+(meal.ingredients?': '+meal.ingredients:'');
  $('mealChatTime').value=meal.time||localClock();
  tabChanged('text');renderSuggestions();
  status('Редактируется запись от '+meal.date+' · '+meal.time+'. Отправка сохранит изменения без дубликата.');
  $('mealChatInput').focus();
 }
 function resetPhoto(){
  photoRevision++;
  photoFile=null;photoData=null;photoThumbnail=null;photoBusy=false;photoMode=null;
  document.dispatchEvent(new Event('lifesims:meal-photo-reset'));
  if(photoPreviewURL)URL.revokeObjectURL(photoPreviewURL);
  photoPreviewURL=null;
  $('mealChatPhotoPanel').hidden=true;
  $('mealChatPhotoFeedback').textContent='Выбери тип фото для распознавания.';
  $('mealChatPhotoCandidates').replaceChildren();$('mealChatPhotoCandidates').hidden=true;
  $('mealChatPhotoBarcode').hidden=true;$('mealChatBarcodeValue').value='';
  $('mealChatCameraInput').value='';$('mealChatGalleryInput').value='';
  $('mealChatAnalyzeFood').disabled=false;$('mealChatAnalyzePackage').disabled=false;
  $('mealChatFindBarcode').disabled=false;
 }
 function photoFeedback(value){$('mealChatPhotoFeedback').textContent=value;status(value)}
 function showPhotoResult(result){
  photoData=result;
  document.dispatchEvent(new CustomEvent('lifesims:meal-product',{detail:result}));
  if(result.title){
   $('mealChatInput').value=result.title+(result.ingredients?': '+result.ingredients:'');
   renderSuggestions();
  }
  const mode=result.kind==='package';
  if(mode){
   $('mealChatPhotoGrams').value=Number.isFinite(Number(result.gramsEstimate))&&Number(result.gramsEstimate)>0?result.gramsEstimate:100;
   $('mealChatPhotoBarcode').hidden=false;
  }
  if(!mode&&result.kind==='meal'&&Number.isFinite(result.gramsEstimate)){
    $('mealChatPhotoGrams').value=result.gramsEstimate;
   }
   const n=result.per100||{};
  const per100=Object.values(n).some(v=>v!=null)
   ?' На 100 г: '+(n.kcal??'—')+' ккал · Б '+(n.protein??'—')+' · Ж '+(n.fat??'—')+' · У '+(n.carbs??'—')+' г.':'';
  photoFeedback((result.title?'Предложено: '+result.title+'. ':'Название не удалось определить. ')+
   'Источник: '+result.source+'. '+result.confidence+'.'+per100+
   ' Укажи съеденную порцию и проверь название перед отправкой.');
  const box=$('mealChatPhotoCandidates');box.replaceChildren();
  const candidates=(result.candidates||[]).filter(x=>x?.title);
  box.hidden=!candidates.length;
  for(const item of candidates){
   const btn=create('button','',item.title+' ('+Math.round(item.score*100)+'%)');
   btn.type='button';btn.onclick=()=>{$('mealChatInput').value=item.title;renderSuggestions();photoFeedback('Выбрано предположение: '+item.title+'. Проверь, что это действительно твоё блюдо.')};
   box.append(btn);
  }
 }
 async function attachPhoto(file){
  if(!file)return;
  if(!/^image\//.test(file.type||'')){status('⚠ Нужно изображение.');return}
  if(file.size>16*1024*1024){status('⚠ Фото больше 16 МБ.');return}
  resetPhoto();photoFile=file;
  const revision=photoRevision;
  photoPreviewURL=URL.createObjectURL(file);$('mealChatPhotoPreview').src=photoPreviewURL;
  $('mealChatPhotoPanel').hidden=false;$('mealChatPhotoGrams').value=200;
  photoFeedback('Фото прикреплено. Начинаю распознавание…');
  try{
   const small=await window.LifeSimsMealPhoto?.compressedThumbnail(file);
   if(photoRevision===revision)photoThumbnail=small||null;
  }catch(e){if(photoRevision===revision)photoFeedback('⚠ '+e.message+' Можно записать текст без сохранения фото.')}
 }
 async function analyzePhoto(mode){
  if(!photoFile||photoBusy)return;
  if(!window.LifeSimsMealPhoto){photoFeedback('Распознавание фото не загрузилось; проверь подключение.');return}
  photoBusy=true;photoMode=mode;photoData=null;
  $('mealChatAnalyzeFood').disabled=true;$('mealChatAnalyzePackage').disabled=true;
  $('mealChatPhotoBarcode').hidden=mode!=='package';
  $('mealChatPhotoGrams').value=mode==='package'?100:200;
  const revision=photoRevision;
  try{
   const onProgress=message=>{if(revision===photoRevision)photoFeedback(message)};
   const result=mode==='smart'
    ?await window.LifeSimsMealPhoto.analyzeSmart(photoFile,onProgress)
    :mode==='package'?await window.LifeSimsMealPhoto.analyzePackage(photoFile,onProgress)
    :await window.LifeSimsMealPhoto.analyzeFood(photoFile,onProgress);
   if(revision===photoRevision)showPhotoResult(result);
  }catch(e){
   if(revision===photoRevision)photoFeedback('⚠ '+e.message+' Можно ввести название и порцию вручную. Фото останется прикреплённым.');
  }finally{
   if(revision===photoRevision){
    photoBusy=false;$('mealChatAnalyzeFood').disabled=false;$('mealChatAnalyzePackage').disabled=false;
   }
  }
 }
 async function recognizeSmartPhoto(file){
   if(!file)return;
   if(!editingId){$('mealChatInput').value='';renderSuggestions()}
   await attachPhoto(file);
   if(photoFile===file)await analyzePhoto('smart');
  }
 async function acceptLiveFrame(file,result){
  if(!file||!result)return;
  if(!editingId){$('mealChatInput').value='';renderSuggestions()}
  await attachPhoto(file);
  if(photoFile===file)showPhotoResult(result);
 }
 async function findBarcode(){
  if(photoBusy)return;
  const code=$('mealChatBarcodeValue').value.replace(/[^0-9]/g,'');
  if(!/^\d{8,14}$/.test(code)){photoFeedback('Введи 8–14 цифр штрихкода.');return}
  const revision=photoRevision;photoBusy=true;$('mealChatFindBarcode').disabled=true;
  try{
   photoFeedback('Ищу продукт в Open Food Facts…');
   const result=await window.LifeSimsMealPhoto.productByBarcode(code);
   if(revision===photoRevision){photoMode='package';showPhotoResult(result)}
  }catch(e){if(revision===photoRevision)photoFeedback('⚠ '+e.message)}
  finally{photoBusy=false;$('mealChatFindBarcode').disabled=false}
 }
 function logMeal(event){
  event.preventDefault();const input=$('mealChatInput').value.trim();
  if(!input){status('Введи, что ты съела или выпила.');return}
  const parsed=parseInput(input);
  if(!parsed.title){status('Укажи название блюда.');return}
  const existing=editingId?bridge.list().find(m=>m.id===editingId):null;
  if(editingId&&!existing){status('⚠ Редактируемая запись больше не существует.');return}
  const time=$('mealChatTime').value;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){
   status('⚠ Укажи время в формате ЧЧ:ММ (00:00–23:59).');$('mealChatTime').focus();return
  }
  // Changing only the clock must preserve the exact saved nutrition, source,
  // barcode, photo, and ID. Do not run a new estimation for an unchanged meal.
  const originalText=existing?(existing.title+(existing.ingredients?': '+existing.ingredients:'')):'';
  if(existing&&!photoFile&&!photoData&&input===originalText){
   try{
    bridge.upsert({...existing,date:currentDate(),time});
    editingId=null;$('mealChatInput').value='';resetPhoto();resetTime();
    tabChanged('text');renderSuggestions();legacy.render?.();
    status('✓ Время приёма «'+existing.title+'» изменено на '+time+'. Калории и БЖУ не изменились.');
   }catch(e){status('⚠ '+e.message)}
   return;
  }
  const match=templates().find(t=>norm(t.title)===norm(parsed.title));
  const hasNewIngredients=!!parsed.ingredients;
  const ingredientText=hasNewIngredients?parsed.ingredients:
   (match?.ingredients||(existing&&norm(existing.title)===norm(parsed.title)?existing.ingredients:'')||'');
  const canonicalTitle=!hasNewIngredients&&match?.title?match.title:parsed.title;
  if(photoBusy){status('Дождись завершения распознавания фото.');return}
  const gramsFromPhoto=(photoFile||photoData?.kind==='package')?Number($('mealChatPhotoGrams').value):null;
  if((photoFile||photoData?.kind==='package')&&(!Number.isFinite(gramsFromPhoto)||gramsFromPhoto<1||gramsFromPhoto>10000)){
   status('Укажи, сколько граммов ты съела (от 1 до 10 000).');return
  }
  const estimate=legacy.estimate(canonicalTitle+(ingredientText?', '+ingredientText:''),gramsFromPhoto||(!hasNewIngredients&&match?.grams)||existing?.grams||null);
  const fromPackage=photoData?.kind==='package';
  const usePrevious=!photoFile&&!!match&&!hasNewIngredients&&match.kcal!=null;
  const nutrition=fromPackage?Object.fromEntries(['kcal','protein','fat','carbs'].map(k=>[
   k,photoData.per100?.[k]==null?null:Math.round(photoData.per100[k]*gramsFromPhoto/100*10)/10
  ])):(usePrevious?match:estimate);
  try{
   bridge.upsert({
    id:existing?.id,date:currentDate(),time,title:canonicalTitle,ingredients:ingredientText,
    grams:(photoFile||fromPackage)?gramsFromPhoto:(nutrition.grams??estimate.grams),
    kcal:fromPackage?nutrition.kcal:(nutrition.kcal??estimate.kcal),
    protein:fromPackage?nutrition.protein:(nutrition.protein??estimate.protein),
    fat:fromPackage?nutrition.fat:(nutrition.fat??estimate.fat),
    carbs:fromPackage?nutrition.carbs:(nutrition.carbs??estimate.carbs),
    estimate:!fromPackage||photoData.source!=='Open Food Facts',
    method:photoFile?'photo':fromPackage?'catalog':'text',remember:true,templateTitle:canonicalTitle,
    photoThumb:photoFile?photoThumbnail:(existing?.photoThumb??null),
    photoSource:photoData?.kind==='meal'?(photoData.source+' — название, БЖУ: ориентировочный расчёт LifeSims'):
     photoData?.source||(photoFile?'Фото без результата распознавания':usePrevious?(match?.photoSource||'Сохранённая порция LifeSims'):existing?.photoSource||'Ориентировочный расчёт LifeSims'),
    barcode:photoData?.barcode||existing?.barcode||null
   });
   $('mealChatInput').value='';editingId=null;const savedFromPhoto=!!photoFile;
   const source=photoData?.source||'ручная подпись к фото';
   resetPhoto();resetTime();tabChanged('text');renderSuggestions();
   status('✓ '+canonicalTitle+' сохранено за '+currentDate()+'. '+
    (savedFromPhoto?'Фото: '+source+'. Проверь ориентировочные калории.':
    usePrevious?'Использована сохранённая порция.':estimate.confidence+'.'));
  }catch(e){status('⚠ '+e.message)}
 }
 function closeChat(){
  if(node.hidden)return;
  node.hidden=true;resetPhoto();document.body.style.overflow=bodyScrollBefore;
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
  editingId=null;resetPhoto();resetTime();$('mealChatInput').value='';status('');node.hidden=false;tabChanged('text');
  const meal=mealId?bridge.list().find(m=>m.id===mealId):null;
  if(meal)startEdit(meal);else $('mealChatInput').focus({preventScroll:true});
 }
 node.addEventListener('click',e=>{if(e.target===node)closeChat()});
 $('mealChatBack').onclick=closeChat;
 $('mealChatDetailed').onclick=()=>openDetailed(currentDate(),editingId);
 $('mealChatDate').addEventListener('change',()=>{editingId=null;resetPhoto();resetTime();$('mealChatInput').value='';status('');tabChanged('text')});
 $('mealChatCamera').onclick=()=>$('mealChatCameraInput').click();
 $('mealChatGallery').onclick=()=>$('mealChatGalleryInput').click();
 $('mealChatCameraInput').onchange=()=>attachPhoto($('mealChatCameraInput').files?.[0]);
 $('mealChatGalleryInput').onchange=()=>attachPhoto($('mealChatGalleryInput').files?.[0]);
 $('mealChatAnalyzeFood').onclick=()=>analyzePhoto('meal');
 $('mealChatAnalyzePackage').onclick=()=>analyzePhoto('package');
 $('mealChatFindBarcode').onclick=findBarcode;
 $('mealChatPhotoRemove').onclick=()=>{resetPhoto();status('Фото убрано.')};
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
 async function recognizeMealPhoto(file){
  if(!file)return;
  if(!editingId){$('mealChatInput').value='';renderSuggestions()}
  await attachPhoto(file);
  if(photoFile===file)await analyzePhoto('meal');
 }
 async function recognizePackagePhoto(file){
  if(!file)return;
  if(!editingId){$('mealChatInput').value='';renderSuggestions()}
  await attachPhoto(file);
  if(photoFile===file)await analyzePhoto('package');
 }
 function draftMeal(text){
  $('mealChatInput').value=String(text||'').slice(0,850);
  editingId=null;tabChanged('text');renderSuggestions();
  status('Проверь название, состав и порцию перед сохранением.');
 }
 window.LifeSimsMealChat={open:openChat,close:closeChat,setProduct:showPhotoResult,recognizeSmartPhoto,recognizeMealPhoto,recognizePackagePhoto,acceptLiveFrame,chooseTemplate,draftMeal};
})();
