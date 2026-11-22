/* LifeSims camera scan: continuous video, automatic barcode and meal classification. */
(function(){
 'use strict';
 const photo=window.LifeSimsMealPhoto, chat=window.LifeSimsMealChat;
 const launch=document.getElementById('mealSmartCapture');
 const gallery=document.getElementById('mealSmartGalleryInput');
 const host=document.getElementById('mealChat');
 if(!photo||!chat?.acceptLiveFrame||!launch||!gallery||!host)return;
 launch.textContent='📷 Распознать через камеру';
 launch.setAttribute('aria-expanded','false');
 launch.removeAttribute('aria-controls');
 const sources=document.getElementById('mealSmartSources');
 if(sources)sources.hidden=true;
 const modal=document.createElement('div');
 modal.id='mealLiveScan';modal.className='meal-live-mask';modal.hidden=true;
 modal.innerHTML=[
  '<section role="dialog" aria-modal="true" aria-labelledby="mealLiveTitle" class="meal-live-dialog">',
  '<div class="meal-live-head"><h2 id="mealLiveTitle">Умная камера</h2><button id="mealLiveClose" type="button" aria-label="Закрыть">✕</button></div>',
  '<div class="meal-live-view"><video id="mealLiveVideo" autoplay muted playsinline aria-label="Видеопоток камеры"></video><div class="meal-live-reticle" aria-hidden="true"></div><p class="meal-live-overlaid">Наведи на еду, этикетку или штрихкод</p></div>',
  '<div id="mealLiveStatus" role="status" aria-live="polite" class="meal-live-status">Запускаю камеру…</div>',
  '<div id="mealLiveResult" class="meal-live-result" hidden><strong id="mealLiveName"></strong><small id="mealLiveDetails"></small></div>',
  '<div class="meal-live-actions"><button type="button" id="mealLiveUse" disabled>Использовать результат</button>',
  '<button type="button" id="mealLiveAgain">Искать ещё</button><button type="button" id="mealLiveGallery">Галерея</button></div>',
  '<small class="meal-live-disclaimer">Автоматически анализируются кадры. Порция не измеряется камерой — проверь вес перед записью.</small>',
  '</section>'
 ].join('');
 document.body.append(modal);
 const $=id=>document.getElementById(id),video=$('mealLiveVideo');
 let stream=null,generation=0,frameTimer=null,barcodeTimer=null,selected=null,selectedFile=null,frameBusy=false;
 const say=message=>{if(!modal.hidden)$('mealLiveStatus').textContent=message};
 function clearResult(){
  selected=null;selectedFile=null;$('mealLiveUse').disabled=true;$('mealLiveResult').hidden=true;
 }
 function stop(){
  generation++;clearTimeout(frameTimer);clearTimeout(barcodeTimer);
  frameTimer=null;barcodeTimer=null;
  if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;video.pause();video.srcObject=null;modal.hidden=true;
  launch.setAttribute('aria-expanded','false');clearResult();
 }
 function frame(){
  if(!video.videoWidth||!video.videoHeight)return Promise.reject(Error('Нет изображения камеры.'));
  const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob
   ?resolve(new File([blob],'lifesims-camera.jpg',{type:'image/jpeg'}))
   :reject(Error('Не удалось получить кадр.')),'image/jpeg',.85));
 }
 function present(result,file){
  if(modal.hidden||selected||!result)return;
  if(result.kind==='meal'&&(!(result.candidates?.[0]?.score>=.3)))return;
  selected=result;selectedFile=file;
  $('mealLiveName').textContent=(result.kind==='package'?'📦 ':'🍽 ')+(result.title||result.candidates?.[0]?.title||'Название не определено');
  $('mealLiveDetails').textContent=(result.gramsEstimate
   ?(result.kind==='package'?'На упаковке: ':'Типичная порция ≈')+result.gramsEstimate+' '+(result.portionUnit||'г')+'. ':'')
   +'Проверь вес, название и пищевую ценность.';
  $('mealLiveResult').hidden=false;$('mealLiveUse').disabled=false;
  clearTimeout(frameTimer);clearTimeout(barcodeTimer);
  say('Обнаружено. Используй результат или продолжи сканирование.');
 }
 async function analyze(id){
  if(id!==generation||modal.hidden||selected||frameBusy)return;
  if(video.readyState<2){frameTimer=setTimeout(()=>analyze(id),600);return}
  frameBusy=true;
  try{
   const file=await frame();
   if(id!==generation||selected)return;
   const result=await photo.analyzeSmart(file,m=>{if(id===generation&&!selected)say(m)});
   if(id===generation&&!selected)present(result,file);
  }catch(err){if(id===generation&&!selected)say('Пробую другой кадр: '+(err?.message||'Ошибка распознавания'))}
  finally{
   frameBusy=false;
   if(id===generation&&!selected&&!modal.hidden)frameTimer=setTimeout(()=>analyze(id),4500);
  }
 }
 async function scanBarcodes(id){
  if(typeof BarcodeDetector==='undefined')return;
  let detector;
  try{
   const wanted=['ean_13','ean_8','upc_a','upc_e','code_128'];
   const supported=await BarcodeDetector.getSupportedFormats?.()||wanted;
   const formats=wanted.filter(v=>supported.includes(v));
   if(!formats.length)return;
   detector=new BarcodeDetector({formats});
  }catch(_){return}
  async function tick(){
   if(modal.hidden||selected||id!==generation)return;
   if(video.readyState>=2)try{
    const found=(await detector.detect(video)).find(v=>/^\d{8,14}$/.test(v.rawValue));
    if(found&&!selected&&id===generation){
     say('Штрихкод найден, получаю данные об упаковке…');
     const file=await frame(),code=found.rawValue;
     try{
      const result=await photo.productByBarcode(code);
      if(id===generation)present(result,file);
     }catch(_){
      // Unknown product: reuse the current image for OCR; no false calorie values.
      try{
       const result=await photo.analyzePackage(file,m=>{if(id===generation&&!selected)say(m)});
       if(id===generation)present(result,file);
      }catch(__){if(id===generation&&!selected)say('Товара нет в каталоге. Наведи камеру на его этикетку.')}
     }
    }
   }catch(_){}
   if(id===generation&&!selected&&!modal.hidden)barcodeTimer=setTimeout(tick,450);
  }
  tick();
 }
 function again(){
  if(modal.hidden)return;
  clearResult();const id=generation;
  say('Ищу следующий продукт или блюдо…');
  frameTimer=setTimeout(()=>analyze(id),300);scanBarcodes(id);
 }
 async function open(){
  stop();
  if(!navigator.mediaDevices?.getUserMedia){gallery.click();return}
  const id=generation;
  modal.hidden=false;launch.setAttribute('aria-expanded','true');
  say('Разреши доступ к камере.');$('mealLiveClose').focus({preventScroll:true});
  try{
   const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
   if(id!==generation||host.hidden){camera.getTracks().forEach(track=>track.stop());return}
   stream=camera;video.srcObject=camera;await video.play();
   if(id!==generation)return;
   say('Наведи камеру на еду, штрихкод или этикетку. Фотографировать не нужно.');
   scanBarcodes(id);frameTimer=setTimeout(()=>analyze(id),650);
  }catch(error){if(id===generation)say('Нет доступа к камере: '+(error?.name==='NotAllowedError'?'разрешение отклонено':error?.message||'ошибка')+'. Используй галерею.')}
 }
 launch.onclick=open;
 $('mealLiveClose').onclick=stop;
 $('mealLiveAgain').onclick=again;
 $('mealLiveGallery').onclick=()=>{stop();gallery.click()};
 $('mealLiveUse').onclick=async()=>{
  if(!selected||!selectedFile)return;
  const result=selected,file=selectedFile;stop();
  await chat.acceptLiveFrame(file,result);
 };
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!modal.hidden){event.stopImmediatePropagation();event.preventDefault();stop()}
 },true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!modal.hidden)stop()});
 window.addEventListener('pagehide',stop);
 new MutationObserver(()=>{if(host.hidden&&!modal.hidden)stop()}).observe(host,{attributes:true,attributeFilter:['hidden']});
 window.LifeSimsLiveCamera={open,close:stop};
})();