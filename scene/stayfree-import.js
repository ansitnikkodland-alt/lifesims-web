/* StayFree CSV -> LifeSims calendar, local-only import; no cloud upload. */
(()=>{'use strict';
const bridge=window.LifeSimsScreenTimeBridge,history=document.getElementById('history');
if(!bridge||!history)return;
const $=(id)=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
const button=(label,fn,cls='secondary')=>{const node=el('button',cls,label);node.type='button';node.addEventListener('click',fn);return node;};
function norm(v){return String(v||'').trim().toLocaleLowerCase('ru').replace(/[ _\-\.\(\)]/g,'').replace(/\s+/g,'');}
function parseCSV(text){
 const content=String(text||'').replace(/^\uFEFF/,'');
 const sample=content.split(/\r?\n/).slice(0,15).join('\n');
 const candidates=[',',';','\t'];
 const score=(separator)=>{
  let quote=false,counts=[],n=0;for(let i=0;i<sample.length;i++){
   const c=sample[i];if(c==='"'){if(quote&&sample[i+1]==='"'){i++;continue;}quote=!quote;}
   else if(!quote&&c===separator)n++;
   else if(!quote&&(c==='\n'||c==='\r')){if(n>0)counts.push(n);n=0;if(c==='\r'&&sample[i+1]==='\n')i++;}
  }if(n)counts.push(n);
  return counts.length?counts.length*3+Math.min(30,counts.reduce((a,b)=>a+b,0)):0;
 };
 const separator=candidates.sort((a,b)=>score(b)-score(a))[0];
 const lines=[];let record=[],cell='',quote=false;
 for(let i=0;i<content.length;i++){
  const c=content[i];
  if(c==='"'){
   if(quote&&content[i+1]==='"'){cell+='"';i++;}else quote=!quote;
  }else if(!quote&&c===separator){record.push(cell);cell='';}
  else if(!quote&&(c==='\n'||c==='\r')){
   record.push(cell);cell='';if(record.some(x=>x.trim()))lines.push(record);record=[];
   if(c==='\r'&&content[i+1]==='\n')i++;
  }else cell+=c;
  if(lines.length>60000)throw Error('Слишком много строк CSV (максимум 60 000).');
 }
 if(quote)throw Error('Некорректный CSV: незакрытая кавычка.');
 record.push(cell);if(record.some(x=>x.trim()))lines.push(record);
 if(!lines.length)throw Error('CSV пуст.');
 return {lines,separator};
}
const labels={
 date:['date','day','usage date','record date','datetime','дата','день','дата использования'],
 app:['app','application','app name','application name','title','name','package','package name','приложение','название приложения','имя приложения','название'],
 duration:['duration','usage','usage time','time used','screen time','total usage','use time','foreground time','total time','time spent','minutes','min','seconds','время','длительность','использование','время использования','время в приложении','общее время'],
 device:['device','device name','устройство','название устройства'],
 package:['package','package name','package id','app package','package_name','идентификатор пакета']
};
function detectHeader(lines){
 let best={index:0,score:-1};
 for(let i=0;i<Math.min(lines.length,16);i++){
  const headers=lines[i].map(norm);
  const found={};for(const [kind,list] of Object.entries(labels)){const x=headers.findIndex(s=>list.some(v=>norm(v)===s));if(x>=0)found[kind]=x}
  const dateCols=lines[i].filter(h=>/^\d{4}[-/.]\d\d?[-/.]\d\d?$/.test(String(h).trim())).length;
  const score=(found.app!==undefined?5:0)+(found.date!==undefined?3:0)+(found.duration!==undefined?5:0)+(found.device!==undefined?1:0)+Math.min(3,dateCols)+(lines[i].length>=3?1:0);
  if(score>best.score)best={index:i,score,found,dateCols};
 }
 return best;
}
function parseDate(raw,fmt){
 const value=String(raw||'').trim().replace(/^["']|["']$/g,'');
 let y,m,d;
 if(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T].*)?$/.test(value)){
  const items=value.slice(0,10).split(/[-/.]/).map(Number);[y,m,d]=items;
 }else if(/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}(?:[ T].*)?$/.test(value)){
  let items=value.slice(0,10).split(/[-/.]/).map(Number);
  if(fmt==='mdy')[m,d,y]=items;else [d,m,y]=items;
 }else return null;
 if(y<2000||y>2100||m<1||m>12||d<1||d>31)return null;
 const dt=new Date(Date.UTC(y,m-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
 return [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function parseDuration(raw,unit,header=''){
 const val=String(raw??'').trim().toLowerCase().replace(/\u00a0/g,' ');
 if(!val||val==='—'||val==='-')return null;
 const h=norm(header);
 if(/^\d+(?:[.,]\d+)?$/.test(val)){
  const n=Number(val.replace(',','.'));if(!Number.isFinite(n))return null;
  const detected=unit==='auto'?(/millisecond|миллисек|usage\(ms\)/i.test(header)?'ms':/seconds?|секунд|_sec|sec$/.test(h)?'sec':/hours?|час|hr$/.test(h)?'hours':'min'):unit;
  return Math.round(n*(detected==='ms'?0.001:detected==='sec'?1:detected==='hours'?3600:60));
 }
 const colon=val.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/);
 if(colon){
  const a=+colon[1],b=+colon[2],c=colon[3]==null?null:+colon[3];
  return c!==null?a*3600+b*60+c:unit==='mmss'?a*60+b:a*3600+b*60;
 }
 // Textual duration: '1h 20m 15s', '1 ч 20 мин', '2 hours 10 minutes'
 const parsed=[...val.matchAll(/(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|час(?:а|ов)?|ч|minutes?|mins?|m|мин(?:уты|ут)?|seconds?|secs?|s|сек(?:унды|унд)?)/g)];
 if(parsed.length){
  let sec=0;for(const x of parsed){
   const n=Number(x[1].replace(',','.')),u=x[2];
   sec+=n*(/^(h|hr|hour|час|ч)/.test(u)?3600:/^(m|min|мин)/.test(u)?60:1);
  }return Math.round(sec);
 }
 return null;
}
function makeRecords(parsed,headerIndex,mapping,options){
 const headers=parsed.lines[headerIndex]||[];
 const dateId=Number(mapping.date),appId=Number(mapping.app),durationId=Number(mapping.duration);
 const deviceId=mapping.device===''?-1:Number(mapping.device),pkgId=mapping.package===''?-1:Number(mapping.package);
 const wide=dateId<0?headers.map((h,index)=>({index,date:parseDate(h,options.dateFormat)})).filter(x=>x.date):[];
 if(appId<0||(!wide.length&&(dateId<0||durationId<0)))throw Error('Укажи колонки приложения, даты и времени или используй CSV с датами в заголовках.');
 const rows=new Map();let ignored=0,invalid=0;
 function add(day,name,packageName,device,seconds){
  if(!day||!name||!Number.isFinite(seconds)||seconds<0||seconds>86400){invalid++;return}
  if(!seconds){ignored++;return}
  if(/^(total|summary|all apps|overall|всего|итого|сумма)$/i.test(name.trim())){ignored++;return}
  const app=name.trim().slice(0,110),pkg=packageName.trim().slice(0,120),dev=device.trim().slice(0,100);
  const key=[day,(pkg||app).toLocaleLowerCase('ru'),dev.toLocaleLowerCase('ru')].join('||');
  const old=rows.get(key);if(old)old.seconds+=seconds;
  else rows.set(key,{date:day,app,packageName:pkg,device:dev,seconds,source:'stayfree'});
 }
 for(const record of parsed.lines.slice(headerIndex+1)){
  const app=String(record[appId]||'').trim();
  const pkg=pkgId>=0?String(record[pkgId]||''):'';
  const device=deviceId>=0?String(record[deviceId]||''):'';
  if(!app&&!pkg){ignored++;continue}
  if(wide.length){
   for(const col of wide){
    const sec=parseDuration(record[col.index],options.unit,headers[col.index]);
    if(sec===null){if(String(record[col.index]||'').trim())invalid++;continue}
    add(col.date,app||pkg,pkg,device,sec);
   }
  }else{
   const day=parseDate(record[dateId],options.dateFormat);
   const sec=parseDuration(record[durationId],options.unit,headers[durationId]);
   if(!day||sec===null){invalid++;continue}
   add(day,app||pkg,pkg,device,sec);
  }
 }
 const entries=[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||b.seconds-a.seconds);
 if(entries.length>20000)throw Error('Слишком много отдельных записей (20 000). Выбери меньший диапазон в StayFree.');
 if(entries.some(x=>x.seconds>86400))throw Error('Суммарное время одного приложения превышает 24 часа в сутки. Проверь файл и единицы длительности.');
 if(!entries.length)throw Error('Не удалось получить записи. Проверь соответствие колонок, формат дат и единицы времени.');
 return {entries,invalid,ignored,wide:wide.length>0};
}
const fmt=s=>{let sec=Math.round(Number(s)||0),h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60);return h?h+' ч '+m+' мин':m?m+' мин':sec+' сек'};
const panel=el('details','sf-import');panel.id='sfImport';
const summary=el('summary','', '📱 Импорт экранного времени · StayFree');panel.append(summary);
panel.append(el('p','sf-hint','Загрузи экспорт CSV из StayFree. Файл обрабатывается только в браузере. В календарь добавятся дневные итоги по приложениям — без выдуманных часов запуска.'));
const fileLabel=el('label','sf-label','Выбрать CSV из StayFree');
const file=el('input');file.type='file';file.accept='.csv,.txt,text/csv,text/plain';file.id='sfFile';fileLabel.append(file);panel.append(fileLabel);
const options=el('div','sf-import-options');panel.append(options);
const headerLabel=el('label','sf-label','Строка с названиями колонок');
const headerSelect=el('select');headerSelect.id='sfHeaderRow';headerLabel.append(headerSelect);options.append(headerLabel);
const config={};function selectOpt(label,key,values){
 const wrap=el('label','sf-label',label),select=el('select');select.id='sf'+key;
 for(const [value,name] of values){const opt=el('option','',name);opt.value=value;select.append(opt)}
 wrap.append(select);options.append(wrap);config[key]=select;return select;
}
selectOpt('Формат даты','dateFormat',[['dmy','ДД.ММ.ГГГГ или DD/MM/YYYY'],['mdy','MM/DD/YYYY (США)']]);
selectOpt('Время (числовые значения)','unit',[['auto','Авто (обычно минуты)'],['min','Минуты'],['sec','Секунды'],['ms','Миллисекунды'],['hours','Часы'],['hhmm','HH:MM'],['mmss','MM:SS']]);
const mappingBox=el('div','sf-column-grid');options.append(mappingBox);
const specs=[['app','Приложение'],['date','Дата'],['duration','Длительность'],['device','Устройство (необязательно)'],['package','Package ID (необязательно)']];
const selects={};
for(const [key,label] of specs){const wrap=el('label','sf-label',label),select=el('select');select.id='sfMap'+key;wrap.append(select);mappingBox.append(wrap);selects[key]=select}
options.hidden=true;
const preview=el('div','sf-preview');preview.hidden=true;panel.append(preview);
const actions=el('div','sf-actions');
const confirm=button('Импортировать в LifeSims',()=>commit(),'primary');confirm.disabled=true;
const view=button('Посмотреть день в календаре',()=>{if(lastImportedDay)bridge.openAgenda(lastImportedDay)},'secondary');
view.hidden=true;actions.append(confirm,view);panel.append(actions);
const status=el('p','sf-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');panel.append(status);
const calendar=$('calendar');if(calendar)history.insertBefore(panel,calendar);else history.append(panel);
let parsed=null,headerIndex=0,pending=null,filename='',lastImportedDay=null;
function updateOptions(){
 if(!parsed)return;
 const head=parsed.lines[headerIndex]||[];
 const detected=detectHeader([head]).found||{};
 for(const [key,label] of specs){
  const sel=selects[key];sel.replaceChildren();
  const none=el('option','','— не выбрано —');none.value='-1';sel.append(none);
  for(let n=0;n<head.length;n++){const option=el('option','', (n+1)+'. '+(head[n]||'(пустое имя)'));option.value=String(n);sel.append(option)}
  const index=detected[key]??-1;sel.value=String(index);
 }
 // A detected package column can still be used as the name fallback.
 if(selects.app.value==='-1'&&detected.package!==undefined)selects.app.value=String(detected.package);
 if(selects.date.value==='-1'&&head.some(h=>parseDate(h,'dmy')))selects.date.value='-1';
}
function mappings(){return Object.fromEntries(specs.map(([key])=>[key,selects[key].value]))}
function buildPreview(){
 confirm.disabled=true;pending=null;preview.hidden=true;
 if(!parsed)return;
 try{
  const result=makeRecords(parsed,headerIndex,mappings(),{unit:config.unit.value,dateFormat:config.dateFormat.value});
  const days=[...new Set(result.entries.map(x=>x.date))].sort();
  const seconds=result.entries.reduce((sum,x)=>sum+x.seconds,0);
  pending=result.entries;preview.replaceChildren();preview.hidden=false;
  preview.append(el('strong','','Найдено '+result.entries.length+' приложений/дат за '+days.length+' дней · '+fmt(seconds)));
  preview.append(el('p','sf-hint','Период: '+days[0]+' — '+days[days.length-1]+'. Нераспознано строк: '+result.invalid+
   '. Пропущено: '+result.ignored+'. Повторный импорт обновляет дневные значения, не создаёт дубликаты.'));
  const list=el('ul','sf-samples');
  for(const row of result.entries.slice(0,7)){list.append(el('li','',row.date+' · '+row.app+' · '+fmt(row.seconds)+(row.device?' · '+row.device:'')))}
  preview.append(list);
  status.textContent='Проверь даты и длительность перед подтверждением. Прежние записи LifeSims не удаляются.';
  confirm.disabled=false;
 }catch(e){status.textContent='⚠ '+e.message}
}
async function load(){
 pending=null;confirm.disabled=true;preview.hidden=true;parsed=null;lastImportedDay=null;view.hidden=true;
 const chosen=file.files?.[0];if(!chosen){options.hidden=true;return}
 if(chosen.size>4_000_000){status.textContent='CSV больше 4 МБ. Экспортируй меньший диапазон.';return}
 try{
  const raw=await chosen.text();parsed=parseCSV(raw);filename=chosen.name;
  const header=detectHeader(parsed.lines);headerIndex=header.index;
  headerSelect.replaceChildren();
  for(let n=0;n<Math.min(16,parsed.lines.length);n++){
   const cells=parsed.lines[n]||[];
   const option=el('option','',(n+1)+'. '+cells.slice(0,3).join(' · ').slice(0,110));
   option.value=String(n);headerSelect.append(option);
  }
  headerSelect.value=String(headerIndex);
  options.hidden=false;updateOptions();buildPreview();
  if(header.score<7)status.textContent='Колонки CSV определены неуверенно. Выбери их вручную и проверь предварительный просмотр.';
 }catch(e){status.textContent='⚠ '+e.message;options.hidden=true}
}
file.addEventListener('change',()=>{load().catch(e=>status.textContent='⚠ '+e.message)});
for(const sel of [...Object.values(selects),...Object.values(config)])sel.addEventListener('change',buildPreview);
headerSelect.addEventListener('change',()=>{headerIndex=Number(headerSelect.value);updateOptions();buildPreview()});
function commit(){
 if(!pending?.length)return;
 const result=bridge.commit(pending,filename);if(!result?.ok){status.textContent='⚠ '+(result?.error||'Не удалось сохранить данные');return}
 status.textContent='✓ Импорт сохранён: '+result.added+' новых, '+result.updated+' обновлённых, '+result.unchanged+' без изменений.';
 lastImportedDay=pending.reduce((max,x)=>x.date>max?x.date:max,pending[0].date);
 view.hidden=false;confirm.disabled=true;pending=null;
 bridge.refresh();
}
function entriesForDate(date){return (bridge.read(date)||[]).filter(x=>x?.source==='stayfree').sort((a,b)=>b.seconds-a.seconds)}
function renderAgenda(date,container){
 const rows=entriesForDate(date);if(!rows.length)return 0;
 const heading=el('div','agenda-group-title','📱 Экранное время · '+fmt(rows.reduce((sum,x)=>sum+x.seconds,0)));
 container.append(heading);
 for(const row of rows){
  const line=el('div','agenda-entry sf-calendar-line');
  const icon=el('span','agenda-time','📱'),text=el('div','agenda-event-main');
  text.append(el('div','agenda-event-title',row.app),el('div','agenda-event-meta',fmt(row.seconds)+(row.device?' · '+row.device:'')+' · StayFree · итог за день'));
  line.append(icon,text);container.append(line);
 }
 return rows.length;
}
function appendHistory(date,container){
 const rows=entriesForDate(date);if(!rows.length)return 0;
 const part=el('div','history-activity-line sf-summary-line');
 const body=el('div','','📱 StayFree: '+fmt(rows.reduce((sum,x)=>sum+x.seconds,0))+' · '+rows.length+' приложений');
 const view=button('Показать',()=>{const d=$('historyDate');if(d)d.value=date;window.LifeSimsScreenTimeBridge.openAgenda(date)},'secondary');
 part.append(body,view);container.append(part);return rows.length;
}
function hasDay(date){return entriesForDate(date).length>0}
window.LifeSimsScreenTime={parseCSV,detectHeader,parseDate,parseDuration,makeRecords,renderAgenda,appendHistory,hasDay};
})();
