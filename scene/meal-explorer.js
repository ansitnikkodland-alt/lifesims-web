/* FatSecret-inspired LifeSims food finder.
   All food values are attributed to their actual source; no FatSecret data is copied. */
(function(){
 'use strict';
 const host=document.getElementById('mealChat');
 const B=window.LifeSimsFoodBridge,chat=window.LifeSimsMealChat,photo=window.LifeSimsMealPhoto;
 if(!host||!B||!chat||!photo)return;
 const $=id=>document.getElementById(id);
 const button=(text,cls='')=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;return b};
 const el=(tag,cls='',text='')=>{const x=document.createElement(tag);x.className=cls;x.textContent=text;return x};
 const norm=x=>String(x||'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
 const shell=host.querySelector('.meal-chat-sheet');
 const opener=button('🔍 Найти еду · продукты, недавние и сохранённые','fs-food-launch');
 const capture=host.querySelector('.meal-smart-capture');
 if(capture)capture.before(opener);else shell.querySelector('.meal-chat-compose')?.prepend(opener);
 const explorer=document.createElement('section');explorer.id='fsFoodExplorer';
 explorer.className='fs-food-explorer';explorer.hidden=true;
 explorer.setAttribute('aria-label','Поиск и добавление еды');
 explorer.innerHTML=[
  '<header class="fs-fe-head"><button id="fsFeBack" type="button" aria-label="Назад к записи питания">‹</button>',
  '<div><strong>Найти еду</strong><small id="fsFeDay">Выбор продукта</small></div>',
  '<button id="fsFeToEntry" type="button">Запись еды</button></header>',
  '<nav id="fsFeTabs" class="fs-fe-tabs" aria-label="Разделы поиска еды">',
  '<button data-view="search" type="button">ЕДА</button><button data-view="recent" type="button">НЕДАВНИЕ</button>',
  '<button data-view="most" type="button">ЧАСТЫЕ</button><button data-view="saved" type="button">СОХРАНЁННЫЕ</button></nav>',
  '<div id="fsFeSearchRow" class="fs-fe-search-row"><input id="fsFeSearch" type="search" placeholder="Продукт, бренд или штрихкод" aria-label="Название продукта или штрихкод">',
  '<button id="fsFeFind" type="button">Найти</button></div>',
  '<p id="fsFeStatus" class="fs-fe-status" role="status" aria-live="polite"></p>',
  '<div id="fsFeResults" class="fs-fe-results"></div>',
  '<details class="fs-fe-provenance"><summary>Откуда берутся калории и БЖУ?</summary>',
  '<p>🔎 <strong>Open Food Facts</strong> — открытая пользовательская база продуктов по названию и штрихкоду. Карточки могут содержать ошибки — сравни с этикеткой.</p>',
  '<p>🥗 <strong>FatSecret</strong> — официальная платформа пищевых данных. В бесплатном API доступен каталог США. Результаты показываются временно; проверь порцию и БЖУ перед записью.</p>',
  '<p>📋 <strong>OCR этикетки</strong> — чтение текста на устройстве, а не проверка производителем. Проверь цифры.</p>',
  '<p>📸 <strong>Food‑101</strong> — локальная модель, предполагает название блюда из 101 категории; не измеряет порцию и не знает БЖУ.</p>',
  '<p>✎ <strong>LifeSims</strong> — ориентировочный расчёт по введённому названию, не справка изготовителя.</p>',
  '<a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Открыть базу Open Food Facts</a></details>',
  '<footer class="fs-fe-footer">',
  '<button id="fsFePhoto" type="button" aria-label="Сфотографировать еду"><span>📷</span><small>Фото еды</small></button>',
  '<button id="fsFeSmart" type="button" aria-label="Распознать фото упаковки или этикетки"><span>✨</span><small>Этикетка</small></button>',
  '<button id="fsFeBarcode" type="button" aria-label="Сканировать штрихкод"><span>▥</span><small>Штрихкод</small></button>',
  '<button id="fsFeVoice" type="button" aria-label="Ввести еду голосом"><span>🎙</span><small>Голос</small></button>',
  '</footer><input id="fsFePhotoInput" type="file" accept="image/*" capture="environment" hidden>',
  '<input id="fsFeLabelInput" type="file" accept="image/*" capture="environment" hidden>'
 ].join('');
 shell.append(explorer);
 const statuses={search:'Поиск по Open Food Facts и FatSecret (каталог США).',
  recent:'Продукты, которые ты уже записывала. Хранятся в LifeSims.',
  most:'Самые часто записываемые блюда из твоего дневника.',
  saved:'Сохранённые тобой любимые продукты и блюда.'};
 let view='search',lastSearch='',resultCache=[],fatSecretResults=[],searchVersion=0,busy=false;
 const API='https://lifesims-family-test-api.onrender.com/v1/food/fatsecret';
 async function fatSecretRequest(path,params={}){
  const url=API+'/'+path+'?'+new URLSearchParams(params);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),72000);
  try{
   const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},
    signal:controller.signal,cache:'no-store',credentials:'omit'});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(String(body.error||'HTTP '+response.status).slice(0,180));
   return body;
  }catch(error){
   if(error?.name==='AbortError')throw Error('Сервер FatSecret не ответил (Render Free может долго просыпаться)');
   throw error;
  }finally{clearTimeout(timer)}
 }
 function setStatus(text){$('fsFeStatus').textContent=text||''}
 function toEntry(){
  explorer.hidden=true;
  $('mealChatInput')?.focus({preventScroll:true});
 }
 function switchView(next){
  view=next;searchVersion++;
  for(const btn of $('fsFeTabs').querySelectorAll('button')){
   btn.classList.toggle('active',btn.dataset.view===view);
   btn.setAttribute('aria-current',btn.dataset.view===view?'page':'false');
  }
  $('fsFeSearchRow').hidden=view!=='search';
  setStatus(statuses[view]);
  render();
 }
 function open(tab='search'){
  if(host.hidden)chat.open();
  explorer.hidden=false;
  $('fsFeDay').textContent='📅 '+($('mealChatDate')?.value||B.today());
  switchView(tab);
  if(tab==='search')$('fsFeSearch').focus({preventScroll:true});
 }
 function listTemplates(){
  return B.listTemplates?.()||[];
 }
 function formatMacros(row,per100=false){
  const n=per100?(row.per100||{}):row;
  const bits=[];
  if(n.kcal!=null)bits.push(Math.round(Number(n.kcal))+' ккал'+(per100?' / 100 г':''));
  for(const [key,label] of [['protein','Б'],['fat','Ж'],['carbs','У']])
   if(n[key]!=null)bits.push(label+' '+Number(n[key]).toFixed(1).replace(/\.0$/,''));
  return bits.length?bits.join(' · '):'Калории и БЖУ неизвестны';
 }
 function foodRow(item,type='local'){
  const row=el('div','fs-fe-row');
  const pick=button('','fs-fe-pick');
  const title=el('strong','',item.title||'Без названия');
  const detail=el('small','',type==='catalog'
   ?formatMacros(item,true)+' · Open Food Facts, пользовательская база'
   :type==='fatsecret'?item.description+' · FatSecret (США)'
   :formatMacros(item)+(item.grams?' · '+item.grams+' г':'')+' · Дневник LifeSims');
  pick.append(title,detail);
  if(type==='catalog'){
   const cite=el('small','fs-fe-source','Источник: Open Food Facts'+(item.barcode?' · '+item.barcode:''));
   pick.append(cite);
   pick.onclick=()=>{
    chat.setProduct(item);
    toEntry();
    $('mealChatPhotoPanel')?.scrollIntoView({block:'nearest'});
   };
  }else if(type==='fatsecret'){
   const cite=el('small','fs-fe-source','Источник: FatSecret Platform API · США · ID '+item.foodId);
   pick.append(cite);
   pick.onclick=async()=>{
    pick.disabled=true;setStatus('Получаю порции из FatSecret…');
    try{
     const response=await fatSecretRequest('item',{foodId:item.foodId});
     const food=response.food;
     if(!food||!food.per100){
      setStatus('FatSecret не предоставил порцию в граммах. Выбери другой продукт или введи БЖУ по упаковке вручную.');
      pick.disabled=false;return;
     }
     chat.setProduct({kind:'package',source:'FatSecret (каталог США)',title:food.title,
      per100:food.per100,gramsEstimate:food.gramsEstimate,portionUnit:food.portionUnit,
      confidence:food.confidence,ingredients:'',details:food.servings?.[0]?.serving||''});
     toEntry();
    }catch(error){setStatus('⚠ FatSecret: '+error.message)}
    finally{pick.disabled=false}
   };
  }else{
   pick.onclick=()=>{chat.chooseTemplate(item);toEntry()};
  }
  row.append(pick);
  if(type==='local'){
   const star=button(item.favorite?'★':'☆','fs-fe-star');
   star.setAttribute('aria-label',item.favorite?'Убрать из сохранённых':'Сохранить еду');
   star.setAttribute('aria-pressed',item.favorite?'true':'false');
   star.onclick=()=>{
    try{B.setTemplateFavorite(item.title,!item.favorite);render();setStatus('Сохранённые продукты обновлены.')}
    catch(error){setStatus('⚠ '+error.message)}
   };
   row.append(star);
  }
  return row;
 }
 function render(){
  const box=$('fsFeResults');box.replaceChildren();
  if(view==='search'){
   const term=norm($('fsFeSearch').value);
   const locals=term?listTemplates().filter(t=>norm(t.title).includes(term)||norm(t.ingredients).includes(term)).slice(0,16):[];
   if(locals.length){
    box.append(el('h3','','Из твоего дневника'));
    locals.forEach(x=>box.append(foodRow(x)));
   }
   if(resultCache.length&&lastSearch===term){
    box.append(el('h3','','Open Food Facts — разные страны'));
    resultCache.forEach(p=>box.append(foodRow(p,'catalog')));
   }
   if(fatSecretResults.length&&lastSearch===term){
    box.append(el('h3','','FatSecret — США'));
    fatSecretResults.forEach(p=>box.append(foodRow(p,'fatsecret')));
   }
   if(!locals.length&&!(resultCache.length&&lastSearch===term)&&!(fatSecretResults.length&&lastSearch===term))
    box.append(el('p','fs-fe-empty',term?'Нажми «Найти», чтобы искать в обеих базах.':'Введи название продукта, бренд или штрихкод.'));
   return;
  }
  const templates=listTemplates();
  let selected=[];
  if(view==='recent')selected=templates.sort((a,b)=>String(b.lastUsedAt||'').localeCompare(String(a.lastUsedAt||'')));
  else if(view==='most')selected=templates.sort((a,b)=>(Number(b.useCount)||0)-(Number(a.useCount)||0)||String(b.lastUsedAt||'').localeCompare(String(a.lastUsedAt||'')));
  else selected=templates.filter(x=>x.favorite).sort((a,b)=>String(b.lastUsedAt||'').localeCompare(String(a.lastUsedAt||'')));
  if(!selected.length)box.append(el('p','fs-fe-empty',view==='saved'?'Нажми ☆ у блюда в «Недавних», чтобы сохранить его.':'Здесь появятся продукты после первой записи в дневник.'));
  selected.slice(0,150).forEach(x=>box.append(foodRow(x)));
 }
 async function search(){
  if(busy)return;
  const query=$('fsFeSearch').value.trim();
  if(query.length<2){setStatus('Введи минимум два символа или штрихкод.');return}
  busy=true;$('fsFeFind').disabled=true;
  const generation=++searchVersion,normalized=norm(query);
  resultCache=[];fatSecretResults=[];lastSearch=normalized;
  setStatus('Ищу «'+query+'» в Open Food Facts и FatSecret (США)…');
  const numeric=query.replace(/\\D/g,'');
  const barcode=numeric===query&&/^\\d{8,14}$/.test(numeric);
  // Search only name queries in FatSecret Basic; paid barcode scanning is
  // deliberately not used. Open Food Facts handles barcode lookups.
  const requests=[
   (async()=>{
    const data=barcode?[await photo.productByBarcode(numeric)]:await photo.searchProducts(query);
    if(generation===searchVersion&&!explorer.hidden){
     resultCache=data.filter(Boolean);render();
     setStatus('Open Food Facts: '+resultCache.length+' результатов. '+(barcode?'Штрихкод ищется только здесь.':'Ожидаю FatSecret…'));
    }
    return true;
   })()
  ];
  if(!barcode)requests.push((async()=>{
   const data=await fatSecretRequest('search',{query});
   if(generation===searchVersion&&!explorer.hidden){
    fatSecretResults=Array.isArray(data.foods)?data.foods:[];
    render();
    setStatus('Open Food Facts: '+resultCache.length+' · FatSecret США: '+fatSecretResults.length+
     '. Выбери продукт и проверь порцию. Источники указаны отдельно.');
   }
   return true;
  })());
  const settled=await Promise.allSettled(requests);
  if(generation===searchVersion&&!explorer.hidden){
   const failures=settled.filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||'Ошибка каталога'));
   if(failures.length)setStatus('Найдено: Open Food Facts '+resultCache.length+
    ', FatSecret '+fatSecretResults.length+'. '+failures.join(' · '));
   else if(!resultCache.length&&!fatSecretResults.length)setStatus('Совпадений нет. Попробуй другое название, бренд или язык.');
  }
  busy=false;$('fsFeFind').disabled=false;
 }
 async function selectedPhoto(event,kind){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  toEntry();
  if(kind==='food')await chat.recognizeMealPhoto(file);
  else await chat.recognizePackagePhoto(file);
 }
 $('fsFeBack').onclick=toEntry;
 $('fsFeToEntry').onclick=toEntry;
 opener.onclick=()=>open('search');
 for(const tab of $('fsFeTabs').querySelectorAll('button'))tab.onclick=()=>switchView(tab.dataset.view);
 $('fsFeSearch').addEventListener('input',()=>{if(norm($('fsFeSearch').value)!==lastSearch){resultCache=[];fatSecretResults=[]}render()});
 $('fsFeSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search()}});
 $('fsFeFind').onclick=search;
 $('fsFePhoto').onclick=()=>$('fsFePhotoInput').click();
 $('fsFeSmart').onclick=()=>$('fsFeLabelInput').click();
 $('fsFePhotoInput').onchange=event=>selectedPhoto(event,'food');
 $('fsFeLabelInput').onchange=event=>selectedPhoto(event,'label');
 $('fsFeBarcode').onclick=()=>{toEntry();$('mealLookupScanOpen')?.click()};
 $('fsFeVoice').onclick=()=>{
  const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Rec){toEntry();setTimeout(()=>$('mealChatInput')?.focus(),0);return}
  try{
   const recognition=new Rec();recognition.lang='ru-RU';recognition.interimResults=false;
   setStatus('Говори название и порцию. Голосовое распознавание может использовать сервис браузера.');
   recognition.onresult=e=>{
    const words=e.results?.[0]?.[0]?.transcript||'';
    if(words){chat.draftMeal(words);toEntry()}
   };
   recognition.onerror=e=>setStatus('Не удалось распознать голос: '+(e.error||'ошибка'));
   recognition.start();
  }catch(error){setStatus('Микрофон недоступен: '+error.message)}
 };
 host.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!explorer.hidden){event.stopPropagation();toEntry()}
 });
 window.LifeSimsFoodExplorer={open,close:toEntry,render};
})();
