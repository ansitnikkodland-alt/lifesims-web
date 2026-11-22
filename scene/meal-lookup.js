/* LifeSims food lookup: product search, live barcode scanner, editable nutrition label. */
(function(){
 'use strict';
 const host=document.getElementById('mealChat');
 const photo=window.LifeSimsMealPhoto,chat=window.LifeSimsMealChat;
 if(!host||!photo||!chat)return;
 const $=id=>document.getElementById(id);
 const smartCapture=document.createElement('div');
 smartCapture.className='meal-smart-capture';
 smartCapture.innerHTML='<button type="button" id="mealSmartCapture" aria-expanded="false" aria-controls="mealSmartSources">📷 Распознать фото или штрихкод</button>'+
  '<div id="mealSmartSources" class="meal-smart-sources" role="group" aria-label="Источник фотографии" hidden>'+
  '<button type="button" id="mealSmartTakePhoto">📸 Сделать фото</button>'+
  '<button type="button" id="mealSmartChoosePhoto">🖼 Выбрать из галереи</button></div>'+
  '<input type="file" id="mealSmartCameraInput" accept="image/*" capture="environment" hidden>'+
  '<input type="file" id="mealSmartGalleryInput" accept="image/*" hidden>'+
  '<small>Определю автоматически: еда, этикетка или штрихкод.</small>';
 $('mealChatPhotoActions').insertAdjacentElement('beforebegin',smartCapture);
 const html=[
  '<div class="meal-lookup-shortcuts">',
  '<button type="button" id="mealLookupSearchOpen">🔎 Найти продукт</button>',
  '<button type="button" id="mealLookupScanOpen">▥ Сканировать</button>',
  '<button type="button" id="mealLookupLabelOpen">📋 Этикетка</button>',
  '</div>'
 ].join('');
 $('mealChatPhotoActions').insertAdjacentHTML('beforebegin',html);
 $('mealChatPhotoActions').insertAdjacentHTML('afterend',[
  '<section id="mealLookupPanel" class="meal-lookup-panel" hidden aria-label="Поиск упакованных продуктов">',
  '<label for="mealLookupName">Название или бренд</label>',
  '<div class="meal-lookup-line"><input id="mealLookupName" type="search" autocomplete="off" placeholder="Например: творог 5%"><button id="mealLookupFindName" type="button">Найти</button></div>',
  '<label for="mealLookupBarcode">Штрихкод с упаковки</label>',
  '<div class="meal-lookup-line"><input id="mealLookupBarcode" type="text" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="8–14 цифр"><button id="mealLookupFindCode" type="button">По коду</button></div>',
  '<div id="mealLookupScanner" hidden><video id="mealLookupVideo" playsinline autoplay muted aria-label="Камера для штрихкода"></video>',
  '<p>Наведи камеру на штрихкод. Если сканер не работает, сфотографируй этикетку или введи цифры вручную.</p>',
  '<button id="mealLookupStop" type="button">Закрыть камеру</button></div>',
  '<div id="mealLookupResults" class="meal-lookup-results" aria-live="polite"></div>',
  '<button id="mealLookupDismiss" class="meal-lookup-close" type="button">Скрыть поиск</button>',
  '</section>'
 ].join(''));
 $('mealChatSuggestions').insertAdjacentHTML('beforebegin',[
  '<section id="mealLookupNutrition" class="meal-lookup-nutrition" hidden>',
  '<strong id="mealLookupTitle">Продукт</strong><small id="mealLookupSource"></small>',
  '<label class="meal-lookup-portion">Съедено, г <input id="mealLookupGrams" type="number" min="1" max="10000" step="1" value="100"></label>',
  '<p>Пищевая ценность на 100 г (для напитков — проверь единицы измерения):</p>',
  '<div class="meal-lookup-macros">',
  '<label>Ккал <input id="mealLookupKcal" type="number" min="0" max="20000" step="any" placeholder="—"></label>',
  '<label>Белки, г <input id="mealLookupProtein" type="number" min="0" max="1000" step="any" placeholder="—"></label>',
  '<label>Жиры, г <input id="mealLookupFat" type="number" min="0" max="1000" step="any" placeholder="—"></label>',
  '<label>Углеводы, г <input id="mealLookupCarbs" type="number" min="0" max="1000" step="any" placeholder="—"></label>',
  '</div><p class="meal-lookup-disclaimer">Пустое поле означает «неизвестно», а не ноль. Проверь значения по упаковке.</p>',
  '<p id="mealLookupDetected" hidden></p>',
  '<details id="mealLookupRawDetails" hidden><summary>Распознанный текст этикетки</summary><pre id="mealLookupRawText"></pre></details>',
  '<button id="mealLookupClear" type="button">Убрать данные продукта</button>',
  '</section>'
 ].join(''));
 const nutritionKeys={kcal:'mealLookupKcal',protein:'mealLookupProtein',fat:'mealLookupFat',carbs:'mealLookupCarbs'};
 let selected=null,searching=false,scanGeneration=0,stopCamera=null,autoLabel=false;
 function status(message){$('mealChatStatus').textContent=message;$('mealChatStatus').hidden=!message}
 function hidePanel(){stopScan();$('mealLookupPanel').hidden=true}
 function showPanel(){ $('mealLookupPanel').hidden=false }
 function stopScan(){
  scanGeneration++;
  if(stopCamera){try{stopCamera()}catch(_){ }stopCamera=null}
  $('mealLookupScanner').hidden=true;
 }
 function select(product){
  if(!product)return;
  selected=product;
  chat.setProduct(product);
  hidePanel();
  status('✓ '+(product.title||'Этикетка')+'. Проверь БЖУ и размер порции, затем нажми ➤.');
 }
 function reset(){
  selected=null;stopScan();
  $('mealLookupRawDetails').hidden=true;$('mealLookupDetected').hidden=true;
  $('mealLookupPanel').hidden=true;
  $('mealLookupNutrition').hidden=true;
  $('mealLookupResults').replaceChildren();
  $('mealChatPhotoGrams').value=200;
  const oldPortion=$('mealChatPhotoGrams').closest('.meal-chat-photo-portion');
  if(oldPortion)oldPortion.hidden=false;
 }
 function onPhotoResult(result){
  if(result.kind!=='package'){
   selected=null;$('mealLookupNutrition').hidden=true;return;
  }
  selected=result;
  $('mealLookupNutrition').hidden=false;
  $('mealLookupTitle').textContent=result.title||'Название не определено — введи его вручную';
  $('mealLookupSource').textContent='Источник: '+result.source+'. '+result.confidence;
  $('mealLookupGrams').value=100;$('mealChatPhotoGrams').value=100;
  const oldPortion=$('mealChatPhotoGrams').closest('.meal-chat-photo-portion');
  if(oldPortion)oldPortion.hidden=true;
  const rawText=String(result.labelText||'').trim();
  $('mealLookupRawDetails').hidden=!rawText;
  $('mealLookupRawText').textContent=rawText;
  const rawN=result.detectedNutrition||{},needBasis=!result.per100;
  const found=Object.entries(rawN).filter(([key,value])=>value!=null);
  const labels={kcal:'ккал',protein:'белки',fat:'жиры',carbs:'углеводы'};
  const note=$('mealLookupDetected');
  note.hidden=!needBasis||!found.length;
  if(!note.hidden)note.textContent='На фото прочитано: '+found.map(([key,value])=>labels[key]+': '+value).join(' · ')+
   '. Основа (на 100 г/мл) не определена — значения не сохранены автоматически.';
  if(result.barcode)$('mealLookupBarcode').value=result.barcode;
  if(result.title)$('mealLookupName').value=result.title;
  for(const [key,id] of Object.entries(nutritionKeys)){
   $(id).value=result.per100?.[key]??'';
  }
 }
 async function doNameSearch(){
  if(searching)return;
  const name=$('mealLookupName').value.trim();
  if(name.length<2){status('Введите хотя бы два символа названия.');return}
  searching=true;$('mealLookupFindName').disabled=true;
  $('mealLookupResults').replaceChildren();
  status('Поиск «'+name+'» в Open Food Facts…');
  try{
   const products=await photo.searchProducts(name);
   if(host.hidden)return;
   const list=$('mealLookupResults');
   if(!products.length)list.textContent='Совпадений нет. Попробуй другую формулировку или сфотографируй этикетку.';
   for(const product of products){
    const button=document.createElement('button');button.type='button';button.className='meal-lookup-result';
    const title=document.createElement('strong');title.textContent=product.title;
    const extra=document.createElement('small');
    extra.textContent=(product.details||product.barcode||'')+' · '+(product.per100?.kcal==null?'Ккал неизвестны':product.per100.kcal+' ккал / 100 г');
    button.append(title,extra);button.onclick=()=>select(product);list.append(button);
   }
   status(products.length?'Выбери точный продукт из '+products.length+' совпадений.':'Продукт не найден в этом каталоге.');
  }catch(error){status('⚠ '+error.message)}
  finally{searching=false;$('mealLookupFindName').disabled=false}
 }
 async function findCode(code){
  if(searching)return;
  code=String(code||'').replace(/\D/g,'');
  if(!/^\d{8,14}$/.test(code)){status('Введите 8–14 цифр штрихкода.');return}
  searching=true;$('mealLookupFindCode').disabled=true;
  status('Поиск по штрихкоду '+code+'…');
  try{
   const product=await photo.productByBarcode(code);
   if(!host.hidden)select(product);
  }catch(error){status('⚠ '+error.message+'. Можно воспользоваться поиском по названию или этикеткой.')}
  finally{searching=false;$('mealLookupFindCode').disabled=false}
 }
 async function openScanner(){
  showPanel();stopScan();
  const generation=scanGeneration;
  $('mealLookupScanner').hidden=false;
  status('Разреши камеру и наведи её на штрихкод. Ни фото, ни видеопоток не загружаются в LifeSims.');
  try{
   const stopper=await photo.startBarcodeScanner($('mealLookupVideo'),
    code=>{if(generation!==scanGeneration||host.hidden)return;
      stopScan();$('mealLookupBarcode').value=code;findCode(code)},
    error=>{if(generation===scanGeneration)status('⚠ Камера недоступна: '+error.message+'. Код можно ввести вручную.')}
   );
   if(generation!==scanGeneration||host.hidden){stopper();return}
   stopCamera=stopper;
  }catch(error){
   if(generation===scanGeneration){
    $('mealLookupScanner').hidden=true;
    status('⚠ Сканер недоступен: '+error.message+'. Попробуй фото этикетки или ввод штрихкода.');
   }
  }
 }
 function toggleSmartSources(force){
  const panel=$('mealSmartSources');
  const expanded=typeof force==='boolean'?force:panel.hidden;
  panel.hidden=!expanded;
  $('mealSmartCapture').setAttribute('aria-expanded',expanded?'true':'false');
 }
 $('mealSmartCapture').onclick=()=>toggleSmartSources();
 $('mealSmartTakePhoto').onclick=()=>{
  toggleSmartSources(false);
  // On Android this camera-facing capture input asks the browser to launch the camera.
  $('mealSmartCameraInput').click();
 };
 $('mealSmartChoosePhoto').onclick=()=>{
  toggleSmartSources(false);
  $('mealSmartGalleryInput').click();
 };
 async function photoSelected(event){
  const file=event.currentTarget.files?.[0];
  event.currentTarget.value='';
  toggleSmartSources(false);
  if(!file)return;
  hidePanel();
  await chat.recognizeSmartPhoto(file);
 }
 $('mealSmartCameraInput').addEventListener('change',photoSelected);
 $('mealSmartGalleryInput').addEventListener('change',photoSelected);
 document.addEventListener('click',event=>{
  if(!smartCapture.contains(event.target))toggleSmartSources(false);
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape')toggleSmartSources(false);
 });
 $('mealLookupSearchOpen').onclick=()=>{stopScan();showPanel();$('mealLookupName').focus()};
 $('mealLookupScanOpen').onclick=openScanner;
 $('mealLookupStop').onclick=stopScan;
 $('mealLookupDismiss').onclick=hidePanel;
 $('mealLookupFindName').onclick=doNameSearch;
 $('mealLookupName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doNameSearch()}});
 $('mealLookupFindCode').onclick=()=>findCode($('mealLookupBarcode').value);
 $('mealLookupBarcode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findCode(e.target.value)}});
 $('mealLookupClear').onclick=()=>{
  selected=null;$('mealLookupNutrition').hidden=true;
  const row=$('mealChatPhotoGrams').closest('.meal-chat-photo-portion');if(row)row.hidden=false;
  // Preserve the recognized title as editable text, but remove the package nutrition.
  chat.setProduct({kind:'manual',source:'Ручной ввод',title:'',confidence:''});
  status('Пищевая ценность сброшена. Заполни запись вручную.');
 };
 $('mealLookupGrams').addEventListener('input',e=>{$('mealChatPhotoGrams').value=e.target.value});
 for(const [key,id] of Object.entries(nutritionKeys)){
  $(id).addEventListener('input',e=>{
   if(!selected)return;
   const value=e.target.value;
   if(!selected.per100)selected.per100={};
   selected.per100[key]=value===''?null:Number(value);
  });
 }
 $('mealLookupLabelOpen').onclick=()=>{
  autoLabel=true;
  $('mealChatCameraInput').click();
 };
 $('mealChatCamera').addEventListener('click',()=>{autoLabel=false});
 $('mealChatGallery').addEventListener('click',()=>{autoLabel=false});
 $('mealChatCameraInput').addEventListener('change',event=>{
  // Capture the selected file before attachPhoto resets the input's value.
  if(!autoLabel)return;
  const hasFile=!!event.target.files?.length;
  autoLabel=false;
  if(hasFile)queueMicrotask(()=>$('mealChatAnalyzePackage').click());
 },true);
 document.addEventListener('lifesims:meal-photo-reset',reset);
 document.addEventListener('lifesims:meal-product',event=>onPhotoResult(event.detail||{}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScan()});
})();
