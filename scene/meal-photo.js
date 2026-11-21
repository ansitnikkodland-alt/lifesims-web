/* LifeSims v47: on-device food photo classification, package barcode and OCR. */
(function(){
'use strict';
const MODEL='onnx-community/swin-finetuned-food101-ONNX';
const LIB='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';
const OCR='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let foodPredictor=null,foodPredictorPromise=null,ocrPromise=null;
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
 if(typeof BarcodeDetector==='undefined')return null;
 let bitmap;
 try{
  const formats=['ean_13','ean_8','upc_a','upc_e','code_128'];
  const supported=typeof BarcodeDetector.getSupportedFormats==='function'
   ?await BarcodeDetector.getSupportedFormats():formats;
  const allowed=formats.filter(f=>supported.includes(f));
  if(!allowed.length)return null;
  bitmap=await createImageBitmap(file);
  const detector=new BarcodeDetector({formats:allowed});
  const result=await detector.detect(bitmap);
  return result.find(r=>/^\d{8,14}$/.test(r.rawValue))?.rawValue||null;
 }catch(_){return null}
 finally{bitmap?.close?.()}
}
async function productByBarcode(code){
 if(!/^\d{8,14}$/.test(code||''))throw Error('Штрихкод должен содержать 8–14 цифр.');
 const fields='code,product_name,product_name_ru,product_name_en,brands,ingredients_text,ingredients_text_ru,nutriments,quantity';
 const url='https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(code)+'?fields='+encodeURIComponent(fields);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16000);
 let data;
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json'}});
  if(!response.ok)throw Error('Сервер продуктов вернул '+response.status);
  data=await response.json();
 }finally{clearTimeout(timer)}
 if(!data||Number(data.status)!==1||!data.product)throw Error('Товар не найден в Open Food Facts. Можно прочитать этикетку или заполнить вручную.');
 const p=data.product,n=p.nutriments||{};
 const title=bounded(p.product_name_ru||p.product_name||p.product_name_en||'',160);
 if(!title)throw Error('Найден штрихкод, но название продукта в базе отсутствует.');
 return {kind:'package',source:'Open Food Facts',barcode:code,title,
  ingredients:bounded(p.ingredients_text_ru||p.ingredients_text||'',700),
  per100:{kcal:number(n['energy-kcal_100g']),protein:number(n.proteins_100g),fat:number(n.fat_100g),carbs:number(n.carbohydrates_100g)},
  details:bounded(p.quantity||'',120),confidence:'Данные базы продуктов; проверь упаковку'};
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
window.LifeSimsMealPhoto={compressedThumbnail,barcodeFromPhoto,productByBarcode,analyzeFood,analyzePackage};
})();
