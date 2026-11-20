/* LifeSims nutrition journal v28: local estimates, manual confirmation, no hidden photo uploads. */
(function(){
'use strict';
const bridge=window.LifeSimsFoodBridge;
if(!bridge||!document.getElementById('mealForm'))return;
const $=id=>document.getElementById(id);
let editingId=null,photoThumb=null,entryMethod='text',hasEstimate=false,manualChange=false,estimateNote='';
const FOOD_ROWS=[
 // name keys | approximate kcal, protein, fat, carbohydrates per 100 g | typical portion g
 ['гречк|buckwheat',110,3.6,1.0,21.3,180],
 ['рис вар|рис|rice',130,2.7,0.3,28.0,170],
 ['овсян|oatmeal|каша',90,3.0,2.0,15,200],
 ['макарон|паст|spaghetti|pasta',155,5.8,0.9,30,180],
 ['картоф|potato',87,1.9,0.1,20,160],
 ['хлеб|тост|bread',245,8.0,3.0,48,50],
 ['яйц|яйцо|egg',143,12.6,9.5,0.7,55],
 ['куриц|chicken',165,31,3.6,0,120],
 ['индейк|turkey',145,29,2,0,120],
 ['говядин|beef',220,26,12,0,120],
 ['свинин|pork',240,26,15,0,120],
 ['рыб|fish',125,20,5,0,130],
 ['лосос|семг|сёмг|salmon',208,20,13,0,130],
 ['тунец|tuna',132,28,1,0,110],
 ['кревет|shrimp',99,24,0.3,0.2,120],
 ['сыр|cheese',350,24,27,2,40],
 ['творог|cottage cheese',120,17,5,3,130],
 ['йогурт|yogurt',95,5,4,11,150],
 ['молок|milk',60,3.2,3.2,4.8,200],
 ['кефир|kefir',50,3,2.5,4,200],
 ['майонез|mayonnaise',680,1,75,1,18],
 ['масло слив|butter',720,1,81,1,12],
 ['оливковое масло|масло растительн|olive oil',884,0,100,0,10],
 ['авокад|avocado',160,2,15,8.5,80],
 ['огурец|cucumber',15,0.7,0.1,3.6,100],
 ['помидор|томат|tomato',18,0.9,0.2,3.9,100],
 ['овощ|vegetable',35,2,0.5,7,130],
 ['салат|salad',70,2,3,10,200],
 ['брокколи|broccoli',35,2.4,0.4,7,120],
 ['яблок|apple',52,0.3,0.2,14,150],
 ['банан|banana',89,1.1,0.3,23,120],
 ['апельсин|orange',47,0.9,0.1,12,150],
 ['виноград|grape',69,0.7,0.2,18,120],
 ['ягод|berries',50,1,0.3,11,100],
 ['орех|nuts',600,18,54,22,30],
 ['шоколад|chocolate',540,7,32,59,30],
 ['морожен|ice cream',210,4,11,24,90],
 ['печень|cookie',480,6,20,69,40],
 ['торт|cake',360,5,18,46,110],
 ['сахар|sugar',400,0,0,100,8],
 ['мед|мёд|honey',304,0.3,0,82,15],
 ['кофе|coffee',2,0,0,0,200],
 ['чай|tea',1,0,0,0,200],
 ['сок|juice',46,0.2,0.1,11,200],
 ['пиво|beer',43,0.5,0,3.6,350],
 ['вино|wine',83,0.1,0,2.6,150],
 ['ликер|ликёр|liqueur',320,0,0,30,45],
 ['пицц|pizza',270,12,11,31,180],
 ['бургер|burger',260,12,12,27,190],
 ['сэндвич|сэндвич|бутерброд|sandwich',250,10,12,25,170],
 ['суп|soup',65,4,3,7,300],
 ['котлет|cutlet',230,16,16,8,130],
 ['блин|pancake',210,6,8,30,120],
 ['пельмен|dumplings',240,11,11,27,200],
 ['ролл|суши|sushi',155,6,4,26,180],
 ['кимчи|kimchi',25,2,0.5,4,100],
 ['ростк|проростк|sprouts',35,3,0.5,5,120]
];
const ROWS=FOOD_ROWS.map(r=>({words:r[0].split('|'),kcal:r[1],p:r[2],f:r[3],c:r[4],grams:r[5]}));
const round1=x=>Math.round(x*10)/10;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateAdd=(d,offset)=>{const t=new Date(d+'T12:00:00');t.setDate(t.getDate()+offset);return [t.getFullYear(),String(t.getMonth()+1).padStart(2,'0'),String(t.getDate()).padStart(2,'0')].join('-')};
const total=(a,key)=>Math.round(a.reduce((n,r)=>n+(Number(r[key])||0),0)*10)/10;
const entries=()=>bridge.list();
function estimate(text,grams){
 const norm=String(text).toLowerCase().replace(/ё/g,'е');
 const weightInText=norm.match(/(\d+(?:[.,]\d+)?)\s*(?:г|гр|g|мл|ml)(?![а-яa-z])/);
 const units=norm.match(/(?:^|\s)(\d{1,2})\s*(?:шт|штук|штуки|яйца|яйцо|банана|яблока)(?![а-яa-z])/);
 const explicit=Number(grams)|| (weightInText?Number(weightInText[1].replace(',','.')):null);
 const selected=[];
 for(const row of ROWS){
  const matches=row.words.filter(w=>norm.includes(w.replace(/ё/g,'е')));
  if(matches.length){selected.push({...row,match:matches.sort((a,b)=>b.length-a.length)[0]});}
 }
 // Prioritise the specific food over generic family (salmon instead of fish etc).
 const specific=selected.filter(r=>!selected.some(other=>r!==other&&other.match.includes(r.match)&&other.match.length>r.match.length));
 let found=specific.length?specific:selected;
 // Only one per detected overlapping phrase such as milk and yogurt.
 found=found.filter(r=>!found.some(other=>r!==other&&other.match.includes(r.match)&&other.match.length>r.match.length));
 let typical=found.reduce((s,r)=>s+r.grams,0);
 let portion=explicit&&explicit>=1&&explicit<=10000?explicit:(units&&found.length===1?Math.min(20,Number(units[1]))*typical:(typical||200));
 let density=found.length?found.reduce((s,r)=>s+r.grams*r.kcal,0)/typical:165;
 const macros={kcal:0,p:0,f:0,c:0};
 if(found.length){
  for(const r of found){
   const w=portion*(r.grams/typical)/100;
   macros.kcal+=r.kcal*w;macros.p+=r.p*w;macros.f+=r.f*w;macros.c+=r.c*w;
  }
 }else{
  // Explicitly very rough fallback for unknown meals: 165 kcal/100g,
  // not a food label or measured nutritional value.
  macros.kcal=portion*density/100;macros.p=portion*6/100;macros.f=portion*7/100;macros.c=portion*20/100;
 }
 const confidence=found.length?'ориентировочно, по типичным продуктам и порциям':'очень грубо, блюдо не распознано по названию';
 const fraction=found.length?0.35:0.65;
 return {grams:Math.round(portion),kcal:Math.round(macros.kcal),protein:round1(macros.p),fat:round1(macros.f),carbs:round1(macros.c),low:Math.max(0,Math.round(macros.kcal*(1-fraction))),high:Math.round(macros.kcal*(1+fraction)),confidence,matched:found.map(r=>r.match)};
}
function setStatus(value){$('mealStatus').textContent=value}
function setPhotoPreview(){
 const container=$('mealPhotoPreview');container.replaceChildren();container.hidden=!photoThumb;
 if(!photoThumb)return;
 const img=document.createElement('img');img.src=photoThumb;img.alt='Фото приёма пищи';
 const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Убрать фото';
 remove.onclick=()=>{photoThumb=null;setPhotoPreview()};
 container.append(img,remove);
}
async function compressPhoto(file){
 if(!file||!file.type.startsWith('image/'))throw Error('Выбери изображение.');
 if(file.size>12*1024*1024)throw Error('Изображение больше 12 МБ. Выбери фото меньшего размера.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;await img.decode();
  if(img.width*img.height>60_000_000)throw Error('Слишком большое изображение.');
  const canvas=document.createElement('canvas');const factor=Math.min(1,180/Math.max(img.width,img.height));
  canvas.width=Math.max(1,Math.floor(img.width*factor));canvas.height=Math.max(1,Math.floor(img.height*factor));
  canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
  for(const quality of [0.55,0.40,0.28]){
   const data=canvas.toDataURL('image/jpeg',quality);
   if(data.length<=21000)return data;
  }
  throw Error('Фото не удалось достаточно уменьшить для локального сохранения.');
 }finally{URL.revokeObjectURL(url)}
}
function setInput(id,value){$(id).value=value==null?'':String(value)}
function reset(){
 editingId=null;photoThumb=null;entryMethod='text';hasEstimate=false;manualChange=false;estimateNote='';
 $('mealForm').reset();$('mealDay').value=$('mealDay').value||bridge.today();
 setInput('mealTime',new Date().toTimeString().slice(0,5));
 $('mealFormTitle').textContent='Записать приём пищи';$('mealCancel').hidden=true;
 $('mealSave').textContent='Сохранить приём пищи';$('mealEstimateResult').textContent='Введи блюдо и нажми «Рассчитать примерно».';
 setPhotoPreview();setStatus('');
}
function analyze(){
 const text=$('mealDescription').value.trim();
 if(!text){setStatus('Сначала опиши блюдо словами.');return false}
 const value=estimate(text,$('mealGrams').value);
 setInput('mealGrams',value.grams);setInput('mealKcal',value.kcal);setInput('mealProtein',value.protein);setInput('mealFat',value.fat);setInput('mealCarbs',value.carbs);
 hasEstimate=true;manualChange=false;estimateNote=value.confidence;
 $('mealEstimateResult').textContent='≈ '+value.kcal+' ккал (возможный диапазон '+value.low+'–'+value.high+') · Б '+value.protein+' г · Ж '+value.fat+' г · У '+value.carbs+' г · '+value.confidence+'. Расчёт для '+value.grams+' г. Уточни порцию и ингредиенты, при необходимости измени цифры.';
 setStatus('Это приблизительная справочная оценка, а не распознавание по фото.');
 return true;
}
function nutrient(id){const s=$(id).value.trim();if(!s)return null;const v=Number(s);return Number.isFinite(v)&&v>=0?v:null}
function save(event){
 event.preventDefault();
 if(!$('mealDescription').value.trim())return setStatus('Напиши, что съела или выпила.');
 if(!hasEstimate&&nutrient('mealKcal')==null&&!analyze())return;
 const day=$('mealDay').value||bridge.today(),time=$('mealTime').value;
 try{
  const value=bridge.upsert({
   id:editingId,date:day,time,title:$('mealDescription').value.trim(),grams:nutrient('mealGrams'),
   kcal:nutrient('mealKcal'),protein:nutrient('mealProtein'),fat:nutrient('mealFat'),carbs:nutrient('mealCarbs'),
   estimate:!manualChange,method:entryMethod,photoThumb
  });
  reset();$('mealDay').value=day;render();
  setStatus('✓ Приём пищи сохранён: '+value.title+' · '+(value.kcal==null?'без калорий':'≈ '+value.kcal+' ккал')+'.');
 }catch(e){setStatus('⚠ '+e.message)}
}
function edit(meal){
 editingId=meal.id;photoThumb=meal.photoThumb||null;entryMethod=meal.method||'manual';hasEstimate=true;manualChange=!meal.estimate;
 $('mealDay').value=meal.date;setInput('mealTime',meal.time);setInput('mealDescription',meal.title);setInput('mealGrams',meal.grams);
 setInput('mealKcal',meal.kcal);setInput('mealProtein',meal.protein);setInput('mealFat',meal.fat);setInput('mealCarbs',meal.carbs);
 $('mealFormTitle').textContent='Изменить приём пищи';$('mealCancel').hidden=false;$('mealSave').textContent='Сохранить изменения';
 $('mealEstimateResult').textContent='Сохранённые значения '+(meal.estimate?'ориентировочные.':'скорректированы вручную.');
 setPhotoPreview();$('mealForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function remove(id){
 if(!confirm('Удалить эту запись о еде?'))return;
 try{bridge.remove(id);render();setStatus('Запись удалена.')}catch(e){setStatus('⚠ '+e.message)}
}
function makeRow(meal){
 const div=document.createElement('div');div.className='food-meal-item';
 const pic=document.createElement('div');pic.className='food-meal-pic';
 if(meal.photoThumb){const img=document.createElement('img');img.alt='Фото';img.src=meal.photoThumb;pic.append(img)}else pic.textContent='🍽';
 const body=document.createElement('div');body.className='food-meal-body';
 const title=document.createElement('strong');title.textContent=meal.title;
 const info=document.createElement('small');info.textContent=meal.time+' · '+(meal.kcal==null?'калории не указаны':'≈ '+meal.kcal+' ккал')+(meal.grams?' · '+meal.grams+' г':'');
 const acts=document.createElement('div');acts.className='food-meal-actions';
 const editBtn=document.createElement('button');editBtn.className='secondary';editBtn.type='button';editBtn.textContent='Изменить';editBtn.onclick=()=>edit(meal);
 const delBtn=document.createElement('button');delBtn.className='secondary';delBtn.type='button';delBtn.textContent='Удалить';delBtn.onclick=()=>remove(meal.id);
 acts.append(editBtn,delBtn);body.append(title,info,acts);div.append(pic,body);return div;
}
function render(){
 const day=$('mealDay').value||bridge.today(),all=entries();
 const meals=all.filter(m=>m.date===day).sort((a,b)=>a.time.localeCompare(b.time));
 $('mealCount').textContent='('+meals.length+')';
 const kcal=total(meals,'kcal'),p=total(meals,'protein'),f=total(meals,'fat'),c=total(meals,'carbs');
 $('mealTotalKcal').textContent=meals.length?'≈ '+Math.round(kcal):'—';
 $('mealTotalMacros').textContent=meals.length?'Белки ≈'+p+' г · Жиры ≈'+f+' г · Углеводы ≈'+c+' г':'Пока нет записей';
 const list=$('mealList');list.replaceChildren();
 if(!meals.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='За выбранную дату приёмов пищи нет.';list.append(empty)}
 for(const meal of meals)list.append(makeRow(meal));
 const timing=$('mealTiming');timing.replaceChildren();
 if(meals.length){
  const ring=document.createElement('div');ring.className='food-ring';
  for(const meal of meals){
   const parts=meal.time.split(':').map(Number),angle=(parts[0]+parts[1]/60)/24*2*Math.PI-Math.PI/2;
   const dot=document.createElement('span');dot.className='food-ring-dot';dot.style.left=(50+43*Math.cos(angle))+'%';dot.style.top=(50+43*Math.sin(angle))+'%';dot.title=meal.time+' · '+meal.title;ring.append(dot);
  }
  const center=document.createElement('span');center.className='food-ring-center';center.textContent=meals.length+' приёма';ring.append(center);
  const caption=document.createElement('p');caption.className='hint';caption.textContent='Первый: '+meals[0].time+' · Последний: '+meals[meals.length-1].time;
  timing.append(ring,caption);
 }else timing.textContent='Добавь запись, чтобы увидеть время еды.';
 const week=$('mealWeek');week.replaceChildren();
 for(let n=6;n>=0;n--){
  const date=dateAdd(day,-n),dayMeals=all.filter(m=>m.date===date),cal=total(dayMeals,'kcal');
  const line=document.createElement('div');line.className='food-week-row';
  const caption=document.createElement('span');caption.textContent=date.slice(5);
  const bar=document.createElement('div');bar.className='food-week-bar';const fill=document.createElement('b');fill.style.width=Math.round(Math.min(100,cal/3000*100))+'%';bar.append(fill);
  const val=document.createElement('span');val.textContent=dayMeals.length?'≈ '+Math.round(cal):'—';
  line.append(caption,bar,val);week.append(line);
 }
}
$('mealDay').value=bridge.today();setInput('mealTime',new Date().toTimeString().slice(0,5));
$('mealDay').addEventListener('change',render);
$('mealForm').addEventListener('submit',save);
$('mealEstimate').addEventListener('click',analyze);
$('mealReset').addEventListener('click',reset);
$('mealCancel').addEventListener('click',reset);
$('mealGrams').addEventListener('change',()=>{if(hasEstimate){analyze()}});
for(const field of ['mealKcal','mealProtein','mealFat','mealCarbs'])$(field).addEventListener('input',()=>{manualChange=true});
$('mealDescription').addEventListener('input',()=>{hasEstimate=false});
$('mealRepeat').addEventListener('click',()=>{
 const sorted=entries().sort((a,b)=>(b.date+' '+b.time).localeCompare(a.date+' '+a.time));
 if(!sorted.length)return setStatus('Ранее записанных блюд пока нет.');
 const recent=sorted[0];
 editingId=null;photoThumb=null;entryMethod='text';hasEstimate=true;manualChange=false;
 setInput('mealDescription',recent.title);setInput('mealGrams',recent.grams);setInput('mealKcal',recent.kcal);setInput('mealProtein',recent.protein);setInput('mealFat',recent.fat);setInput('mealCarbs',recent.carbs);
 $('mealEstimateResult').textContent='Значения взяты из предыдущей записи. Проверь порцию.';
 setStatus('Скопировано: '+recent.title+'. Новая запись сохранится отдельно.');
});
async function attachMealPhoto(input){
 const file=input.files?.[0];if(!file)return;
 try{
  photoThumb=await compressPhoto(file);entryMethod='photo';setPhotoPreview();
  setStatus('Фото добавлено локально. Опиши еду словами, чтобы рассчитать примерные калории.');
 }catch(e){setStatus('⚠ '+e.message)}
}
$('mealPhoto').addEventListener('change',()=>attachMealPhoto($('mealPhoto')));
$('mealGallery').addEventListener('change',()=>attachMealPhoto($('mealGallery')));
$('mealVoice').addEventListener('click',()=>{
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){setStatus('Голосовой ввод недоступен в этом браузере. Можно воспользоваться микрофоном Android-клавиатуры.');$('mealDescription').focus();return}
 const rec=new Recognition();rec.lang='ru-RU';rec.interimResults=false;rec.maxAlternatives=1;
 $('mealVoice').disabled=true;setStatus('Слушаю название блюда… Голос может обрабатываться сервисом распознавания браузера.');
 rec.onresult=e=>{const text=e.results?.[0]?.[0]?.transcript||'';if(text){$('mealDescription').value=($('mealDescription').value+' '+text).trim();entryMethod='voice';hasEstimate=false;analyze();}};
 rec.onerror=e=>setStatus('Голосовой ввод: '+e.error+'. Можешь ввести описание вручную.');
 rec.onend=()=>{$('mealVoice').disabled=false};
 try{rec.start()}catch(e){$('mealVoice').disabled=false;setStatus('Не удалось включить микрофон. Проверь разрешения браузера.')}
});
window.LifeSimsFood={render,estimate};
render();
})();