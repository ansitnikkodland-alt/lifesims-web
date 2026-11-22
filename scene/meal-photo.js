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
    const matched=result.find(r=>/^\d{8,14}$/.test(r.rawValue));
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
  return /^\d{8,14}$/.test(code)?code:null;
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
  if(ended||!/^\d{8,14}$/.test(String(code||'')))return;
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
      const match=results.find(x=>/^\d{8,14}$/.test(x.rawValue));
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
 code=String(code||'').replace(/\s/g,'');
 if(!/^\d{8,14}$/.test(code))throw Error('Штрихкод должен содержать 8–14 цифр.');
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
 const full=String(text||'').replace(/\u00a0/g,' ').replace(/ё/g,'е').replace(/[ \t]+/g,' ');
 const lines=full.split(/[\n\r]+/).map(line=>line.trim()).filter(Boolean);
 const per100=/(?:на|в|per|\/)\s*100\s*(?:г|гр|g|мл|ml)\b/i.test(full)||
  /(?:100\s*(?:г|гр|g|мл|ml))\s*[:/—–-]/i.test(full);
 const patterns={
  kcal:/(?:ккал|kcal|калорийность|калории|энергетическая\s+ценность)/i,
  protein:/(?:белки|белков|белка|proteins?|протеин)/i,
  fat:/(?:жиры|жиров|жира|fats?|липиды)/i,
  carbs:/(?:углеводы|углеводов|углевода|carbohydrates?|carbs?)/i
 };
 const amount=/(\d{1,5}(?:[.,]\d{1,2})?)/;
 function getAmount(type){
  const pattern=patterns[type];
  for(const raw of lines){
   const line=raw.toLowerCase();
   if(!pattern.test(line))continue;
   if(type==='kcal'){
    const endUnit=line.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:ккал|kcal)\b/i);
    if(endUnit)return number(endUnit[1].replace(',','.'));
   }
   const match=pattern.exec(line);
   const after=line.slice(match.index+match[0].length).replace(/^\s*(?:,?\s*(?:г|гр|g)\s*)?[:—–-]?\s*/i,'');
   const value=after.match(amount);
   // A label and a nutritional value must occur together; percentages alone are not fats in grams.
   if(value&&!/^\s*%/.test(after.slice(value.index+value[0].length)))return number(value[1].replace(',','.'));
  }
  return null;
 }
 const extracted={kcal:getAmount('kcal'),protein:getAmount('protein'),fat:getAmount('fat'),carbs:getAmount('carbs')};
 // OCR may display "ккал 210" on a separate row without a value directly before the word.
 if(extracted.kcal==null){
  for(const l of lines){
   const m=l.match(/(?:калорийность|калории|ккал|kcal)\s*[:\-]?\s*(\d{1,5}(?:[.,]\d{1,2})?)/i);
   if(m){extracted.kcal=number(m[1].replace(',','.'));break}
  }
 }
 const composition=/(?:^|\n)\s*(?:состав(?:\s+продукта)?|ингредиенты|ingredients)\s*[:\-—]?\s*([^\n]*)/i.exec(full);
 let ingredients='';
 if(composition){
  const index=full.slice(0,composition.index+composition[0].length).split(/\n/).length-1;
  const tail=[composition[1],...lines.slice(index+1,index+5)]
   .map(s=>s.trim()).filter(Boolean);
  ingredients=bounded(tail.slice(0,Math.max(1,tail.findIndex((x,i)=>i>0&&/^(?:пищевая|энергетическая|белки|жиры|углеводы|калори|nutrition|хранить|срок годности|масса|изготов|производител|на 100)/i.test(x))<0?tail.length:tail.findIndex((x,i)=>i>0&&/^(?:пищевая|энергетическая|белки|жиры|углеводы|калори|nutrition|хранить|срок годности|масса|изготов|производител|на 100)/i.test(x)))).join(' '),700)
    .replace(/[.;,:]\s*$/,'');
 }
 const skip=/^(?:состав|ингредиенты|ingredients|хранить|изготовлено|энергетическая|пищевая|nutrition|белки|белка|жиры|углеводы|ккал|калорийность|изготовитель|на\s*100|100\s*г|производитель|порция|масса нетто)/i;
 let title='';
 for(const line of lines.slice(0,14)){
  if(line.length<4||line.length>90||skip.test(line)||/^\d/.test(line)||/\d{4,}/.test(line))continue;
  if(/[А-Яа-яA-Za-z]{3,}/.test(line)){title=line;break}
 }
 const labels=Object.values(patterns).filter(re=>re.test(full)).length;
 const containsNutrition=Object.values(extracted).some(v=>v!=null);
 const isLabel=!!composition||labels>=2||(per100&&labels>=1);
 return {title,ingredients,per100:per100&&containsNutrition?extracted:null,
  detectedNutrition:extracted,lines,per100Confirmed:per100,isLabel,
  hasNutrition:containsNutrition};
}
async function readLabel(file,onStatus){
 report(onStatus,'Читаю этикетку (OCR на устройстве): первое распознавание требует загрузки модели…');
 const T=await loadOCR();
 let data;
 try{data=await T.recognize(file,'rus+eng')}catch(error){throw Error('Не удалось прочитать текст с фотографии: '+error.message)}
 const raw=String(data?.data?.text||'');
 return {raw,found:extractNutrition(raw)};
}
function labelResult(barcode,raw,found){
 return {kind:'package',source:'OCR этикетки',barcode:barcode||null,
  title:found.title||'',ingredients:found.ingredients||'',
  per100:found.per100||null,labelText:raw.slice(0,3000),
  detectedNutrition:found.detectedNutrition,
  confidence:found.per100?
   'Распознаны показатели на 100 г/мл. Проверь каждую цифру по этикетке':
   'Основа пищевой ценности (100 г/мл) не подтверждена — значения не подставлены; посмотри распознанный текст и исправь вручную'};
}
async function analyzePackage(file,onStatus){
 report(onStatus,'Ищу штрихкод на фото упаковки…');
 const barcode=await barcodeFromPhoto(file);
 if(barcode){
  try{return await productByBarcode(barcode)}
  catch(error){report(onStatus,'Товар не найден в каталоге: '+error.message+'. Прочитаю этикетку.')}
 }
 const {raw,found}=await readLabel(file,onStatus);
 if(!barcode&&!found.isLabel&&!found.title)throw Error('Не удалось прочитать текст упаковки. Сфотографируй таблицу пищевой ценности крупным планом.');
 return labelResult(barcode,raw,found);
}
const TYPICAL_PORTIONS={
 pizza:150,sushi:180,spaghetti_bolognese:300,spaghetti_carbonara:300,
 ramen:400,fried_rice:280,omelette:180,scrambled_eggs:170,
 pancakes:180,waffles:150,french_fries:140,hamburger:200,hot_dog:160,
 chicken_wings:240,greek_salad:250,caesar_salad:260,steak:220,
 apple_pie:130,cheesecake:120,ice_cream:120,tiramisu:140,
 lasagna:320,macaroni_and_cheese:280,chocolate_cake:130,
 beet_salad:190,dumplings:250,guacamole:100,risotto:270,
 spring_rolls:180,tacos:200,nachos:160,donuts:85,donut:85,
 frozen_yogurt:140,grilled_salmon:190,fried_calamari:190,
 fish_and_chips:300,lobster_roll_sandwich:200,cup_cakes:90,
 hummus:120,falafel:180,pho:450,bibimbap:350,miso_soup:280,
 chicken_curry:300,beef_tartare:160,bread_pudding:150,breakfast_burrito:250
};
function typicalPortion(label){
 const key=String(label||'').toLowerCase().replace(/[\s-]+/g,'_');
 return TYPICAL_PORTIONS[key]||250;
}
async function analyzeSmart(file,onStatus){
 report(onStatus,'Определяю тип фото: проверяю штрихкод…');
 let barcode=null;
 try{barcode=await barcodeFromPhoto(file)}
 catch(error){report(onStatus,'Штрихкод не считан. Проверяю текст…')}
 if(barcode){
  report(onStatus,'Найден штрихкод '+barcode+'. Проверяю продукт в каталоге…');
  try{return await productByBarcode(barcode)}
  catch(error){report(onStatus,'Товар отсутствует в каталоге. Читаю текст с упаковки…')}
 }
 try{
  const {raw,found}=await readLabel(file,onStatus);
  if(barcode||found.isLabel){
   report(onStatus,'Похоже, это этикетка. Извлекаю состав и пищевую ценность…');
   return labelResult(barcode,raw,found);
  }
 }catch(error){
  report(onStatus,'Не удалось прочитать текст: '+error.message+'. Проверяю, изображена ли еда…');
  if(barcode)return {kind:'package',source:'Штрихкод без карточки продукта',
   barcode,title:'',ingredients:'',per100:null,
   confidence:'Продукт не найден, этикетка не распознана. Введи название и БЖУ вручную'};
 }
 report(onStatus,'Текст этикетки не обнаружен. Распознаю блюдо…');
 return analyzeFood(file,onStatus);
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
  const first=results?.[0]||{},guess=first.score>=.3?typicalPortion(first.label):null;
  return {kind:'meal',source:'Локальная модель Food-101',title:candidates[0].score>=.3?candidates[0].title:'',
   ingredients:'',candidates,per100:null,gramsEstimate:guess,
   confidence:guess!=null?
    'Вес '+guess+' г — приблизительная типичная порция для такого блюда, а не измерение по фото. Проверь и исправь':
    'Название не определено уверенно. Размер порции и калории оцени самостоятельно'};
 }finally{URL.revokeObjectURL(url)}
}
window.LifeSimsMealPhoto={compressedThumbnail,barcodeFromPhoto,startBarcodeScanner,productByBarcode,searchProducts,analyzeFood,analyzePackage,analyzeSmart,extractNutrition,typicalPortion};
})();
