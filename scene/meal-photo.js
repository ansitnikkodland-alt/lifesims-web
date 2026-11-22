/* LifeSims v47: on-device food photo classification, package barcode and OCR. */
(function(){
'use strict';
const MODEL='onnx-community/swin-finetuned-food101-ONNX';
const LIB='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';
const OCR='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let foodPredictor=null,foodPredictorPromise=null,ocrPromise=null,zxingPromise=null;
const ZXING='https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';
async function zxing(){
 if(!zxingPromise)zxingPromise=import(ZXING).catch(error=>{zxingPromise=null;throw error});
 return zxingPromise;
}
const bounded=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const number=value=>{const v=Number(value);return Number.isFinite(v)&&v>=0&&v<=20000?v:null};
const report=(cb,message)=>{try{cb?.(message)}catch(_){}};
const RU={
 'pizza':'Пицца','sushi':'Суши','spaghetti_bolognese':'Спагетти болоньезе',
 'spaghetti_carbonara':'Спагетти карбонара','ramen':'Рамен','fried_rice':'Жареный рис',
 'omelette':'Омлет','scrambled_eggs':'Яичница-болтунья',
 'pancakes':'Блины','waffles':'Вафли','french_fries':'Картофель фри',
 'hamburger':'Бургер','hot_dog':'Хот-дог','chicken_wings':'Куриные крылышки',
 'greek_salad':'Греческий салат','caesar_salad':'Салат Цезарь','steak':'Стейк',
 'apple_pie':'Яблочный пирог','cheesecake':'Чизкейк','ice_cream':'Мороженое',
 'tiramisu':'Тирамису','lasagna':'Лазанья','macaroni_and_cheese':'Макароны с сыром',
 'chocolate_cake':'Шоколадный торт','beet_salad':'Свекольный салат',
 'dumplings':'Пельмени','guacamole':'Гуакамоле','risotto':'Ризотто',
 'spring_rolls':'Спринг-роллы','tacos':'Тако','nachos':'Начос',
 'donuts':'Пончики','donut':'Пончик','frozen_yogurt':'Замороженный йогурт',
 'grilled_salmon':'Лосось на гриле','fried_calamari':'Жареные кальмары',
 'fish_and_chips':'Рыба с картофелем фри','lobster_roll_sandwich':'Сэндвич с лобстером',
 'cup_cakes':'Кексы','hummus':'Хумус','falafel':'Фалафель',
 'pho':'Фо','bibimbap':'Пибимпап','miso_soup':'Мисо-суп',
 'chicken_curry':'Куриное карри','beef_tartare':'Тартар из говядины',
 'bread_pudding':'Хлебный пудинг','breakfast_burrito':'Буррито на завтрак'
};
async function compressedThumbnail(file){
 if(!file||!String(file.type).startsWith('image/'))throw Error('Выбери фотографию.');
 if(file.size>16*1024*1024)throw Error('Фото больше 16 МБ. Выбери файл меньшего размера.');
 const objectURL=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=objectURL;await img.decode();
  if(img.width*img.height>65_000_000)throw Error('Слишком большое изображение.');
  const factor=Math.min(1,180/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.floor(img.width*factor));canvas.height=Math.max(1,Math.floor(img.height*factor));
  canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
  for(const quality of [.62,.45,.3,.22]){
   const data=canvas.toDataURL('image/jpeg',quality);
   if(data.length<=21000)return data;
  }
  throw Error('Не удалось уменьшить фото для локального сохранения.');
 }finally{URL.revokeObjectURL(objectURL)}
}
async function barcodeFromPhoto(file){
 let bitmap;
 if(typeof BarcodeDetector!=='undefined'){
  try{
   const formats=['ean_13','ean_8','upc_a','upc_e','code_128'];
   const supported=typeof BarcodeDetector.getSupportedFormats==='function'
    ?await BarcodeDetector.getSupportedFormats():formats;
   const allowed=formats.filter(f=>supported.includes(f));
   if(allowed.length){
    bitmap=await createImageBitmap(file);
    const result=await new BarcodeDetector({formats:allowed}).detect(bitmap);
    const matched=result.find(r=>/^\\d{8,14}$/.test(r.rawValue));
    if(matched)return matched.rawValue;
   }
  }catch(_){}
  finally{bitmap?.close?.()}
 }
 // Older browsers have no BarcodeDetector; decode a still image with ZXing.
 let url;
 try{
  const {BrowserMultiFormatReader}=await zxing();
  const reader=new BrowserMultiFormatReader();
  url=URL.createObjectURL(file);
  const found=await reader.decodeFromImageUrl(url);
  const code=found?.getText?.()||'';
  return /^\\d{8,14}$/.test(code)?code:null;
 }catch(_){return null}
 finally{if(url)URL.revokeObjectURL(url)}
}
async function startBarcodeScanner(video,onCode,onError){
 let ended=false,stream=null,controls=null,frame=null;
 const stop=()=>{
  if(ended)return;ended=true;
  if(frame!=null)clearTimeout(frame);
  controls?.stop?.();
  stream?.getTracks?.().forEach(track=>track.stop());
  video.pause?.();video.srcObject=null;
 };
 const emit=code=>{
  if(ended||!/^\\d{8,14}$/.test(String(code||'')))return;
  stop();onCode(String(code));
 };
 try{
  if(typeof BarcodeDetector!=='undefined'&&navigator.mediaDevices?.getUserMedia){
   const formats=['ean_13','ean_8','upc_a','upc_e','code_128'];
   const supported=await BarcodeDetector.getSupportedFormats?.()||formats;
   const allowed=formats.filter(x=>supported.includes(x));
   if(allowed.length){
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
    if(ended){stop();return stop}
    video.srcObject=stream;await video.play();
    const detector=new BarcodeDetector({formats:allowed});
    const tick=async()=>{
     if(ended)return;
     try{
      const results=await detector.detect(video);
      const match=results.find(x=>/^\\d{8,14}$/.test(x.rawValue));
      if(match){emit(match.rawValue);return}
     }catch(_){}
     if(!ended)frame=setTimeout(tick,250);
    };
    tick();return stop;
   }
  }
  const {BrowserMultiFormatReader}=await zxing();
  const reader=new BrowserMultiFormatReader();
  controls=await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}}},video,
   result=>{if(result)emit(result.getText())});
  if(ended)controls?.stop?.();
  return stop;
 }catch(error){stop();onError?.(error);throw error}
}

const PRODUCT_FIELDS='code,product_name,product_name_ru,product_name_en,brands,ingredients_text,ingredients_text_ru,nutriments,quantity';
function normalizeProduct(p,code,source='Open Food Facts'){
 const n=p?.nutriments||{};
 const base=bounded(p?.product_name_ru||p?.product_name||p?.product_name_en||'',160);
 const brand=bounded(p?.brands||'',90);
 const title=base||brand;
 if(!title)return null;
 const kcal=number(n['energy-kcal_100g']);
 return {kind:'package',source,barcode:code||p.code||null,title:brand&&base&&!base.toLowerCase().includes(brand.toLowerCase())?base+' · '+brand:title,
  ingredients:bounded(p?.ingredients_text_ru||p?.ingredients_text||'',700),
  per100:{kcal,protein:number(n.proteins_100g),fat:number(n.fat_100g),carbs:number(n.carbohydrates_100g)},
  details:bounded(p?.quantity||'',120),
  confidence:'Данные пользовательской базы; сверь с этикеткой'};
}
async function fetchJSON(url,timeout=16000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw Error(response.status===429?'Слишком много запросов к каталогу. Повтори позже.':'Каталог продуктов недоступен (HTTP '+response.status+').');
  return await response.json();
 }catch(error){
  if(error.name==='AbortError')throw Error('Каталог не ответил вовремя. Проверь интернет.');
  throw error;
 }finally{clearTimeout(timer)}
}
async function productByBarcode(code){
 code=String(code||'').replace(/\\s/g,'');
 if(!/^\\d{8,14}$/.test(code))throw Error('Штрихкод должен содержать 8–14 цифр.');
 const url='https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(code)+'?fields='+encodeURIComponent(PRODUCT_FIELDS);
 const data=await fetchJSON(url);
 if(!data||Number(data.status)!==1||!data.product)throw Error('В Open Food Facts этот штрихкод пока не найден. Можно найти по названию или заполнить этикетку вручную.');
 const item=normalizeProduct(data.product,code);
 if(!item)throw Error('У продукта нет названия в каталоге. Введи его вручную.');
 return item;
}
let lastSearchTime=0;const searchCache=new Map();
async function searchProducts(input){
 const term=bounded(input,100);
 if(term.length<2)throw Error('Для поиска введи минимум 2 символа.');
 if(searchCache.has(term.toLowerCase()))return searchCache.get(term.toLowerCase());
 const elapsed=Date.now()-lastSearchTime;
 if(elapsed<6500)throw Error('Чтобы не превышать лимит каталога, повтори поиск через несколько секунд.');
 lastSearchTime=Date.now();
 // Open Food Facts v2 does not provide full-text search; the v1 endpoint does.
 const params=new URLSearchParams({search_terms:term,search_simple:'1',action:'process',json:'1',page_size:'12',fields:PRODUCT_FIELDS});
 const data=await fetchJSON('https://world.openfoodfacts.org/cgi/search.pl?'+params.toString(),18000);
 const results=(Array.isArray(data?.products)?data.products:[]).map(p=>normalizeProduct(p,p.code)).filter(Boolean);
 searchCache.set(term.toLowerCase(),results);
 if(searchCache.size>30)searchCache.delete(searchCache.keys().next().value);
 return results;
}

async function loadOCR(){
 if(window.Tesseract?.recognize)return window.Tesseract;
 if(!ocrPromise)ocrPromise=new Promise((resolve,reject)=>{
  const tag=document.createElement('script');tag.src=OCR;tag.async=true;
  tag.onload=()=>window.Tesseract?.recognize?resolve(window.Tesseract):reject(Error('OCR-библиотека недоступна.'));
  tag.onerror=()=>reject(Error('Не удалось скачать распознавание этикеток.'));
  document.head.append(tag);
 }).catch(err=>{ocrPromise=null;throw err});
 return ocrPromise;
}
function extractNutrition(text){
 const full=String(text||'').replace(/\u00a0/g,' ').replace(/ё/g,'е');
 const lines=full.split(/[\n\r]+/).map(x=>x.trim()).filter(Boolean);
 const isPer100=/(?:на|в|per|\/)\s*100\s*(?:г|гр|g|мл|ml)(?![a-zа-я])/i.test(full)||
  /(?:100\s*(?:г|гр|g|мл|ml))\s*[:\/\-]/i.test(full);
 function item(pattern){
  for(const raw of lines){
   const line=raw.toLowerCase();
   if(!pattern.test(line))continue;
   let match;
   if(/ккал|kcal/.test(pattern.source)){
    match=line.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:ккал|kcal)/i);
   }else{
    match=line.match(new RegExp('(?:'+pattern.source+')\\s*[:–-]?\\s*(\\d{1,5}(?:[.,]\\d{1,2})?)\\s*(?:г|гр|g)?','i'));
   }
   if(match)return number(match[1].replace(',','.'));
  }
  return null;
 }
 const kcal=item(/(?:ккал|kcal)/i);
 const protein=item(/(?:белки|белков|protein)/i);
 const fat=item(/(?:жиры|жиров|fat\b)/i);
 const carbs=item(/(?:углеводы|углеводов|carbohydrates)/i);
 const per100=isPer100&&[kcal,protein,fat,carbs].some(v=>v!==null)?{kcal,protein,fat,carbs}:null;
 let title='';
 const skip=/^(?:состав|ingredients|хранить|изготовлено|энергетическая|пищевая|nutrition|белки|жиры|углеводы|ккал|изготовитель|в\s*100|100\s*г|производитель)/i;
 for(const line of lines.slice(0,14)){
  if(line.length<5||line.length>64||skip.test(line)||/^\d/.test(line)||/\d{4,}/.test(line))continue;
  if(/[А-Яа-яA-Za-z]{3,}/.test(line)){title=line;break}
 }
 return {title,per100,lines,per100Confirmed:isPer100};
}
async function analyzePackage(file,onStatus){
 report(onStatus,'Ищу штрихкод на фотографии…');
 const barcode=await barcodeFromPhoto(file);
 if(barcode){
  report(onStatus,'Штрихкод '+barcode+' найден. Проверяю продукт в Open Food Facts…');
  try{return await productByBarcode(barcode)}
  catch(error){report(onStatus,error.message+' Перехожу к чтению этикетки…')}
 }
 report(onStatus,'Распознаю текст этикетки на устройстве. Для первого запуска загружается OCR-модель…');
 const T=await loadOCR();
 let data;
 try{data=await T.recognize(file,'rus+eng')}catch(error){throw Error('Не удалось прочитать этикетку: '+error.message)}
 const raw=String(data?.data?.text||''),found=extractNutrition(raw);
 if(!found.title&&!found.per100)throw Error('Не удалось уверенно прочитать название и калории на 100 г. Сфотографируй таблицу пищевой ценности без бликов или введи данные вручную.');
 return {kind:'package',source:'OCR этикетки',barcode:barcode||null,
  title:found.title,ingredients:'',per100:found.per100,
  labelText:raw.slice(0,2400),
  confidence:found.per100Confirmed?'Текст распознан автоматически; проверь цифры и единицы измерения':'Не найдено подтверждение, что данные относятся к 100 г. Числа не применены автоматически'};
}
async function foodModel(onStatus){
 if(foodPredictor)return foodPredictor;
 if(!foodPredictorPromise){
  foodPredictorPromise=(async()=>{
   report(onStatus,'Загружаю локальную модель распознавания еды (около 93 МБ при первом запуске). Желателен Wi‑Fi…');
   const {pipeline}=await import(LIB);
   return pipeline('image-classification',MODEL,{dtype:'q8',device:'wasm'});
  })().then(x=>(foodPredictor=x)).catch(error=>{foodPredictorPromise=null;throw error});
 }
 return foodPredictorPromise;
}
async function analyzeFood(file,onStatus){
 const model=await foodModel(onStatus);
 report(onStatus,'Распознаю блюдо на устройстве…');
 const url=URL.createObjectURL(file);
 try{
  const results=await model(url,{topk:3});
  const candidates=(results||[]).filter(x=>typeof x.label==='string'&&Number.isFinite(Number(x.score)))
   .map(x=>({title:RU[x.label.toLowerCase()]||x.label.replace(/_/g,' '),score:Number(x.score)}));
  if(!candidates.length)throw Error('Модель не смогла предложить название блюда.');
  return {kind:'meal',source:'Локальная модель Food-101',title:candidates[0].score>=.3?candidates[0].title:'',
   ingredients:'',candidates,per100:null,
   confidence:'Это предположение по фотографии. Состав и размер порции определяются неточно'};
 }finally{URL.revokeObjectURL(url)}
}
window.LifeSimsMealPhoto={compressedThumbnail,barcodeFromPhoto,startBarcodeScanner,productByBarcode,searchProducts,analyzeFood,analyzePackage};
})();
