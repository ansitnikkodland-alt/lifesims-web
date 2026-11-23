/* LifeSims family studio v1.
 * Local-only identities. This module is deliberately NOT authentication.
 * Never upload a child's photograph or medical history without a secured backend.
 */
(function(){
'use strict';
const CLOUD=!!window.LifeSimsCloud?.isActive?.();
const CLOUD_UID=CLOUD?window.LifeSimsCloud.activeId():'';
const ROSTER=CLOUD?'lifesims-family-catalog-cloud-'+CLOUD_UID:'lifesims-family-catalog-v1';
const ACTIVE=CLOUD?'lifesims-family-active-cloud-'+CLOUD_UID:'lifesims-family-active-v1';
const PRIMARY='primary';
const MAIN_STORE='lifesims-visual-v1';
const ROOM_DB=CLOUD?'lifesims-family-room-cloud-'+CLOUD_UID:'lifesims-family-room-photos-v1';
const ITEMS={sim:'Персонаж',bed:'Кровать',fridge:'Холодильник',shower:'Душ',toilet:'Туалет',sink:'Раковина',desk:'Компьютер',phone:'Телефон',window:'Окно',sofa:'Диван',catLitter:'Лоток котиков'};
const LIMIT=12*1024*1024;
const id=()=>('p-'+(self.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2)));
const fresh=()=>({version:1,people:[{id:PRIMARY,name:'Анюта',type:'adult',createdAt:new Date().toISOString(),avatar:'',roomActive:false,markers:{}}],links:[],care:[]});
function catalog(){
 try{
  const saved=JSON.parse(localStorage.getItem(ROSTER)||'null');
  if(saved?.version===1&&Array.isArray(saved.people)&&saved.people.some(p=>p.id===PRIMARY)&&Array.isArray(saved.links)&&Array.isArray(saved.care))return saved;
 }catch(_){}
 return fresh();
}
function save(next){
 try{localStorage.setItem(ROSTER,JSON.stringify(next));return true}
 catch(e){alert('Недостаточно места для семейных данных. Данные LifeSims не изменены.');return false}
}
function current(){
 try{const key=localStorage.getItem(ACTIVE)||PRIMARY;return catalog().people.some(p=>p.id===key)?key:PRIMARY}
 catch(_){return PRIMARY}
}
function person(cid=current()){return catalog().people.find(p=>p.id===cid)||catalog().people[0]}
function storeFor(cid){return cid===PRIMARY?MAIN_STORE:'lifesims-family-profile-'+cid}
function activeStore(){return storeFor(current())}
function resourceBonus(day){
 const who=current(),end=day===localDay(new Date())?Date.now():new Date(day+'T23:59:59').getTime();
 if(!Number.isFinite(end))return 0;
 let total=0;
 for(const x of catalog().care){
  const when=Date.parse(x.at);
  if(!Number.isFinite(when)||when>end||end-when>24*3600000)continue;
  if(x.to===who)total+=5;
  if(x.from===who)total+=3;
 }
 return Math.min(18,total);
}
function localDay(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
window.LifeSimsFamily={activeStore,activeId:current,resourceBonus,storeFor,read:catalog,open,exportRoom,importRoom};
let dialog,roomOverlay,placing=null,section='people';
function field(tag,cls,text){
 const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;
}
function button(text,cb,cls='secondary'){
 const el=field('button',cls,text);el.type='button';el.addEventListener('click',cb);return el;
}
function notice(text){return field('p','family-note',text)}
function toast(text){
 const area=dialog?.querySelector('#familyStatus');
 if(area)area.textContent=text;
}
async function compressed(file,limit,square){
 if(!file?.type?.startsWith('image/')||file.size>LIMIT)throw Error('Выбери изображение до 12 МБ.');
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Изображение не открылось'));img.src=url});
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Canvas недоступен');
  let sw=img.naturalWidth,sh=img.naturalHeight,sx=0,sy=0;
  if(square){
   const cut=Math.min(sw,sh);sx=(sw-cut)/2;sy=(sh-cut)/2;sw=cut;sh=cut;
   canvas.width=limit;canvas.height=limit;
  }else{
   const factor=Math.min(1,limit/Math.max(sw,sh));
   canvas.width=Math.max(1,Math.round(sw*factor));canvas.height=Math.max(1,Math.round(sh*factor));
  }
  ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.75);
 }finally{URL.revokeObjectURL(url)}
}
function database(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB'in window))return reject(Error('Хранилище фотографий недоступно'));
  const req=indexedDB.open(ROOM_DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('rooms'))req.result.createObjectStore('rooms')};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Ошибка хранилища'));
 });
}
async function removeRoomData(cid){
 const db=await database();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('rooms','readwrite'),req=tx.objectStore('rooms').delete(cid);
   req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error||Error('Не удалось удалить фото комнаты'));
  });
 }finally{db.close()}
}
async function roomData(cid,value){
 const db=await database();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('rooms',value===undefined?'readonly':'readwrite'),store=tx.objectStore('rooms');
   const req=value===undefined?store.get(cid):store.put(value,cid);
   req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||Error('Не удалось сохранить комнату'));
  });
 }finally{db.close()}
}
async function exportRoom(){
 const personData=person();
 const image=await roomData(personData.id).catch(()=>null);
 if(!image)return null;
 return {image,markers:personData.markers||{}};
}
async function importRoom(data){
 if(!data?.image||typeof data.image!=='string'||!data.image.startsWith('data:image/jpeg;base64,')||data.image.length>1250000)return false;
 const newMarkers={};
 for(const [k,v]of Object.entries(data.markers||{})){
  if(ITEMS[k]&&Number.isFinite(v?.x)&&Number.isFinite(v?.y)&&v.x>=0&&v.x<=100&&v.y>=0&&v.y<=100)newMarkers[k]={x:v.x,y:v.y};
 }
 try{
  await roomData(person().id,data.image);
  const all=catalog(),p=all.people.find(x=>x.id===current());
  p.roomActive=true;p.markers=newMarkers;
  if(!save(all))return false;
  await refreshRoom();return true;
 }catch(_){return false}
}
function open(view){
 if(!dialog)return;
 section=CLOUD?'room':(view==='room'?'room':'people');
 draw();if(!dialog.open)dialog.showModal();
}
function draw(){
 if(!dialog)return;
 dialog.querySelector('#familyTitle').textContent=CLOUD?'Фотографическая комната':'Мои персонажи и связи';
 const nav=dialog.querySelector('#familyNav');nav.replaceChildren();
 for(const [key,name] of (CLOUD?[['room','Комната']]:[['people','Персонажи'],['room','Комната'],['links','Связи']])){
  const b=button(name,()=>{section=key;draw()},section===key?'primary':'secondary');
  nav.append(b);
 }
 const body=dialog.querySelector('#familyBody');body.replaceChildren();
 if(section==='people')drawPeople(body);
 else if(section==='room')drawRoom(body);
 else drawLinks(body);
}
function drawPeople(body){
 const data=catalog();
 body.append(notice('Локальные профили на этом устройстве. Это не вход по паролю и не синхронизация. При смене профиля прогресс сохраняется отдельно. Доступ к детскому профилю пока не защищён.'));
 for(const p of data.people){
  const card=field('section','family-card');
  const head=field('div','family-row');
  const avatar=field('div','family-avatar',p.avatar?'':'👤');
  if(p.avatar)avatar.style.backgroundImage='url('+p.avatar+')';
  const detail=field('div','family-grow');
  detail.append(field('strong','',p.name),field('small','',p.type==='child'?'Детский локальный профиль':'Локальный профиль'));
  head.append(avatar,detail);
  if(current()===p.id)head.append(field('span','family-current','Активен'));
  else head.append(button('Открыть',()=>switchTo(p.id)));
  card.append(head);
  if(current()===p.id){
   const name=field('input','family-text');
   name.setAttribute('aria-label','Имя персонажа');name.maxLength=50;name.value=p.name;
   card.append(name,button('Сохранить имя',()=>{
    const v=name.value.trim();if(!v)return toast('Введите имя');
    const next=catalog(),match=next.people.find(x=>x.id===p.id);
    match.name=v.slice(0,50);if(save(next)){updateHeader();draw()}
   }));
   const lab=field('label','family-upload','📷 Фото персонажа (портрет)');
   const input=field('input');input.type='file';input.accept='image/*';input.setAttribute('aria-label','Загрузить фотографию персонажа');
   input.addEventListener('change',async()=>{
    try{
     const picture=await compressed(input.files?.[0],256,true);
     const next=catalog(),item=next.people.find(x=>x.id===p.id);
     item.avatar=picture;
     if(save(next)){updateHeader();draw();toast('Портрет сохранён в браузере. Автоматическая 3D-модель не создавалась.')}
    }catch(e){toast('Фото: '+e.message)}
   });
   lab.append(input);card.append(lab);
   if(p.avatar)card.append(button('Удалить портрет',()=>{
    if(!confirm('Удалить фотографию этого персонажа с устройства?'))return;
    const next=catalog();next.people.find(x=>x.id===p.id).avatar='';
    if(save(next)){updateHeader();draw()}
   }));
  }
  body.append(card);
 }
 const create=field('form','family-card');
 create.append(field('strong','','Добавить члена семьи'));
 const name=field('input','family-text');name.placeholder='Имя';name.required=true;name.maxLength=50;name.setAttribute('aria-label','Имя нового персонажа');
 const role=field('select','family-text');role.setAttribute('aria-label','Тип профиля');
 for(const [value,text] of [['child','Ребёнок'],['adult','Взрослый']]){
  const o=document.createElement('option');o.value=value;o.textContent=text;role.append(o);
 }
 create.append(name,role);
 const submit=field('button','primary','Создать локальный профиль');submit.type='submit';create.append(submit);
 create.addEventListener('submit',ev=>{
  ev.preventDefault();
  const value=name.value.trim();if(!value)return;
  const next=catalog(),newId=id();
  next.people.push({id:newId,name:value.slice(0,50),type:role.value,createdAt:new Date().toISOString(),avatar:'',roomActive:false,markers:{}});
  if(role.value==='child')next.links.push({from:PRIMARY,to:newId,type:'parent',createdAt:new Date().toISOString()});
  if(save(next)){draw();toast('Создан отдельный локальный профиль. На другом телефоне его пока не видно.')}
 });
 body.append(create);
}
function switchTo(cid){
 if(cid===current())return;
 if(!confirm('Открыть другой локальный профиль? Несохранённые изменения формы могут потеряться.'))return;
 try{localStorage.setItem(ACTIVE,cid);location.reload()}catch(e){toast('Не удалось переключить профиль: '+e.message)}
}
function drawRoom(body){
 const p=person();
 body.append(notice('Фото станет фоном интерактивной комнаты. Отметь на нём мебель и предметы: их действия останутся прежними. Это фотографическая комната, а не автоматически созданная 3D-модель.'));
 const label=field('label','family-upload','🏠 Выбрать фотографию комнаты');
 const input=field('input');input.type='file';input.accept='image/*';input.setAttribute('aria-label','Фото комнаты');
 input.addEventListener('change',async()=>{
  try{
   const picture=await compressed(input.files?.[0],1280,false);
   await roomData(p.id,picture);
   const next=catalog();const item=next.people.find(x=>x.id===p.id);
   item.roomActive=true;
   if(save(next)){await refreshRoom();draw();toast('Комната сохранена только на этом устройстве.')}
  }catch(e){toast('Комната: '+e.message)}
 });
 label.append(input);body.append(label);
 const buttons=field('div','family-row');
 buttons.append(button(p.roomActive?'Показать обычную комнату':'Показать мою комнату',async()=>{
  const next=catalog();const target=next.people.find(x=>x.id===p.id);
  if(!target.roomActive && !(await roomData(p.id).catch(()=>null)))return toast('Сначала загрузи фото комнаты.');
  target.roomActive=!target.roomActive;
  if(save(next)){await refreshRoom();draw()}
 }));
 buttons.append(button('Удалить фото комнаты',async()=>{
  if(!confirm('Удалить фотографию комнаты и расположение интерактивных предметов?'))return;
  try{
   await removeRoomData(p.id);
   const next=catalog(),target=next.people.find(x=>x.id===p.id);
   target.roomActive=false;target.markers={};
   if(save(next)){placing=null;await refreshRoom();draw();toast('Фотография комнаты удалена с устройства.')}
  }catch(e){toast('Удаление: '+e.message)}
 }));
 body.append(buttons);
 const select=field('select','family-text');select.setAttribute('aria-label','Предмет для размещения');
 for(const [value,title] of Object.entries(ITEMS)){const o=field('option','',title);o.value=value;select.append(o)}
 body.append(select,button('📍 Указать место предмета на фото',async()=>{
  if(!(await roomData(p.id).catch(()=>null)))return toast('Сначала загрузи фото комнаты.');
  const next=catalog();next.people.find(x=>x.id===p.id).roomActive=true;
  if(!save(next))return;
  placing=select.value;await refreshRoom();dialog.close();
  alert('Коснись нужного места на фотографии, чтобы разместить «'+ITEMS[placing]+'».');
 }));
 const count=Object.keys(p.markers||{}).length;
 body.append(notice('Размещено предметов: '+count+'. Чтобы переместить предмет, выбери его и коснись нового места. Фотография не передаётся на сервер.'));
}
function drawLinks(body){
 const data=catalog(),active=person();
 body.append(notice('Сейчас связи работают между локальными профилями этого браузера. Дружба между телефонами потребует подтверждения приглашения после подключения облачных аккаунтов.'));
 const relevant=data.links.filter(x=>x.from===active.id||x.to===active.id);
 for(const r of relevant){
  const opposite=data.people.find(p=>p.id===(r.from===active.id?r.to:r.from));
  if(!opposite)continue;
  const title={parent:'Родитель и ребёнок',friend:'Друзья',relative:'Родственники',colleague:'Коллеги'}[r.type]||r.type;
  body.append(field('p','family-link',opposite.name+' · '+title));
 }
 const others=data.people.filter(p=>p.id!==active.id);
 if(!others.length){body.append(notice('Добавь второго персонажа во вкладке «Персонажи».'));return}
 const linkForm=field('form','family-card');
 linkForm.append(field('strong','','Создать связь'));
 const who=field('select','family-text');who.setAttribute('aria-label','С кем установить связь');
 for(const p of others){const opt=field('option','',p.name);opt.value=p.id;who.append(opt)}
 const kind=field('select','family-text');kind.setAttribute('aria-label','Тип связи');
 for(const [value,label] of [['friend','Дружеская'],['relative','Родственная'],['colleague','Коллегиальная']]){
  const option=field('option','',label);option.value=value;kind.append(option);
 }
 const submit=field('button','primary','Добавить связь');submit.type='submit';
 linkForm.append(who,kind,submit);
 linkForm.addEventListener('submit',event=>{
  event.preventDefault();
  const next=catalog(),other=who.value,type=kind.value;
  const duplicate=next.links.some(x=>x.type===type&&((x.from===active.id&&x.to===other)||(x.to===active.id&&x.from===other)));
  if(duplicate)return toast('Такая связь уже есть');
  next.links.push({from:active.id,to:other,type,createdAt:new Date().toISOString()});
  if(save(next)){draw();toast('Связь добавлена локально.')}
 });
 body.append(linkForm);
 const care=field('section','family-card');
 care.append(field('strong','','❤️ Забота о близком'));
 const target=field('select','family-text');target.setAttribute('aria-label','О ком позаботились');
 for(const p of others){const opt=field('option','',p.name);opt.value=p.id;target.append(opt)}
 const action=field('select','family-text');action.setAttribute('aria-label','Действие заботы');
 for(const item of ['Провести время вместе','Помочь с делом','Поддержать и выслушать','Позаботиться о быте']){
  const opt=field('option','',item);opt.value=item;action.append(opt)
 }
 care.append(target,action,button('Записать заботу',()=>{
  const next=catalog(),now=Date.now();
  const pair=next.care.filter(x=>x.from===active.id&&x.to===target.value&&localDay(new Date(x.at))===localDay(new Date()));
  if(pair.length>=3)return toast('За сегодня уже записаны 3 действия заботы об этом человеке.');
  next.care.push({id:id(),from:active.id,to:target.value,action:action.value,at:new Date().toISOString()});
  next.care=next.care.slice(-2000);
  if(save(next)){window.LifeSimsFamilyBridge?.refresh?.();draw();toast('❤️ Игровой ресурс: +5 получателю, +3 тому, кто заботился, на 24 часа.')}
 }));
 care.append(notice('Игровой эффект: +5 пунктов получателю и +3 заботящемуся на 24 часа, максимум +18. Не является оценкой здоровья или отношений.'));
 body.append(care);
 const entries=data.care.filter(x=>x.from===active.id||x.to===active.id).slice(-8).reverse();
 if(entries.length){
  body.append(field('strong','','Недавняя забота'));
  for(const item of entries){
   const from=data.people.find(p=>p.id===item.from)?.name||'Персонаж';
   const to=data.people.find(p=>p.id===item.to)?.name||'Персонаж';
   body.append(field('p','family-link',from+' → '+to+' · '+item.action+' · '+localDay(new Date(item.at))));
  }
 }
}
function updateHeader(){
 if(CLOUD)return; // Cloud identity owns the account portrait and display name.
 const profile=person(),title=document.querySelector('.topbar .person strong'),portrait=document.getElementById('portraitBtn');
 if(title)title.textContent='LifeSims · '+profile.name;
 if(portrait){
  portrait.title='Персонаж: '+profile.name;
  portrait.style.backgroundSize='cover';
  portrait.textContent='';
  if(profile.avatar)portrait.style.backgroundImage='url('+profile.avatar+')';
  else if(profile.id===PRIMARY)portrait.style.removeProperty('background-image');
  else{portrait.style.backgroundImage='none';portrait.textContent='👤'}
 }
}
async function refreshRoom(){
 const scene=document.getElementById('scene');if(!scene)return;
 if(roomOverlay){roomOverlay.remove();roomOverlay=null}
 scene.classList.remove('family-room-active');
 const profile=person();if(!profile.roomActive)return;
 let photo;
 try{photo=await roomData(profile.id)}catch(_){return}
 if(!photo)return;
 const root=field('div','family-photo-room');root.style.backgroundImage='url('+photo+')';
 root.setAttribute('aria-label','Моя интерактивная комната по фотографии');
 for(const [object,pos] of Object.entries(profile.markers||{})){
  if(!ITEMS[object]||!Number.isFinite(pos?.x)||!Number.isFinite(pos?.y))continue;
  const marker=button(ITEMS[object],event=>{
   event.stopPropagation();
   window.LifeSimsFamilyBridge?.openObject?.(object,marker);
  },'family-marker');
  marker.style.left=Math.max(1,Math.min(96,pos.x))+'%';
  marker.style.top=Math.max(3,Math.min(94,pos.y))+'%';
  root.append(marker);
 }
 const tools=field('div','family-room-tools');
 tools.append(button('⚙ Настроить комнату',()=>{section='room';draw();dialog.showModal()},'secondary'));
 tools.append(button('Обычная комната',()=>{
  const next=catalog();next.people.find(p=>p.id===profile.id).roomActive=false;
  if(save(next)){placing=null;refreshRoom()}
 },'secondary'));
 root.append(tools);
 root.addEventListener('click',event=>{
  if(!placing||event.target.closest('button'))return;
  const bounds=root.getBoundingClientRect();
  const x=(event.clientX-bounds.left)/bounds.width*100,y=(event.clientY-bounds.top)/bounds.height*100;
  const next=catalog(),target=next.people.find(p=>p.id===profile.id);
  target.markers??={};target.markers[placing]={x:Math.round(x*10)/10,y:Math.round(y*10)/10};
  if(save(next)){placing=null;refreshRoom()}
 });
 scene.append(root);roomOverlay=root;scene.classList.add('family-room-active');
}
function start(){
 // There is only one account/character entry point in the header: LifeSims Cloud's "Семья".
 // Preserve legacy local characters and private photo rooms behind that single entry.
 dialog=document.createElement('dialog');dialog.className='family-dialog';dialog.id='familyDialog';
 dialog.innerHTML='<header class="family-heading"><strong id="familyTitle">Персонажи и связи</strong><button type="button" id="familyClose" aria-label="Закрыть">×</button></header><div class="family-nav" id="familyNav"></div><div id="familyBody"></div><p id="familyStatus" role="status" class="family-status"></p>';
 document.body.append(dialog);
 dialog.querySelector('#familyClose').onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 updateHeader();refreshRoom();
}
document.addEventListener('DOMContentLoaded',start);
})();
