/* LifeSims: per-account character figurines. No source photo is stored in the browser or cloud.
 * Full-body transparent WebP from a server-side AI image edit (when explicitly enabled).
 * This is a 2D rendered figurine, NOT a rigged 3D mesh or an animation.
 */
(function(){
'use strict';
const C=()=>window.LifeSimsCloud;
const API=(path,method,body)=>C().request(path,method,body);
const el=(tag,text,cls)=>{
 const x=document.createElement(tag);if(text!==null&&text!==undefined)x.textContent=text;if(cls)x.className=cls;return x
};
const btn=(title,callback)=>{
 const x=el('button',title,'secondary figurine-button');x.type='button';x.addEventListener('click',callback);return x
};
const note=(host,text)=>{const e=el('p',text,'cloud-muted figurine-hint');host.append(e);return e};
const card=host=>{const c=el('div',null,'cloud-card figurine-card');host.append(c);return c};
const confirmTemp=()=>confirm('Фигурка сохранится в тестовом хранилище, которое может перестать работать 23 декабря 2026 года. Сохранить изображение?');
function fileToData(file,maxSize=1000,quality=.84){
 return new Promise((resolve,reject)=>{
  if(!file||!file.type.startsWith('image/')||file.size>12*1024*1024){reject(Error('Нужно изображение до 12 МБ'));return}
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
   try{
    const scale=Math.min(1,maxSize/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const data=c.toDataURL('image/jpeg',quality);
    if(data.length>2250000)throw Error('Фотография слишком большая, выбери другую');
    resolve(data);
   }catch(err){reject(err)}finally{URL.revokeObjectURL(url)}
  };
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Не удалось прочитать фотографию'))};
  img.src=url;
 });
}
function artworkToData(file){
 return new Promise((resolve,reject)=>{
  if(!file||!['image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)return reject(Error('Выбери готовую PNG/WebP-фигурку до 5 МБ'));
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
   try{
    const scale=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
    c.getContext('2d').clearRect(0,0,c.width,c.height);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const data=c.toDataURL('image/webp',.85);
    if(!data.startsWith('data:image/webp;base64,'))throw Error('Браузер не поддерживает WebP');
    if(data.length>3000000)throw Error('Слишком большой размер фигурки');
    resolve(data);
   }catch(err){reject(err)}finally{URL.revokeObjectURL(url)}
  };
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Файл не удалось открыть'))};
  img.src=url;
 });
}
let sceneFigure=null;
async function refreshScene(){
 const scene=document.getElementById('scene'),cloud=C();
 if(!scene||!cloud?.isActive?.())return;
 if(!sceneFigure){
  sceneFigure=el('img',null,'lifesims-person-figurine');
  sceneFigure.alt='';sceneFigure.setAttribute('aria-hidden','true');
  sceneFigure.hidden=true;scene.append(sceneFigure);
 }
 try{
  const data=await API('/v1/figurines?accountId='+encodeURIComponent(cloud.activeId()));
  if(data.figurine){sceneFigure.src=data.figurine;sceneFigure.hidden=false}
  else{sceneFigure.hidden=true;sceneFigure.removeAttribute('src')}
 }catch(_){sceneFigure.hidden=true}
}
async function render(host){
 host.replaceChildren();
 const cloud=C(),me=cloud?.account?.();
 if(!me){note(host,'Сначала войди в свой семейный аккаунт.');return}
 const header=card(host);
 header.append(el('strong','🎨 Фигурка персонажа'));
 note(header,'Из фотографии создаётся одна качественная фигурка с прозрачным фоном, похожая на персонажа из игры. Редактор внешности пока не нужен. Это неподвижное изображение, не анимированная 3D-модель.');
 const status=el('p','Проверка генератора…','cloud-status figurine-status');header.append(status);
 let availability,children=[];
 try{
  const calls=[API('/v1/figurines/status')];
  if(me.role==='adult')calls.push(API('/v1/children'));
  const results=await Promise.all(calls);
  availability=results[0];children=results[1]?.children||[];
 }catch(err){status.textContent='⚠ Сервер фигурок недоступен: '+err.message;return}
 const owner=card(host);
 const picker=el('select',null,'cloud-input figurine-account');
 const options=[me,...children];
 for(const person of options){
  const o=el('option',person.displayName+(person.id===me.id?' · я':' · ребёнок'));
  o.value=person.id;picker.append(o);
 }
 const picklabel=el('label','Для какого персонажа создаём фигурку?','figurine-label');
 picklabel.append(picker);owner.append(picklabel);
 const preview=el('img',null,'figurine-preview');preview.alt='Предпросмотр выбранной фигурки';preview.hidden=true;owner.append(preview);
 const details=el('p','','cloud-muted');owner.append(details);
 const controls=el('div',null,'figurine-controls');owner.append(controls);
 const staged={image:null,id:null};
 const message=(value)=>{status.textContent=value};
 function selectState(){
  staged.image=null;staged.id=null;preview.hidden=true;preview.removeAttribute('src');
  const child=picker.value!==me.id||me.role==='child';
  const allowed=me.role==='adult'&&(!child||availability.childUploadsEnabled);
  message(child&&!availability.childUploadsEnabled?'⚠ Фигурки детей пока не сохраняются в тестовую базу: требуется защищённое постоянное хранилище.':availability.generationEnabled?'Генератор подключён. Можно создать фигурку по фото.':'Генератор ещё не подключён. Можно загрузить готовую фигурку PNG/WebP.');
  generator.disabled=!allowed||!availability.generationEnabled;
  manual.disabled=!allowed;
  save.disabled=true;
  erase.disabled=!allowed;
  loadStored();
 }
 async function loadStored(){
  const id=picker.value;
  try{
   const data=await API('/v1/figurines?accountId='+encodeURIComponent(id));
   if(picker.value!==id||staged.image)return;
   if(data.figurine){preview.src=data.figurine;preview.hidden=false;details.textContent='Сохранённая фигурка · '+new Date(data.updatedAt).toLocaleDateString('ru-RU')}
   else details.textContent='Фигурка ещё не создана.';
  }catch(err){details.textContent='Не удалось загрузить сохранённую фигурку: '+err.message}
 }
 picker.addEventListener('change',selectState);
 const photo=el('input',null,'figurine-file');photo.type='file';photo.accept='image/jpeg,image/png,image/webp';photo.setAttribute('aria-label','Фотография лица ребёнка или взрослого');photo.hidden=true;
 const generator=btn('✨ Создать фигурку по фото',()=>photo.click());
 controls.append(generator,photo);
 const consent=el('label',null,'figurine-consent');
 const check=el('input');check.type='checkbox';check.checked=false;
 consent.append(check,el('span','Разрешаю однократную передачу этого фото в OpenAI для генерации. Понимаю, что обработка изображений через API может быть платной, а исходное фото не будет сохранено LifeSims.'));
 owner.append(consent);
 photo.addEventListener('change',async()=>{
  const file=photo.files?.[0];photo.value='';if(!file)return;
  if(!check.checked){message('⚠ Сначала подтверди обработку фотографии.');return}
  const target=picker.value;
  generator.disabled=true;message('Создаю фигурку…');
  try{
   const source=await fileToData(file);
   if(picker.value!==target)throw Error('Выбор персонажа изменился');
   const r=await API('/v1/figurines/generate','POST',{accountId:target,photo:source,consentToExternalProcessing:true,confirmGeneration:true});
   if(picker.value!==target)throw Error('Выбор персонажа изменился');
   staged.image=r.figurine;staged.id=target;preview.src=r.figurine;preview.hidden=false;details.textContent='Новая фигурка. Можно сохранить или скачать.';save.disabled=false;
   message('✓ Фигурка готова для просмотра. Она ещё не сохранена.');
  }catch(err){message('⚠ '+err.message)}
  finally{generator.disabled=!availability.generationEnabled||me.role!=='adult'||(picker.value!==me.id&&!availability.childUploadsEnabled)}
 });
 const manualFile=el('input',null,'figurine-file');manualFile.type='file';manualFile.accept='image/png,image/webp';manualFile.setAttribute('aria-label','Готовая фигурка в PNG или WebP');manualFile.hidden=true;
 const manual=btn('📂 Добавить готовую фигурку',()=>manualFile.click());controls.append(manual,manualFile);
 manualFile.addEventListener('change',async()=>{
  const file=manualFile.files?.[0];manualFile.value='';if(!file)return;
  try{
   const image=await artworkToData(file);
   staged.image=image;staged.id=picker.value;preview.src=image;preview.hidden=false;
   details.textContent='Готовая фигурка. Она ещё не сохранена.';
   save.disabled=false;message('✓ Фигурка добавлена. Подтверди сохранение.');
  }catch(err){message('⚠ '+err.message)}
 });
 const save=btn('✓ Сохранить фигурку',async()=>{
  if(!staged.image||staged.id!==picker.value)return;
  if(!confirmTemp())return;
  save.disabled=true;message('Сохраняю фигурку…');
  try{
   await API('/v1/figurines/save','POST',{accountId:staged.id,figurine:staged.image,acknowledgeTemporaryStorage:true});
   message('✓ Фигурка сохранена в аккаунте.');
   staged.image=null;staged.id=null;await refreshScene();
  }catch(err){save.disabled=false;message('⚠ '+err.message)}
 });
 controls.append(save);
 const download=btn('↓ Скачать фигурку',()=>{
  const image=staged.image||preview.getAttribute('src');if(!image)return;
  const a=document.createElement('a');a.href=image;a.download='LifeSims-figurine.webp';document.body.append(a);a.click();a.remove();
 });controls.append(download);
 const erase=btn('Удалить фигурку',async()=>{
  if(!confirm('Удалить сохранённую фигурку этого персонажа?'))return;
  try{
   await API('/v1/figurines','DELETE',{accountId:picker.value});
   message('Фигурка удалена.');selectState();await refreshScene();
  }catch(err){message('⚠ '+err.message)}
 });
 controls.append(erase);
 note(owner,'Исходное фото не сохраняется в LifeSims. Сохраняется только утверждённая готовая фигурка. В этой версии изображение пока статичное, а нарисованная комната не изменяется.');
 selectState();
}
window.LifeSimsFigurines={render,refreshScene};
document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>refreshScene().catch(()=>{}),900)});
})();
